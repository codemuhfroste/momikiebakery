import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'format.dart';
import 'models.dart';

/// The store's receipt printer: Bluetooth (the usual 58/80 mm thermal
/// printer — Xprinter, "POS-58", Goojprt…) or Wi-Fi.
///
/// Bluetooth printers speak classic Bluetooth serial (SPP); they are paired
/// once in Android's Bluetooth settings and then picked here. Wi-Fi printers
/// listen on TCP port 9100. Either way the tablet sends ESC/POS commands
/// straight to the printer: no driver, no print dialog, and no internet
/// needed — it keeps printing during an outage.
class ReceiptPrinter extends ChangeNotifier {
  String kind = 'bluetooth'; // 'bluetooth' | 'wifi'
  String? btAddress; // the paired printer's Bluetooth address
  String? btName;
  String? host; // Wi-Fi: e.g. 192.168.1.50
  int port = 9100;
  int paperMm = 58; // 58 mm rolls fit 32 characters a line, 80 mm fit 48
  bool autoPrint = true; // print a receipt after every sale
  bool openDrawer = false; // kick a cash drawer plugged into the printer on cash sales
  SharedPreferences? _prefs;

  bool get ready => kind == 'bluetooth' ? (btAddress ?? '').isNotEmpty : (host ?? '').isNotEmpty;
  int get width => paperMm >= 80 ? 48 : 32;
  String get label => kind == 'bluetooth' ? (btName ?? btAddress ?? '') : '${host ?? ''}:$port';

  Future<void> load() async {
    _prefs = await SharedPreferences.getInstance();
    final raw = _prefs!.getString('printer');
    if (raw == null) return;
    try {
      final j = jsonDecode(raw) as Map<String, dynamic>;
      kind = j['kind'] as String? ?? 'bluetooth';
      btAddress = j['btAddress'] as String?;
      btName = j['btName'] as String?;
      host = j['host'] as String?;
      port = (j['port'] as num?)?.toInt() ?? 9100;
      paperMm = (j['paperMm'] as num?)?.toInt() ?? 58;
      autoPrint = j['autoPrint'] as bool? ?? true;
      openDrawer = j['openDrawer'] as bool? ?? false;
    } catch (_) {}
    notifyListeners();
  }

  Future<void> save({
    String? kind,
    String? btAddress,
    String? btName,
    String? host,
    int? port,
    int? paperMm,
    bool? autoPrint,
    bool? openDrawer,
    bool forget = false,
  }) async {
    if (forget) {
      this.btAddress = null;
      this.btName = null;
      this.host = null;
      await _bt.disconnect();
    }
    this.kind = kind ?? this.kind;
    if (btAddress != null) {
      if (btAddress != this.btAddress) await _bt.disconnect();
      this.btAddress = btAddress;
      this.btName = btName;
    }
    if (host != null) this.host = host.trim().isEmpty ? null : host.trim();
    this.port = port ?? this.port;
    this.paperMm = paperMm ?? this.paperMm;
    this.autoPrint = autoPrint ?? this.autoPrint;
    this.openDrawer = openDrawer ?? this.openDrawer;
    await (_prefs ??= await SharedPreferences.getInstance()).setString(
      'printer',
      jsonEncode({
        'kind': this.kind,
        'btAddress': this.btAddress,
        'btName': this.btName,
        'host': this.host,
        'port': this.port,
        'paperMm': this.paperMm,
        'autoPrint': this.autoPrint,
        'openDrawer': this.openDrawer,
      }),
    );
    notifyListeners();
  }

  final BluetoothLink _bt = BluetoothLink();

  /// Bluetooth printers paired with this tablet (Android Settings → Bluetooth).
  Future<List<(String name, String address)>> pairedPrinters() => _bt.paired();

