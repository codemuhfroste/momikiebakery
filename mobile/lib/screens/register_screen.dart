import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/app_state.dart';
import '../core/format.dart';
import '../core/models.dart';
import '../core/theme.dart';
import '../core/nav.dart';
import '../widgets/common.dart';
import '../widgets/shell.dart';
import '../widgets/web.dart';

/// The website's Register (/pos, PosClient.tsx): products on the left, the
/// current sale on the right — pinned while the products scroll — and on
/// narrow screens stacked, with a "View sale" button. Sales are saved on the
/// tablet first (see AppState), so this works offline.
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _LastSale {
  _LastSale(this.clientUuid, this.method, this.change, this.creditAmount, this.customerName);
  final String clientUuid;
  final String method;
  final double change;
  final double creditAmount;
  final String? customerName;
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _search = TextEditingController();
  final _searchFocus = FocusNode();
  final _discount = TextEditingController();
  final _tendered = TextEditingController();
  final _scroll = ScrollController();
  final _panelScroll = ScrollController(); // the order panel's own scroll (wide)
  final _rowKey = GlobalKey();
  final _cartKey = GlobalKey();
  final List<CartLine> _cart = [];
  final Map<int, TextEditingController> _priceText = {};

  (String, bool)? _notice; // text, ok
  (int, int)? _flash; // product id, counter (replays the flash)
  String _method = 'Cash';
  int? _customerId;
  bool _busy = false;
  String? _error;
  _LastSale? _lastSale;
  double _rowTop = 0; // where the two columns start, within the scroll content

  // Keyboard-wedge barcode scanners (USB/Bluetooth) type fast and end with
  // Enter. Like the website's useBarcodeScanner, keys typed while no text
  // box has focus are collected here, so scanning works without tapping the
  // search box (and without the on-screen keyboard popping up).
  final _scanBuffer = StringBuffer();
  DateTime _lastScanKey = DateTime(0);

  @override
  void initState() {
    super.initState();
    HardwareKeyboard.instance.addHandler(_onHardwareKey);
  }

  bool _onHardwareKey(KeyEvent e) {
    if (e is! KeyDownEvent || !appNav.onRegister || !mounted) return false;
    final focused = FocusManager.instance.primaryFocus?.context;
    if (focused != null && focused.findAncestorWidgetOfExactType<EditableText>() != null) return false;
    final now = DateTime.now();
    if (now.difference(_lastScanKey) > const Duration(milliseconds: 80)) _scanBuffer.clear();
    _lastScanKey = now;
    if (e.logicalKey == LogicalKeyboardKey.enter || e.logicalKey == LogicalKeyboardKey.numpadEnter) {
      final code = _scanBuffer.toString().trim();
      _scanBuffer.clear();
      if (code.length >= 4) {
        _handleCode(code);
        return true;
      }
      return false;
    }
    final ch = e.character;
    if (ch != null && ch.length == 1 && ch.codeUnitAt(0) >= 32) _scanBuffer.write(ch);
    return false;
  }

  void _handleCode(String code) {
    final hit = AppScope.read(context).products.where((p) => p.barcode == code || p.sku == code).firstOrNull;
    if (hit == null) {
      setState(() => _notice = ('No product has barcode $code. Add it on the website under Products.', false));
    } else if (hit.stockQty <= 0) {
      setState(() => _notice = ('${hit.name} is out of stock.', false));
    } else {
      _add(hit, notice: 'Added ${hit.name}');
    }
  }

  @override
  void dispose() {
    HardwareKeyboard.instance.removeHandler(_onHardwareKey);
    for (final c in [_search, _discount, _tendered, ..._priceText.values]) {
      c.dispose();
    }
    _scroll.dispose();
    _panelScroll.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  // ---------------------------------------------------------------- cart

  void _add(Product p, {String? notice}) {
    HapticFeedback.selectionClick();
    setState(() {
      _lastSale = null;
      _notice = notice == null ? null : (notice, true);
      _flash = (p.id, (_flash?.$2 ?? 0) + 1);
      final line = _cart.where((l) => l.product.id == p.id).firstOrNull;
      if (line != null) {
        line.qty += 1;
      } else {
        _cart.add(CartLine(p, 1));
      }
    });
  }

  TextEditingController _priceFor(CartLine l) =>
      _priceText.putIfAbsent(l.product.id, () => TextEditingController(text: _plain(l.unitPrice)));

  static String _plain(double v) => v == v.roundToDouble() ? v.toInt().toString() : v.toString();

  void _setPrice(CartLine l, double price, {bool updateText = false}) {
    setState(() => l.unitPrice = price);
    if (updateText) _priceFor(l).text = _plain(price);
  }

  void _remove(CartLine l) => setState(() {
    _cart.remove(l);
    _priceText.remove(l.product.id)?.dispose();
  });

  void _clearCart() => setState(() {
    _cart.clear();
    for (final c in _priceText.values) {
      c.dispose();
    }
    _priceText.clear();
  });

  /// Enter in the search box — also where a USB/Bluetooth barcode scanner
  /// types. Same rules as the website: an exact barcode or SKU wins, then a
  /// single search result.
  void _submitSearch(List<Product> results) {
    final q = _search.text.trim();
    if (q.isEmpty) return;
    final products = AppScope.read(context).products;
    final exact = products.where((p) => p.barcode == q || p.sku == q).firstOrNull;
    if (exact != null && exact.stockQty > 0) {
      _add(exact, notice: 'Added ${exact.name}');
      _search.clear();
    } else if (exact == null && results.length == 1) {
      _add(results.first, notice: 'Added ${results.first.name}');
      _search.clear();
    } else if (exact != null) {
      setState(() => _notice = ('${exact.name} is out of stock.', false));
    } else if (RegExp(r'^\d{4,}$').hasMatch(q)) {
      setState(() => _notice = ('No product has barcode $q. Add it on the website under Products.', false));
    } else {
      setState(() => _notice = ('Select a product from the list.', false));
    }
    _searchFocus.requestFocus();
  }

  // ---------------------------------------------------------------- totals

  double get _subtotal => round2(_cart.fold<double>(0, (s, l) => s + l.unitPrice * l.qty));
  double get _discountValue => (double.tryParse(_discount.text) ?? 0).clamp(0, _subtotal).toDouble();
  double get _total => round2(_subtotal - _discountValue);
  bool get _isCredit => _method == 'Credit';
  double get _cashIn => double.tryParse(_tendered.text) ?? 0;
  double get _tenderedValue => _method == 'Cash' || _isCredit ? _cashIn : _total;

  void _selectMethod(String m) => setState(() {
    _method = m;
    _tendered.clear();
    _error = null;
  });

  Future<void> _checkout(Customer? customer, double change, double creditAmount) async {
    final app = AppScope.read(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await app.ringUpSale(
      cart: _cart,
      discount: _discountValue,
      method: _method,
      amountTendered: _tenderedValue,
      customerId: _isCredit ? _customerId : null,
    );
    if (!mounted) return;
    if (error != null) {
      setState(() {
        _busy = false;
        _error = error;
      });
      return;
    }
    setState(() {
      _lastSale = _LastSale(app.lastRungUp!, _method, _isCredit ? 0 : change, creditAmount, customer?.name);
      _busy = false;
      _discount.clear();
      _tendered.clear();
      _method = 'Cash';
      _customerId = null;
      _search.clear();
      _notice = null;
    });
    _clearCart();
    // Show the "Sale complete / Give change" box at the top of the panel.
    FocusManager.instance.primaryFocus?.unfocus();
    if (_panelScroll.hasClients) _panelScroll.jumpTo(0);
  }

  // ---------------------------------------------------------------- build

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final width = MediaQuery.sizeOf(context).width;
    final wide = width >= Brand.wide;
    final q = _search.text.trim().toLowerCase();
    final results =
        (q.isEmpty
                ? app.products
                : app.products.where(
                    (p) => p.name.toLowerCase().contains(q) || (p.sku ?? '').toLowerCase().contains(q) || (p.barcode ?? '').contains(q),
                  ))
            .take(48)
            .toList();

    const header = PageHeader(
      title: 'Register',
      subtitle:
          'Scan or select products, then choose how the customer pays. Prices start at the SRP; any change is recorded in the Audit Log.',
    );
    final picker = _picker(app, results, width);

    if (!wide) {
      return Stack(
        children: [
          PageBody(
            controller: _scroll,
            children: [
              header,
              picker,
              const SizedBox(height: 24),
              KeyedSubtree(key: _cartKey, child: _orderPanel(app)),
              if (_cart.isNotEmpty) const SizedBox(height: 64),
            ],
          ),
          if (_cart.isNotEmpty)
            Positioned(
              left: 16,
              right: 16,
              bottom: 16,
              child: Material(
                color: Brand.navy,
                borderRadius: BorderRadius.circular(8),
                elevation: 6,
                child: InkWell(
                  borderRadius: BorderRadius.circular(8),
                  onTap: () => Scrollable.ensureVisible(
                    _cartKey.currentContext!,
                    duration: const Duration(milliseconds: 350),
                    curve: Curves.easeOutCubic,
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            'View sale · ${qty(_cart.fold<double>(0, (s, l) => s + l.qty))} item${_cart.length == 1 && _cart.first.qty == 1 ? '' : 's'}',
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Text(
                          peso(_total),
                          style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600, fontFeatures: tabular),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      );
    }

    // Wide: the order panel is laid over the right-hand column and pinned
    // 24px from the top once the page header has scrolled away (the
    // website's `lg:sticky lg:top-6`).
    WidgetsBinding.instance.addPostFrameCallback((_) => _measureRow());
    final panel = _orderPanel(app);
    return LayoutBuilder(
      builder: (context, c) {
        return Stack(
          children: [
            PageBody(
              controller: _scroll,
              children: [
                header,
                Row(
                  key: _rowKey,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: picker),
                    const SizedBox(width: 24 + 400),
                  ],
                ),
              ],
            ),
            // Only the panel follows the scroll; the product grid isn't rebuilt.
            AnimatedBuilder(
              animation: _scroll,
              child: panel,
              builder: (context, child) {
                final offset = _scroll.hasClients ? _scroll.offset : 0.0;
                final top = math.max(24.0, _rowTop - offset);
                return Positioned(
                  top: top,
                  right: 32,
                  width: 400,
                  child: ConstrainedBox(
                    constraints: BoxConstraints(maxHeight: math.max(200, c.maxHeight - top - 16)),
                    child: SingleChildScrollView(controller: _panelScroll, child: child),
                  ),
                );
              },
            ),
          ],
        );
      },
    );
  }

  void _measureRow() {
    final row = _rowKey.currentContext?.findRenderObject() as RenderBox?;
    final stack = context.findRenderObject() as RenderBox?;
    if (row == null || stack == null || !row.attached) return;
    final top = row.localToGlobal(Offset.zero, ancestor: stack).dy + (_scroll.hasClients ? _scroll.offset : 0);
    if ((top - _rowTop).abs() > 0.5 && mounted) setState(() => _rowTop = top);
  }

  // ---------------------------------------------------------------- picker

  Widget _picker(AppState app, List<Product> results, double viewport) {
    final cols = viewport >= 1280 ? 4 : (viewport >= 768 ? 3 : 2);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const FieldLabel('Find a product'),
        TextField(
          controller: _search,
          focusNode: _searchFocus,
          style: const TextStyle(fontSize: 16, color: Brand.ink),
          textInputAction: TextInputAction.done,
          decoration: const InputDecoration(
            hintText: 'Type a product name, or scan its barcode',
            hintStyle: TextStyle(fontSize: 16, color: Brand.slate400),
            contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          ),
          onChanged: (_) => setState(() {}),
          onSubmitted: (_) => _submitSearch(results),
        ),
        SizedBox(
          height: 26,
          child: Padding(
            padding: const EdgeInsets.only(top: 6),
            child: _notice == null
                ? null
                : TweenAnimationBuilder<double>(
                    key: ValueKey('${_notice!.$1}${_flash?.$2}'),
                    tween: Tween(begin: 0, end: 1),
                    duration: const Duration(milliseconds: 220),
                    builder: (_, v, child) => Opacity(
                      opacity: v,
                      child: Transform.translate(offset: Offset(0, -4 * (1 - v)), child: child),
                    ),
                    child: Text(
                      _notice!.$1,
                      style: TextStyle(fontSize: 14, color: _notice!.$2 ? Brand.emerald700 : Brand.red600),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
          ),
        ),
        const SizedBox(height: 10),
        if (app.products.isEmpty)
          const WebCard(child: EmptyState('No products on this tablet yet. Connect to the internet once to download them.'))
        else if (results.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 40),
            child: Center(child: Text('No matching products.', style: tMuted)),
          )
        else
          for (var i = 0; i < results.length; i += cols)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var j = 0; j < cols; j++) ...[
                      if (j > 0) const SizedBox(width: 12),
                      Expanded(
                        child: i + j < results.length
                            ? _ProductTile(
                                product: results[i + j],
                                flash: _flash != null && _flash!.$1 == results[i + j].id ? _flash!.$2 : null,
                                onTap: () => _add(results[i + j]),
                              )
                            : const SizedBox.shrink(),
                      ),
                    ],
                  ],
                ),
              ),
            ),
      ],
    );
  }

  // ---------------------------------------------------------------- order panel

  Widget _orderPanel(AppState app) {
    final customer = app.customerById(_customerId);
    final total = _total;
    final change = round2(_tenderedValue - total);
    final creditAmount = _isCredit ? round2(total - _cashIn) : 0.0;
    final available = customer?.available;
    final overLimit = _isCredit && available != null && creditAmount > available + 0.004;
    final canPay = _cart.isNotEmpty && (_isCredit ? customer != null && _cashIn < total && !overLimit : _tenderedValue >= total);
    final overrides = _cart.where((l) => l.priceChanged).length;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Brand.line),
        boxShadow: Brand.shadowSm,
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_lastSale != null) _saleDone(app, _lastSale!),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: Brand.line)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text.rich(
                    TextSpan(
                      children: [
                        const TextSpan(
                          text: 'Current sale',
                          style: TextStyle(fontWeight: FontWeight.w600),
                        ),
                        if (_cart.isNotEmpty)
                          TextSpan(
                            text: ' · ${_cart.length} item(s)',
                            style: const TextStyle(color: Brand.muted),
                          ),
                      ],
                    ),
                    style: tSm,
                  ),
                ),
                if (_cart.isNotEmpty)
                  InkWell(
                    onTap: _clearCart,
                    child: const Text('Clear all', style: tMuted),
                  ),
              ],
            ),
          ),
          ConstrainedBox(
            constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.36),
            child: _cart.isEmpty
                ? const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 20, vertical: 40),
                    child: Text('Scan or select a product to start a sale.', textAlign: TextAlign.center, style: tMuted),
                  )
                : ListView.separated(
                    shrinkWrap: true,
                    padding: EdgeInsets.zero,
                    itemCount: _cart.length,
                    separatorBuilder: (_, _) => const Divider(),
                    itemBuilder: (_, i) => _cartLine(_cart[i]),
                  ),
          ),
          Container(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
            decoration: const BoxDecoration(
              border: Border(top: BorderSide(color: Brand.line)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: _gap(12, [
                if (overrides > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: Brand.amber50,
                      border: Border.all(color: Brand.amber200),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      '$overrides item${overrides > 1 ? 's are' : ' is'} priced differently from the SRP. This will be recorded in the Audit Log.',
                      style: const TextStyle(fontSize: 12, color: Brand.amber900),
                    ),
                  ),
                _kv('Subtotal', peso(_subtotal)),
                Row(
                  children: [
                    const Expanded(child: Text('Discount (₱)', style: tMuted)),
                    SizedBox(
                      width: 112,
                      child: _smallInput(_discount, hint: '0.00', align: TextAlign.right, onChanged: (_) => setState(() {})),
                    ),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.only(top: 12),
                  decoration: const BoxDecoration(
                    border: Border(top: BorderSide(color: Brand.line)),
                  ),
                  child: Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Total',
                          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: Brand.ink),
                        ),
                      ),
                      TweenAnimationBuilder<double>(
                        key: ValueKey(total),
                        tween: Tween(begin: 0, end: 1),
                        duration: const Duration(milliseconds: 300),
                        builder: (_, v, child) => Transform.scale(scale: 1 + 0.06 * math.sin(v * math.pi), child: child),
                        child: Text(
                          peso(total),
                          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600, color: Brand.ink, fontFeatures: tabular),
                        ),
                      ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const FieldLabel('Payment method'),
                    Row(
                      children: [
                        for (var i = 0; i < paymentMethods.length; i++) ...[
                          if (i > 0) const SizedBox(width: 6),
                          Expanded(child: _methodButton(paymentMethods[i])),
                        ],
                      ],
                    ),
                  ],
                ),
                if (_method == 'Cash')
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const FieldLabel('Cash received'),
                            TextField(
                              controller: _tendered,
                              keyboardType: const TextInputType.numberWithOptions(decimal: true),
                              style: tSm,
                              onChanged: (_) => setState(() {}),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const FieldLabel('Change'),
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 6),
                              child: Text(
                                peso(math.max(change, 0)),
                                style: TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w600,
                                  fontFeatures: tabular,
                                  color: change < 0 ? Brand.red600 : Brand.emerald700,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                if (_isCredit) _creditPanel(app, customer, creditAmount, available, overLimit, total),
                if (_error != null) Text(_error!, style: const TextStyle(fontSize: 14, color: Brand.red600)),
                WebButton(
                  _busy
                      ? 'Processing…'
                      : _isCredit
                      ? 'Charge ${peso(math.max(creditAmount, 0))} to account'
                      : 'Complete sale · ${peso(total)}',
                  onPressed: canPay && !_busy ? () => _checkout(customer, change, creditAmount) : null,
                  busy: _busy,
                  expand: true,
                  fontSize: 16,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                ),
                if (_method == 'Cash')
                  WebButton(
                    'Exact amount received',
                    kind: BtnKind.secondary,
                    expand: true,
                    onPressed: () => setState(() => _tendered.text = total.toStringAsFixed(2)),
                  ),
                if (!app.online)
                  const Text(
                    'Offline: the sale is saved on this tablet and sent automatically when the internet is back.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12, color: Brand.amber700),
                  ),
              ]),
            ),
          ),
        ],
      ),
    );
  }

  Widget _saleDone(AppState app, _LastSale sale) {
    final synced = app.receiptFor(sale.clientUuid);
    const green = TextStyle(color: Brand.emerald900);
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 16, 12, 16),
      decoration: const BoxDecoration(
        color: Brand.emerald50,
        border: Border(bottom: BorderSide(color: Brand.emerald200)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Sale complete', style: green.copyWith(fontSize: 14, fontWeight: FontWeight.w600)),
                    Text(
                      synced != null
                          ? 'Receipt ${synced.receiptNo}'
                          : app.syncing
                          ? 'Sending…'
                          : 'Saved on this tablet — the receipt number comes when it syncs',
                      style: const TextStyle(fontSize: 12, color: Brand.emerald800),
                    ),
                  ],
                ),
              ),
              InkWell(
                onTap: () => setState(() => _lastSale = null),
                borderRadius: BorderRadius.circular(4),
                child: const Padding(
                  padding: EdgeInsets.all(6),
                  child: WebIcon(Icons2.close, size: 16, color: Brand.emerald700, stroke: 2),
                ),
              ),
            ],
          ),
          if (sale.method == 'Cash' && sale.change > 0.004)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.baseline,
                textBaseline: TextBaseline.alphabetic,
                children: [
                  Text('Give change', style: green.copyWith(fontSize: 14)),
                  const SizedBox(width: 8),
                  Text(
                    peso(sale.change),
                    style: green.copyWith(fontSize: 24, fontWeight: FontWeight.w700, fontFeatures: tabular),
                  ),
                ],
              ),
            ),
          if (sale.creditAmount > 0.004)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: peso(sale.creditAmount),
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    TextSpan(text: " charged to ${sale.customerName}'s account."),
                  ],
                ),
                style: green.copyWith(fontSize: 14),
              ),
            ),
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text('Ready for the next customer', style: TextStyle(fontSize: 12, color: Brand.emerald800)),
          ),
        ],
      ),
    );
  }

  Widget _cartLine(CartLine l) {
    final changed = l.priceChanged;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ProductThumb(product: l.product, size: 36, fontSize: 10),
              const SizedBox(width: 10),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    l.product.name,
                    style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: Brand.ink),
                  ),
                ),
              ),
              InkWell(
                onTap: () => _remove(l),
                child: const Text('Remove', style: tXs),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Container(
                decoration: BoxDecoration(
                  border: Border.all(color: Brand.line),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _stepButton('−', () => setState(() => l.qty = math.max(1, l.qty - 1))),
                    SizedBox(
                      width: 32,
                      child: Text(
                        qty(l.qty),
                        textAlign: TextAlign.center,
                        style: tSm.copyWith(fontFeatures: tabular),
                      ),
                    ),
                    _stepButton('+', () => setState(() => l.qty = math.min(l.product.stockQty, l.qty + 1))),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              const Text('at ₱', style: tXs),
              const SizedBox(width: 8),
              SizedBox(
                width: 80,
                child: _smallInput(_priceFor(l), highlight: changed, onChanged: (v) => _setPrice(l, double.tryParse(v) ?? 0)),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Align(
                  alignment: Alignment.centerRight,
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                      peso(l.unitPrice * l.qty),
                      style: tSm.copyWith(fontWeight: FontWeight.w600, fontFeatures: tabular),
                    ),
                  ),
                ),
              ),
            ],
          ),
          if (changed)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Wrap(
                spacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  const WebBadge('Not SRP', tone: Tone.warn),
                  Text('SRP is ${peso(l.product.srp)}.', style: const TextStyle(fontSize: 12, color: Brand.amber800)),
                  InkWell(
                    onTap: () => _setPrice(l, l.product.srp, updateText: true),
                    child: const Text(
                      'Use SRP',
                      style: TextStyle(
                        fontSize: 12,
                        color: Brand.amber800,
                        decoration: TextDecoration.underline,
                        decorationColor: Brand.amber800,
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _stepButton(String label, VoidCallback onTap) => InkWell(
    onTap: onTap,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      child: Text(label, style: const TextStyle(fontSize: 16, color: Brand.muted)),
    ),
  );

  Widget _methodButton(String m) {
    final on = _method == m;
    return Material(
      color: on ? Brand.navy : Colors.white,
      borderRadius: BorderRadius.circular(6),
      child: InkWell(
        onTap: () => _selectMethod(m),
        borderRadius: BorderRadius.circular(6),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 7),
          decoration: BoxDecoration(
            border: Border.all(color: on ? Brand.navy : Brand.line),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(
            m,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: on ? Colors.white : Brand.ink),
          ),
        ),
      ),
    );
  }

  Widget _creditPanel(AppState app, Customer? customer, double creditAmount, double? available, bool overLimit, double total) {
    if (app.customers.isEmpty) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: Brand.slate50,
          border: Border.all(color: Brand.line),
          borderRadius: BorderRadius.circular(6),
        ),
        child: const Text('No credit customers yet. Add one on the website first.', style: tMuted),
      );
    }
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Brand.slate50,
        border: Border.all(color: Brand.line),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: _gap(12, [
          if (customer != null)
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(customer.name, style: tSm.copyWith(fontWeight: FontWeight.w600)),
                      Text(
                        'Owes ${peso(customer.balance)} · ${available == null ? 'no credit limit' : '${peso(math.max(available, 0))} available'}',
                        style: tXs,
                      ),
                    ],
                  ),
                ),
                InkWell(
                  onTap: () => setState(() => _customerId = null),
                  child: const Text(
                    'Change',
                    style: TextStyle(fontSize: 12, color: Brand.navy, decoration: TextDecoration.underline, decorationColor: Brand.navy),
                  ),
                ),
              ],
            )
          else
            _CustomerPicker(customers: app.customers, onSelect: (id) => setState(() => _customerId = id)),
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const FieldLabel('Down payment (optional)'),
              TextField(
                controller: _tendered,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                style: tSm,
                decoration: const InputDecoration(hintText: '0.00'),
                onChanged: (_) => setState(() {}),
              ),
            ],
          ),
          _kv('Added to their balance', peso(math.max(creditAmount, 0)), bold: true),
          if (_cashIn >= total && total > 0)
            const Text('The down payment covers the whole total — use Cash instead.', style: TextStyle(fontSize: 12, color: Brand.red600)),
          if (overLimit && customer != null)
            Text(
              'This would put ${customer.name} over their credit limit. Collect a larger down payment or remove items.',
              style: const TextStyle(fontSize: 12, color: Brand.red600),
            ),
        ]),
      ),
    );
  }

  // ---------------------------------------------------------------- bits

  Widget _kv(String k, String v, {bool bold = false}) => Row(
    children: [
      Expanded(child: Text(k, style: tMuted)),
      Text(
        v,
        style: tSm.copyWith(fontFeatures: tabular, fontWeight: bold ? FontWeight.w600 : FontWeight.w400),
      ),
    ],
  );

  Widget _smallInput(
    TextEditingController c, {
    String? hint,
    TextAlign align = TextAlign.left,
    bool highlight = false,
    ValueChanged<String>? onChanged,
  }) => TextField(
    controller: c,
    keyboardType: const TextInputType.numberWithOptions(decimal: true),
    textAlign: align,
    style: tSm.copyWith(fontFeatures: tabular),
    onChanged: onChanged,
    decoration: InputDecoration(
      hintText: hint,
      contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      fillColor: highlight ? Brand.amber50 : Colors.white,
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(6),
        borderSide: BorderSide(color: highlight ? Brand.amber400 : Brand.line),
      ),
    ),
  );

  static List<Widget> _gap(double gap, List<Widget> children) => [
    for (var i = 0; i < children.length; i++) ...[if (i > 0) SizedBox(height: gap), children[i]],
  ];
}

