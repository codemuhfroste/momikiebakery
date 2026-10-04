import 'dart:async';
import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'models.dart';

// Release builds talk to the deployed site. For a local dev server on an
// Android emulator (which reaches the host's localhost at 10.0.2.2):
//   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
const defaultBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'https://momikiebakery.vercel.app');

/// Everything the app knows, and the offline-first sync engine.
///
/// How offline works:
///  1. Every sale and credit payment is saved on the phone first (the
///     "outbox"), with a random id, and its effect (stock down, balance up)
///     is applied to the phone's copy of the catalog straight away — so the
///     register keeps working in a blackout.
///  2. Whenever there is a connection (on start, when Wi-Fi/data comes back,
///     every minute while anything is waiting, or "Sync now"), the outbox is
///     sent oldest first. The server records each item once even if it is
///     sent twice (see /api/mobile/sync), so a dropped connection mid-sync
///     can never double a sale.
///  3. Items the server recorded are removed and their receipt numbers kept
///     under "Recently synced". Items it couldn't accept stay on the phone
///     under "Needs attention" with the reason, until someone retries or
///     removes them. Nothing is ever silently dropped.
///  4. After a sync the catalog is refreshed from the server, then the effects
///     of anything still waiting are re-applied on top.
class AppState extends ChangeNotifier with WidgetsBindingObserver {
  AppState({Api? api, Connectivity? connectivity, this.autoSync = true})
      : api = api ?? Api(defaultBaseUrl),
        _connectivity = connectivity; // ignore: prefer_initializing_formals

  final Api api;
  final Connectivity? _connectivity;
  final bool autoSync;
  late SharedPreferences _prefs;

  bool ready = false;
  String? meName;
  String? meRole;
  List<Product> products = [];
  List<Customer> customers = [];
  List<PendingSale> pendingSales = [];
  List<PendingPayment> pendingPayments = [];
  List<SyncedReceipt> recentReceipts = [];
  List<ServerSale> serverSales = [];
  DateTime? lastSyncAt;
  DateTime? catalogAt;

  /// The server is in demo mode (shows the "for demo purposes only" banner).
  bool demo = false;

  /// Credit payments recorded on the server today (Credit Accounts figure).
  double paymentsToday = 0;

  bool online = true;
  bool syncing = false;
  bool needsLogin = false;
  String? lastError;

  StreamSubscription<List<ConnectivityResult>>? _connSub;
  Timer? _timer;

  bool get signedIn => api.token != null;
  int get waitingCount =>
      pendingSales.where((s) => s.status == 'pending').length + pendingPayments.where((p) => p.status == 'pending').length;
  int get attentionCount =>
      pendingSales.where((s) => s.status == 'rejected').length + pendingPayments.where((p) => p.status == 'rejected').length;

  // ---------------------------------------------------------------- startup

  Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
    api.baseUrl = _prefs.getString('baseUrl') ?? api.baseUrl;
    api.token = _prefs.getString('token');
    meName = _prefs.getString('meName');
    meRole = _prefs.getString('meRole');
    products = _readList('products', Product.fromJson);
    customers = _readList('customers', Customer.fromJson);
    pendingSales = _readList('outboxSales', PendingSale.fromJson);
    pendingPayments = _readList('outboxPayments', PendingPayment.fromJson);
    recentReceipts = _readList('recentReceipts', SyncedReceipt.fromJson);
    serverSales = _readList('serverSales', ServerSale.fromJson);
    serverSalesDate = _prefs.getString('serverSalesDate');
    lastSyncAt = DateTime.tryParse(_prefs.getString('lastSyncAt') ?? '');
    demo = _prefs.getBool('demo') ?? false;
    paymentsToday = _prefs.getDouble('paymentsToday') ?? 0;
    catalogAt = DateTime.tryParse(_prefs.getString('catalogAt') ?? '');
    ready = true;
    notifyListeners();

