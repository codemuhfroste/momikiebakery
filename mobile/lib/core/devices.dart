import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import 'printer.dart';

enum PrinterState { notSetUp, checking, connected, notConnected }

/// Whether the barcode scanner and the receipt printer are connected, for
/// the indicators in the sidebar. Checked every few seconds while the app is
/// open.
///
/// Scanner: USB and Bluetooth scanners show up in Android as (external)
/// keyboards, so a connected one is listed by the platform. Printer: the
/// Bluetooth link is checked with a status request the printer answers
/// without printing anything.
class DeviceStatus extends ChangeNotifier with WidgetsBindingObserver {
  static const _channel = MethodChannel('momikie/devices');

  List<String> scanners = [];
  DateTime? lastScanAt;
  PrinterState printer = PrinterState.notSetUp;
  String? printerProblem;

  Timer? _scannerTimer;
  Timer? _printerTimer;
  bool _started = false;

  bool get scannerConnected => scanners.isNotEmpty;

  void start() {
    if (_started) return;
    _started = true;
    WidgetsBinding.instance.addObserver(this);
    receiptPrinter.addListener(checkPrinter);
    checkScanner();
    checkPrinter();
    _scannerTimer = Timer.periodic(const Duration(seconds: 3), (_) => checkScanner());
    _printerTimer = Timer.periodic(const Duration(seconds: 20), (_) => checkPrinter());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      checkScanner();
      checkPrinter();
    }
  }

  /// A barcode was just scanned (the Register saw a fast burst of keys).
  void markScan() {
    lastScanAt = DateTime.now();
    notifyListeners();
  }

  Future<void> checkScanner() async {
    try {
      final names = ((await _channel.invokeListMethod<String>('externalKeyboards')) ?? const <String>[]);
      if (!listEquals(names, scanners)) {
        scanners = names;
        notifyListeners();
      }
    } catch (_) {
      // Not on Android (tests, web build): nothing to report.
    }
  }

  bool _checking = false;

  Future<void> checkPrinter() async {
    if (_checking) return;
    if (!receiptPrinter.ready) {
      _set(PrinterState.notSetUp, null);
      return;
    }
    _checking = true;
    if (printer != PrinterState.connected) _set(PrinterState.checking, null);
    try {
      await receiptPrinter.probe();
      _set(PrinterState.connected, null);
    } on PrinterException catch (e) {
      _set(PrinterState.notConnected, e.message);
    } catch (e) {
      _set(PrinterState.notConnected, '$e');
    } finally {
      _checking = false;
    }
  }

  /// After a successful print the printer is evidently there.
  void printed() => _set(PrinterState.connected, null);

  void _set(PrinterState s, String? problem) {
    if (s == printer && problem == printerProblem) return;
    printer = s;
    printerProblem = problem;
    notifyListeners();
  }

  /// Stops checking (signed out, or the app shell went away).
  void stop() {
    if (!_started) return;
    _started = false;
    _scannerTimer?.cancel();
    _printerTimer?.cancel();
    receiptPrinter.removeListener(checkPrinter);
    WidgetsBinding.instance.removeObserver(this);
  }

  @override
  void dispose() {
    stop();
    super.dispose();
  }
}

final deviceStatus = DeviceStatus();