  /// Sends raw bytes to the printer. Throws [PrinterException] with a message
  /// staff can act on.
  Future<void> send(List<int> bytes) async {
    if (!ready) throw PrinterException('No receipt printer is set up yet. Choose it on the Printer page.');
    if (kind == 'bluetooth') return _bt.write(btAddress!, btName ?? btAddress!, bytes);
    return sendWifi(bytes, host!, port);
  }

  static Future<void> sendWifi(List<int> bytes, String host, int port) async {
    Socket? socket;
    try {
      socket = await Socket.connect(host, port, timeout: const Duration(seconds: 4));
      socket.add(bytes);
      await socket.flush().timeout(const Duration(seconds: 8));
    } on TimeoutException {
      throw PrinterException("The printer at $host didn't answer. Check that it's on and on the same Wi-Fi as this tablet.");
    } on SocketException {
      throw PrinterException("Couldn't reach the printer at $host. Check that it's on and on the same Wi-Fi as this tablet.");
    } finally {
      await socket?.close().catchError((_) => socket!);
      socket?.destroy();
    }
  }

  /// Checks the printer is reachable without printing anything: a
  /// real-time status request (DLE EOT 1) that printers answer silently.
  Future<void> probe() async {
    if (!ready) throw PrinterException('No receipt printer is set up yet.');
    if (kind == 'bluetooth') return _bt.write(btAddress!, btName ?? btAddress!, const [0x10, 0x04, 0x01], quiet: true);
    return sendWifi(const [0x10, 0x04, 0x01], host!, port);
  }

  Future<void> printReceipt(ReceiptData r) => send(buildReceipt(r, width: width, openDrawer: openDrawer && r.paymentMethod == 'Cash'));

  Future<void> printTest() => send(buildTestPage(width: width, printer: label, paperMm: paperMm));

  /// Wi-Fi only: looks for printers on this tablet's network — every address
  /// with port 9100 open. Takes a few seconds.
  static Future<List<String>> discover({int port = 9100}) async {
    final subnets = <String>{};
    for (final iface in await NetworkInterface.list(type: InternetAddressType.IPv4)) {
      for (final a in iface.addresses) {
        final parts = a.address.split('.');
        final private = a.address.startsWith('192.168.') ||
            a.address.startsWith('10.') ||
            (parts[0] == '172' && (int.tryParse(parts[1]) ?? 0) >= 16 && (int.tryParse(parts[1]) ?? 0) <= 31);
        if (private && !a.isLoopback) subnets.add(parts.take(3).join('.'));
      }
    }
    final found = <String>[];
    for (final subnet in subnets) {
      final hosts = [for (var i = 1; i <= 254; i++) '$subnet.$i'];
      // 48 at a time with a short timeout: the whole network in ~3 seconds.
      for (var i = 0; i < hosts.length; i += 48) {
        await Future.wait(hosts.skip(i).take(48).map((h) async {
          try {
            final s = await Socket.connect(h, port, timeout: const Duration(milliseconds: 450));
            s.destroy();
            found.add(h);
          } catch (_) {}
        }));
      }
    }
    found.sort((a, b) => int.parse(a.split('.').last).compareTo(int.parse(b.split('.').last)));
    return found;
  }
}

/// The Bluetooth connection (BluetoothPrinter.kt), kept open between
/// receipts so each one prints at once; reconnects by itself when the
/// printer was switched off or out of range.
class BluetoothLink {
  static const _channel = MethodChannel('momikie/printer');

  Future<T?> _call<T>(String method, [Object? args]) async {
    try {
      return await _channel.invokeMethod<T>(method, args);
    } on MissingPluginException {
      throw PrinterException('Bluetooth printing works only in the tablet app.');
    } on PlatformException catch (e) {
      throw PrinterException('Bluetooth problem: ${e.message ?? e.code}');
    }
  }