    if (autoSync) {
      WidgetsBinding.instance.addObserver(this);
      _connSub = (_connectivity ?? Connectivity()).onConnectivityChanged.listen((results) {
        final connected = results.any((r) => r != ConnectivityResult.none);
        if (!connected) {
          _setOnline(false);
        } else {
          unawaited(syncNow());
        }
      });
      _timer = Timer.periodic(const Duration(minutes: 1), (_) {
        final stale = catalogAt == null || DateTime.now().difference(catalogAt!) > const Duration(minutes: 10);
        if (waitingCount > 0 || stale) unawaited(syncNow());
      });
      if (signedIn) unawaited(syncNow());
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && signedIn) unawaited(syncNow());
  }

  @override
  void dispose() {
    _connSub?.cancel();
    _timer?.cancel();
    if (autoSync) WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // ---------------------------------------------------------------- account

  Future<void> setBaseUrl(String url) async {
    api.baseUrl = url.trim().isEmpty ? defaultBaseUrl : url.trim();
    await _prefs.setString('baseUrl', api.baseUrl);
    notifyListeners();
  }

  /// Needs a connection the first time. After that the token is kept, so the
  /// app opens and rings up sales even with no signal.
  Future<void> login(String role, String pin) async {
    final res = await api.login(role: role, pin: pin);
    api.token = res['token'] as String;
    meName = '${res['name']}';
    meRole = '${res['role']}';
    needsLogin = false;
    await _prefs.setString('token', api.token!);
    await _prefs.setString('meName', meName!);
    await _prefs.setString('meRole', meRole!);
    _setOnline(true);
    notifyListeners();
    await syncNow();
  }

  /// Signing out keeps anything still waiting to sync on the phone; it goes
  /// up the next time anyone signs in.
  Future<void> logout() async {
    api.token = null;
    meName = null;
    meRole = null;
    await _prefs.remove('token');
    await _prefs.remove('meName');
    await _prefs.remove('meRole');
    notifyListeners();
  }

  // ---------------------------------------------------------------- selling

  Customer? customerById(int? id) => id == null ? null : customers.where((c) => c.id == id).firstOrNull;

  /// Rings up a sale on the phone. Returns null on success, or a message.
  /// The same checks as the website's register, against the phone's copy of
  /// stock and balances.
  Future<String?> ringUpSale({
    required List<CartLine> cart,
    required double discount,
    required String method,
    required double amountTendered,
    int? customerId,
    String priceType = 'retail',
  }) async {
    if (cart.isEmpty) return 'The cart is empty.';
    if (cart.any((l) => l.qty <= 0 || l.unitPrice < 0)) return 'A cart line has an invalid quantity or price.';
    final subtotal = round2(cart.fold<double>(0, (s, l) => s + l.total));
    final disc = round2(discount.clamp(0, subtotal).toDouble());
    final total = round2(subtotal - disc);
    final isCredit = method == 'Credit';
    final customer = customerById(customerId);
    if (isCredit) {
      if (customer == null) return 'Choose the customer this sale is credited to.';
      if (amountTendered < 0) return "The down payment can't be negative.";
      if (amountTendered >= total) return 'The down payment covers the full total — use Cash instead.';
      final credit = round2(total - amountTendered);
      if (customer.available != null && credit > customer.available! + 0.004) {
        return 'This exceeds ${customer.name}\'s credit limit. Available credit: ₱${customer.available!.toStringAsFixed(2)}.';
      }
    } else if (method == 'Cash' && amountTendered < total) {
      return 'Cash received is less than the total.';
    }

    final sale = PendingSale(
      clientUuid: newClientId(),
      recordedAt: DateTime.now().toUtc(),
      items: [
        for (final l in cart)
          PendingSaleItem(
            productId: l.product.id,
            name: l.product.name,
            qty: l.pieces,
            packs: l.byPack ? l.qty : null,
            packName: l.byPack ? l.product.packName : null,
            packSize: l.byPack ? l.product.packSize : null,
            unitPrice: round2(l.unitPrice),
            srp: l.listPrice,
            barcode: l.product.barcode,
          ),
      ],
      discount: disc,
      paymentMethod: method,
      amountTendered: method == 'Cash' || isCredit ? round2(amountTendered) : total,
      customerId: isCredit ? customer!.id : null,
      customerName: isCredit ? customer!.name : null,
      total: total,
      priceType: priceType,
    );
    pendingSales.add(sale);
    _applySale(sale);
    await _saveOutbox();
    await _saveCatalog();
    notifyListeners();
    unawaited(syncNow());
    lastSale = sale;
    return null;
  }

  /// The most recent sale rung up — kept separately because it may sync (and
  /// leave the outbox) before the "Sale complete" screen has shown its change.
  PendingSale? lastSale;
  String? get lastRungUp => lastSale?.clientUuid;

  SyncedReceipt? receiptFor(String clientUuid) => recentReceipts.where((r) => r.clientUuid == clientUuid).firstOrNull;

  Future<String?> recordPayment({
    required Customer customer,
    required double amount,
    required String method,
    String? note,
  }) async {
    final a = round2(amount);
    if (a <= 0) return 'Enter an amount greater than zero.';
    if (a > round2(customer.balance) + 0.004) {
      return "That's more than the ₱${customer.balance.toStringAsFixed(2)} ${customer.name} owes.";
    }
    final payment = PendingPayment(
      clientUuid: newClientId(),
      recordedAt: DateTime.now().toUtc(),
      customerId: customer.id,
      customerName: customer.name,
      amount: a,
      method: method,
      note: (note ?? '').trim().isEmpty ? null : note!.trim(),
    );
    pendingPayments.add(payment);
    _applyPayment(payment);
    await _saveOutbox();
    await _saveCatalog();
    notifyListeners();
    unawaited(syncNow());
    return null;
  }

  // Effects of an outbox item on the phone's copy of the catalog.
  void _applySale(PendingSale s) {
    for (final i in s.items) {
      final idx = products.indexWhere((p) => p.id == i.productId);
      if (idx >= 0) products[idx] = products[idx].withStock(products[idx].stockQty - i.qty);
    }
    if (s.customerId != null) {
      final idx = customers.indexWhere((c) => c.id == s.customerId);
      if (idx >= 0) customers[idx] = customers[idx].withBalance(round2(customers[idx].balance + s.creditAmount), activity: s.recordedAt);
    }
  }

  void _applyPayment(PendingPayment p) {
    final idx = customers.indexWhere((c) => c.id == p.customerId);
    if (idx >= 0) customers[idx] = customers[idx].withBalance(round2(customers[idx].balance - p.amount), activity: p.recordedAt);
  }

  // ---------------------------------------------------------------- sync

  Future<void>? _inflight;

  /// Sends the outbox, then refreshes the catalog. Safe to call any time;
  /// overlapping calls share one run.
  Future<void> syncNow() {
    if (!signedIn) return Future.value();
    return _inflight ??= _sync().whenComplete(() => _inflight = null);
  }

  Future<void> _sync() async {
    syncing = true;
    notifyListeners();
    try {
      final sales = pendingSales.where((s) => s.status == 'pending').toList();
      final payments = pendingPayments.where((p) => p.status == 'pending').toList();
      if (sales.isNotEmpty || payments.isNotEmpty) {
        final res = await api.sync(
          sales: sales.map((s) => s.toWire()).toList(),
          payments: payments.map((p) => p.toWire()).toList(),
        );
        _applyResults(res);
        await _saveOutbox();
      }
      await _refreshCatalog();
      lastSyncAt = DateTime.now();
      await _prefs.setString('lastSyncAt', lastSyncAt!.toIso8601String());
      lastError = null;
      needsLogin = false;
      _setOnline(true);
      unawaited(refreshServerSales());
    } on ApiException catch (e) {
      if (e.network) {
        _setOnline(false);
      } else if (e.unauthorized) {
        needsLogin = true;
        lastError = 'Sign in again to send what is waiting. Nothing has been lost.';
      } else {
        lastError = e.message;
      }
    } finally {
      syncing = false;
      notifyListeners();
    }
  }

  void _applyResults(Json res) {
    for (final r in (res['sales'] as List? ?? const [])) {
      final m = r as Json;
      final sale = pendingSales.where((s) => s.clientUuid == m['clientUuid']).firstOrNull;
      if (sale == null) continue;
      if (m['status'] == 'ok') {
        pendingSales.remove(sale);
        recentReceipts.insert(
          0,
          SyncedReceipt(
            clientUuid: sale.clientUuid,
            receiptNo: '${m['receiptNo']}',
            total: sale.total,
            note: m['note'] as String?,
            recordedAt: sale.recordedAt,
          ),
        );
      } else {
        sale.status = 'rejected';
        sale.error = '${m['error'] ?? 'The server could not record this sale.'}';
      }
    }
    for (final r in (res['payments'] as List? ?? const [])) {
      final m = r as Json;
      final payment = pendingPayments.where((p) => p.clientUuid == m['clientUuid']).firstOrNull;
      if (payment == null) continue;
      if (m['status'] == 'ok') {
        pendingPayments.remove(payment);
      } else {
        payment.status = 'rejected';
        payment.error = '${m['error'] ?? 'The server could not record this payment.'}';
      }
    }
    if (recentReceipts.length > 50) recentReceipts = recentReceipts.sublist(0, 50);
  }

  Future<void> _refreshCatalog() async {
    final data = await api.bootstrap();
    products = (data['products'] as List).map((j) => Product.fromJson(j as Json)).toList();
    customers = (data['customers'] as List).map((j) => Customer.fromJson(j as Json)).toList();
    demo = data['demo'] == true;
    paymentsToday = (data['paymentsToday'] as num?)?.toDouble() ?? 0;
    await _prefs.setBool('demo', demo);
    await _prefs.setDouble('paymentsToday', paymentsToday);
    final me = data['me'] as Json?;
    if (me != null) {
      meName = '${me['name']}';
      meRole = '${me['role']}';
    }
    // Server truth plus whatever is still waiting on the phone.
    for (final s in pendingSales.where((s) => s.status == 'pending')) {
      _applySale(s);
    }
    for (final p in pendingPayments.where((p) => p.status == 'pending')) {
      _applyPayment(p);
    }
    catalogAt = DateTime.now();
    await _prefs.setString('catalogAt', catalogAt!.toIso8601String());
    await _saveCatalog();
  }

  /// The day Transactions shows (null = today, Manila time) and the day the
  /// loaded [serverSales] are for.
  String? pickedSalesDate;
  String? serverSalesDate;
  bool loadingSales = false;

  String get salesDate => pickedSalesDate ?? todayManila();

  /// Loads one day's recorded sales. [date] picks a new day; without it the
  /// current day is reloaded (after a sync, or pulling to refresh).
  Future<void> refreshServerSales([String? date]) async {
    if (date != null) pickedSalesDate = date == todayManila() ? null : date;
    final day = salesDate;
    loadingSales = true;
    notifyListeners();
    try {
      final data = await api.sales(day);
      if (day != salesDate) return; // another day was picked meanwhile
      serverSales = (data['sales'] as List).map((j) => ServerSale.fromJson(j as Json)).toList();
      serverSalesDate = day;
      await _prefs.setString('serverSales', jsonEncode(serverSales.map((s) => s.toJson()).toList()));
      await _prefs.setString('serverSalesDate', day);
    } on ApiException catch (e) {
      if (e.network) _setOnline(false);
    } finally {
      loadingSales = false;
      notifyListeners();
    }
  }

  /// Puts a "needs attention" item back in the queue to try again.
  Future<void> retry(String clientUuid) async {
    for (final s in pendingSales.where((s) => s.clientUuid == clientUuid)) {
      s.status = 'pending';
      s.error = null;
    }
    for (final p in pendingPayments.where((p) => p.clientUuid == clientUuid)) {
      p.status = 'pending';
      p.error = null;
    }
    await _saveOutbox();
    notifyListeners();
    unawaited(syncNow());
  }

  /// Drops a "needs attention" item from the phone (after it has been dealt
  /// with another way, e.g. entered on the website).
  Future<void> discard(String clientUuid) async {
    pendingSales.removeWhere((s) => s.clientUuid == clientUuid && s.status == 'rejected');
    pendingPayments.removeWhere((p) => p.clientUuid == clientUuid && p.status == 'rejected');
    await _saveOutbox();
    notifyListeners();
  }

  // ---------------------------------------------------------------- storage

  void _setOnline(bool value) {
    if (online == value) return;
    online = value;
    notifyListeners();
  }

  List<T> _readList<T>(String key, T Function(Json) fromJson) {
    final raw = _prefs.getString(key);
    if (raw == null) return [];
    try {
      return (jsonDecode(raw) as List).map((j) => fromJson(j as Json)).toList();
    } catch (_) {
      return [];
    }
  }

  // The outbox is written on every change, before anything is sent, so an
  // app crash or a flat battery can't lose a sale that was rung up.
  Future<void> _saveOutbox() async {
    await _prefs.setString('outboxSales', jsonEncode(pendingSales.map((s) => s.toJson()).toList()));
    await _prefs.setString('outboxPayments', jsonEncode(pendingPayments.map((p) => p.toJson()).toList()));
    await _prefs.setString('recentReceipts', jsonEncode(recentReceipts.map((r) => r.toJson()).toList()));
  }

  Future<void> _saveCatalog() async {
    await _prefs.setString('products', jsonEncode(products.map((p) => p.toJson()).toList()));
    await _prefs.setString('customers', jsonEncode(customers.map((c) => c.toJson()).toList()));
  }

  String todayManila() {
    final t = DateTime.now().toUtc().add(const Duration(hours: 8));
    return '${t.year.toString().padLeft(4, '0')}-${t.month.toString().padLeft(2, '0')}-${t.day.toString().padLeft(2, '0')}';
  }
}

class AppScope extends InheritedNotifier<AppState> {
  const AppScope({super.key, required AppState state, required super.child}) : super(notifier: state);

  static AppState of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<AppScope>()!.notifier!;
  static AppState read(BuildContext context) => context.getInheritedWidgetOfExactType<AppScope>()!.notifier!;
}