class _CustomerPicker extends StatefulWidget {
  const _CustomerPicker({required this.customers, required this.onSelect});
  final List<Customer> customers;
  final ValueChanged<int> onSelect;
  @override
  State<_CustomerPicker> createState() => _CustomerPickerState();
}

class _CustomerPickerState extends State<_CustomerPicker> {
  String _q = '';
  @override
  Widget build(BuildContext context) {
    final matches = widget.customers
        .where((c) => _q.isEmpty || c.name.toLowerCase().contains(_q) || (c.phone ?? '').contains(_q))
        .take(6)
        .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const FieldLabel('Customer'),
        TextField(
          style: tSm,
          decoration: const InputDecoration(hintText: 'Search customer name or mobile'),
          onChanged: (v) => setState(() => _q = v.trim().toLowerCase()),
        ),
        const SizedBox(height: 6),
        Container(
          constraints: const BoxConstraints(maxHeight: 160),
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border.all(color: Brand.line),
            borderRadius: BorderRadius.circular(6),
          ),
          clipBehavior: Clip.antiAlias,
          child: matches.isEmpty
              ? const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  child: Text('No match.', style: tMuted),
                )
              : ListView.separated(
                  shrinkWrap: true,
                  padding: EdgeInsets.zero,
                  itemCount: matches.length,
                  separatorBuilder: (_, _) => const Divider(),
                  itemBuilder: (_, i) => InkWell(
                    onTap: () => widget.onSelect(matches[i].id),
                    hoverColor: Brand.navySoft,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      child: Row(
                        children: [
                          Expanded(child: Text(matches[i].name, style: tSm)),
                          Text('owes ${peso(matches[i].balance)}', style: tXs.copyWith(fontFeatures: tabular)),
                        ],
                      ),
                    ),
                  ),
                ),
        ),
      ],
    );
  }
}