  Future<void> _ensurePermission({bool quiet = false}) async {
    // Background checks never pop up the permission prompt; it's asked for
    // when the printer is chosen.
    var granted = await _call<bool>('granted') ?? false;
    if (!granted && !quiet) granted = await _call<bool>('requestPermission') ?? false;
    if (!granted) {
      throw PrinterException(
        quiet
            ? "\"Nearby devices\" isn't allowed for this app yet (allow it on the Printer page)."
            : 'Allow "Nearby devices" for this app so it can use the Bluetooth printer, then try again.',
      );
    }
    if (!(await _call<bool>('enabled') ?? false)) {
      throw PrinterException("Bluetooth is off. Turn it on in the tablet's quick settings, then try again.");
    }
  }

  Future<List<(String, String)>> paired() async {
    await _ensurePermission();
    final list = await _call<List<Object?>>('paired') ?? const [];
    return [
      for (final d in list.cast<Map<Object?, Object?>>()) ('${d['name']}', '${d['address']}'),
    ];
  }

  Future<void> disconnect() async {
    try {
      await _call<void>('disconnect');
    } catch (_) {}
  }

  // One print at a time (auto-print and a reprint tapped together).
  Future<void> _queue = Future.value();

  Future<void> write(String address, String name, List<int> bytes, {bool quiet = false}) {
    final job = _queue.then((_) => _write(address, name, bytes, quiet: quiet));
    _queue = job.catchError((_) {});
    return job;
  }

  Future<void> _write(String address, String name, List<int> bytes, {bool quiet = false}) async {
    await _ensurePermission(quiet: quiet);
    final problem = await _call<String>('write', {'address': address, 'bytes': Uint8List.fromList(bytes)});
    switch (problem) {
      case null:
        return;
      case 'off':
        throw PrinterException("Bluetooth is off. Turn it on in the tablet's quick settings, then try again.");
      case 'connect':
        throw PrinterException("Couldn't connect to the printer \"$name\". Check that it's switched on and near the tablet.");
      case 'write':
        throw PrinterException("The printer \"$name\" stopped part-way. Check the paper, switch it off and on, then try again.");
      default:
        throw PrinterException('The printer "$name" had a problem ($problem). Switch it off and on, then try again.');
    }
  }
}

class PrinterException implements Exception {
  PrinterException(this.message);
  final String message;
  @override
  String toString() => message;
}

final receiptPrinter = ReceiptPrinter();

// ---------------------------------------------------------------- receipt

class ReceiptLine {
  const ReceiptLine(this.name, this.detail, this.total);
  final String name;
  final String detail; // "3 x 12.00", "0.35 kg x 80.00" or "2 boxes of 24 x 240.00"
  final double total;
}

/// What goes on a printed receipt — from a sale just rung up on the tablet,
/// or from the server (reprints).
class ReceiptData {
  const ReceiptData({
    required this.receiptNo,
    required this.time,
    required this.cashier,
    this.customer,
    this.wholesale = false,
    required this.lines,
    required this.subtotal,
    required this.discount,
    required this.total,
    required this.paymentMethod,
    required this.tendered,
    required this.creditAmount,
    this.reference,
    this.voided = false,
  });

  final String? receiptNo; // null = saved offline, number comes when it syncs
  final String? reference; // the tablet's id for an offline sale
  final DateTime time;
  final String cashier;
  final String? customer;
  final bool wholesale;
  final List<ReceiptLine> lines;
  final double subtotal;
  final double discount;
  final double total;
  final String paymentMethod;
  final double tendered;
  final double creditAmount;
  final bool voided;

  static String _detail(double qtyPieces, double unitPrice,
      {double? packs, String? packName, double? packSize, double? packPrice, String? unit}) {
    final kg = unit == 'kg' ? ' kg' : '';
    if (packs != null && packName != null && packSize != null && packPrice != null) {
      return '${qty(packs)} ${packPlural(packName, packs)} of ${qty(packSize)}$kg x ${_money(packPrice)}';
    }
    return '${qty(qtyPieces)}$kg x ${_money(unitPrice)}';
  }

  /// A sale rung up on this tablet.
  factory ReceiptData.fromPending(PendingSale s, {required String cashier, String? receiptNo}) => ReceiptData(
        receiptNo: receiptNo,
        reference: s.clientUuid.substring(0, 8).toUpperCase(),
        time: s.recordedAt,
        cashier: cashier,
        customer: s.customerName,
        wholesale: s.priceType == 'wholesale',
        lines: [
          for (final i in s.items)
            ReceiptLine(
              i.name,
              _detail(i.qty, i.unitPrice,
                  packs: i.packs, packName: i.packName, packSize: i.packSize, packPrice: i.packs == null ? null : i.unitPrice, unit: i.unit),
              round2(i.unitPrice * (i.packs ?? i.qty)),
            ),
        ],
        subtotal: round2(s.total + s.discount),
        discount: s.discount,
        total: s.total,
        paymentMethod: s.paymentMethod,
        tendered: s.amountTendered,
        creditAmount: s.creditAmount,
      );

  /// A sale as the server has it (GET /api/mobile/receipt).
  factory ReceiptData.fromServer(Json j) {
    final s = j['sale'] as Json;
    double d(Object? v) => (v as num?)?.toDouble() ?? 0;
    double? dn(Object? v) => (v as num?)?.toDouble();
    return ReceiptData(
      receiptNo: '${s['receiptNo']}',
      time: DateTime.parse('${s['createdAt']}'),
      cashier: '${s['cashierName'] ?? ''}',
      customer: s['customerName'] as String?,
      wholesale: s['priceType'] == 'wholesale',
      lines: [
        for (final i in (j['items'] as List).cast<Json>())
          ReceiptLine(
            '${i['name']}',
            _detail(d(i['qty']), d(i['unitPrice']),
                packs: dn(i['packs']),
                packName: i['packName'] as String?,
                packSize: dn(i['packSize']),
                packPrice: dn(i['packPrice']),
                unit: i['unit'] as String?),
            d(i['lineTotal']),
          ),
      ],
      subtotal: d(s['subtotal']),
      discount: d(s['discount']),
      total: d(s['total']),
      paymentMethod: '${s['paymentMethod']}',
      tendered: d(s['amountTendered']),
      creditAmount: d(s['creditAmount']),
      voided: s['voided'] == true,
    );
  }
}

// ---------------------------------------------------------------- ESC/POS

// The printer's built-in character set has no peso sign, so receipts use
// "P" — as most receipts in the Philippines do.
String _money(double v) => NumberFormat('#,##0.00', 'en').format(v);
String _peso(double v) => 'P${_money(v)}';

/// Builds ESC/POS commands. Text is sent as code page 437 (the default on
/// practically every thermal printer); anything it lacks becomes "?".
class EscPos {
  EscPos(this.width);
  final int width;
  final List<int> bytes = [0x1B, 0x40, 0x1B, 0x74, 0x00]; // initialise; code page 437

  static const _cp437 = {'ñ': 0xA4, 'Ñ': 0xA5, 'é': 0x82, 'á': 0xA0, 'í': 0xA1, 'ó': 0xA2, 'ú': 0xA3, '°': 0xF8};

  void _text(String s) {
    for (final ch in s.runes.map(String.fromCharCode)) {
      final c = ch.codeUnitAt(0);
      bytes.add(c >= 0x20 && c < 0x7F ? c : (_cp437[ch] ?? 0x3F));
    }
  }

  void align(int a) => bytes.addAll([0x1B, 0x61, a]); // 0 left, 1 centre, 2 right
  void bold(bool on) => bytes.addAll([0x1B, 0x45, on ? 1 : 0]);
  void big(bool on) => bytes.addAll([0x1D, 0x21, on ? 0x11 : 0x00]); // double width and height

  void line([String s = '']) {
    _text(s);
    bytes.add(0x0A);
  }