/// A product card in the grid — the website's tile, with its press-in and
/// the brief brand-coloured flash when added.
class _ProductTile extends StatefulWidget {
  const _ProductTile({required this.product, required this.onTap, this.flash});
  final Product product;
  final VoidCallback onTap;
  final int? flash;

  @override
  State<_ProductTile> createState() => _ProductTileState();
}

class _ProductTileState extends State<_ProductTile> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    final p = widget.product;
    final out = p.stockQty <= 0;
    return Opacity(
      opacity: out ? 0.5 : 1,
      child: AnimatedScale(
        scale: _down ? 0.97 : 1,
        duration: const Duration(milliseconds: 150),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: _down ? Brand.navy : Brand.line),
            boxShadow: Brand.shadowSm,
          ),
          child: Material(
            type: MaterialType.transparency,
            borderRadius: BorderRadius.circular(8),
            child: InkWell(
              onTap: out ? null : widget.onTap,
              onHighlightChanged: (v) => setState(() => _down = v),
              borderRadius: BorderRadius.circular(8),
              child: Stack(
                children: [
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        AspectRatio(
                          aspectRatio: 1,
                          child: LayoutBuilder(
                            builder: (_, c) => ProductThumb(product: p, size: c.maxWidth, fontSize: 24),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(p.categoryName ?? 'Uncategorized', style: tXs, maxLines: 1, overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 2),
                        SizedBox(
                          height: 40,
                          child: Text(
                            p.name,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: Brand.ink),
                          ),
                        ),
                        const Spacer(),
                        const SizedBox(height: 8),
                        Wrap(
                          alignment: WrapAlignment.spaceBetween,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          spacing: 8,
                          runSpacing: 2,
                          children: [
                            Text(
                              peso(p.srp),
                              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Brand.ink, fontFeatures: tabular),
                            ),
                            Text(
                              out ? 'Out of stock' : '${qty(p.stockQty)} in stock',
                              style: TextStyle(
                                fontSize: 12,
                                color: out ? Brand.red600 : Brand.muted,
                                fontWeight: out ? FontWeight.w500 : FontWeight.w400,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  if (widget.flash != null)
                    Positioned.fill(
                      child: IgnorePointer(
                        child: TweenAnimationBuilder<double>(
                          key: ValueKey(widget.flash),
                          tween: Tween(begin: 1, end: 0),
                          duration: const Duration(milliseconds: 700),
                          curve: Curves.easeOut,
                          builder: (_, v, _) => Container(
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: Brand.navy.withValues(alpha: v), width: 2),
                              color: Brand.navy.withValues(alpha: 0.12 * v),
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