  /// Wraps long text over several lines.
  void wrapped(String s, {int? w}) {
    final max = w ?? width;
    var current = '';
    for (final word in s.split(RegExp(r'\s+'))) {
      if (current.isEmpty) {
        current = word;
      } else if (current.length + 1 + word.length <= max) {
        current += ' $word';
      } else {
        line(current);
        current = word;
      }
      while (current.length > max) {
        line(current.substring(0, max));
        current = current.substring(max);
      }
    }
    if (current.isNotEmpty) line(current);
  }

  /// Text on the left, amount on the right of the same line.
  void pair(String left, String right) {
    final space = width - right.length;
    if (left.length + 1 > space) {
      line(left);
      line(right.padLeft(width));
    } else {
      line(left.padRight(space) + right);
    }
  }

  void rule([String ch = '-']) => line(ch * width);

  void cut() => bytes.addAll([0x0A, 0x0A, 0x0A, 0x1D, 0x56, 0x42, 0x00]); // feed, then partial cut

  void kickDrawer() => bytes.addAll([0x1B, 0x70, 0x00, 0x19, 0xFA]); // pulse pin 2
}

Uint8List buildReceipt(ReceiptData r, {required int width, bool openDrawer = false}) {
  final p = EscPos(width);
  if (openDrawer) p.kickDrawer();
  p.align(1);
  p.bold(true);
  p.wrapped("MOMIKIE'S GENERAL MERCHANDISE");
  p.bold(false);
  if (r.voided) {
    p.big(true);
    p.line('VOIDED');
    p.big(false);
  }
  if (r.wholesale) {
    p.bold(true);
    p.line('WHOLESALE');
    p.bold(false);
  }
  p.line(r.receiptNo != null ? 'Receipt No. ${r.receiptNo}' : 'Ref. ${r.reference ?? ''}');
  p.line(DateFormat('MMM d, y  h:mm a').format(manila(r.time)));
  p.wrapped('Cashier: ${r.cashier}');
  if (r.customer != null) p.wrapped('Customer: ${r.customer}');
  p.align(0);
  p.rule();
  for (final l in r.lines) {
    p.wrapped(l.name);
    p.pair('  ${l.detail}', _money(l.total));
  }
  p.rule();
  p.pair('Subtotal', _peso(r.subtotal));
  if (r.discount > 0.004) p.pair('Discount', '-${_peso(r.discount)}');
  p.bold(true);
  p.pair('TOTAL', _peso(r.total));
  p.bold(false);
  if (r.paymentMethod == 'Credit') {
    p.pair('Paid now', _peso(r.tendered));
    p.pair('Charged to account', _peso(r.creditAmount));
  } else {
    p.pair(r.paymentMethod, _peso(r.tendered));
    if (r.paymentMethod == 'Cash') p.pair('Change', _peso(r.tendered - r.total < 0 ? 0 : r.tendered - r.total));
  }
  p.rule();
  p.align(1);
  if (r.receiptNo == null) p.wrapped('Saved offline - the receipt number is given when it syncs.');
  p.wrapped("Thank you for shopping at Momikie's!");
  // Not BIR-accredited: the booklet invoice is the tax document.
  p.bold(true);
  p.wrapped('THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX.');
  p.bold(false);
  p.cut();
  return Uint8List.fromList(p.bytes);
}

Uint8List buildTestPage({required int width, required String printer, required int paperMm}) {
  final p = EscPos(width);
  p.align(1);
  p.big(true);
  p.line('TEST PRINT');
  p.big(false);
  p.line("Momikie's POS");
  p.rule();
  p.align(0);
  p.wrapped('Printer: $printer');
  p.pair('Paper', '$paperMm mm ($width characters)');
  p.pair('Printed', DateFormat('MMM d, y h:mm a').format(manila(DateTime.now())));
  p.rule();
  p.line('1234567890' * (width ~/ 10) + '1234567890'.substring(0, width % 10));
  p.align(1);
  p.line('If this page looks right,');
  p.line('the printer is ready.');
  p.cut();
  return Uint8List.fromList(p.bytes);
}
