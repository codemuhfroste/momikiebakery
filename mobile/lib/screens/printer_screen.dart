import 'package:flutter/material.dart';

import '../core/devices.dart';
import '../core/printer.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import '../widgets/shell.dart';
import '../widgets/web.dart';

/// Setting up the receipt printer: pick the paired Bluetooth printer (or a
/// Wi-Fi one), paper size, auto-print, and a test page.
class PrinterScreen extends StatefulWidget {
  const PrinterScreen({super.key});

  @override
  State<PrinterScreen> createState() => _PrinterScreenState();
}

class _PrinterScreenState extends State<PrinterScreen> {
  List<(String, String)>? _paired;
  List<String>? _found;
  bool _busy = false;
  String? _error;
  final _host = TextEditingController(text: receiptPrinter.host ?? '');

  @override
  void initState() {
    super.initState();
    receiptPrinter.addListener(_changed);
  }

  @override
  void dispose() {
    receiptPrinter.removeListener(_changed);
    _host.dispose();
    super.dispose();
  }

  void _changed() => mounted ? setState(() {}) : null;

  Future<void> _run(Future<void> Function() job) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await job();
    } on PrinterException catch (e) {
      _error = e.message;
    } catch (e) {
      _error = 'Something went wrong: $e';
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _loadPaired() => _run(() async => _paired = await receiptPrinter.pairedPrinters());

  Future<void> _test() => _run(() async {
        await receiptPrinter.printTest();
        deviceStatus.printed();
        if (mounted) showMessage(context, 'Test page sent to ${receiptPrinter.label}.');
      });

  @override
  Widget build(BuildContext context) {
    final p = receiptPrinter;
    final bt = p.kind == 'bluetooth';
    return PageBody(
      children: [
        PageHeader(
          title: 'Receipt printer',
          subtitle:
              'Receipts print straight from this tablet to the store\'s printer — after every sale, and from any receipt\'s "Print receipt". '
              'No internet needed.',
          actions: [
            if (p.ready) WebButton('Print a test page', busy: _busy, onPressed: _test),
          ],
        ),
        if (_error != null) ...[NoticeBox(tone: Tone.bad, child: Text(_error!)), const SizedBox(height: 16)],
        ListenableBuilder(
          listenable: deviceStatus,
          builder: (_, _) => deviceStatus.printer == PrinterState.notConnected && deviceStatus.printerProblem != null
              ? Padding(padding: const EdgeInsets.only(bottom: 16), child: NoticeBox(tone: Tone.warn, child: Text(deviceStatus.printerProblem!)))
              : const SizedBox.shrink(),
        ),
        WebCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              CardHeader(
                title: 'Printer',
                description: p.ready ? 'Using ${p.label}' : 'No printer chosen yet',
                actions: ListenableBuilder(
                  listenable: deviceStatus,
                  builder: (_, _) => switch (deviceStatus.printer) {
                    PrinterState.connected => const WebBadge('Connected', tone: Tone.good),
                    PrinterState.checking => const WebBadge('Checking…', tone: Tone.info),
                    PrinterState.notConnected => const WebBadge('Not connected', tone: Tone.warn),
                    PrinterState.notSetUp => const WebBadge('Not set up', tone: Tone.neutral),
                  },
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const FieldLabel('Connection'),
                    _Segmented(
                      options: const [('bluetooth', 'Bluetooth'), ('wifi', 'Wi-Fi')],
                      value: p.kind,
                      onChanged: (v) => p.save(kind: v),
                    ),
                    const SizedBox(height: 20),
                    if (bt) ...[
                      const NoticeBox(
                        child: Text(
                          'First pair the printer with this tablet: Settings → Bluetooth (or Connected devices) → Pair new device → '
                          'choose the printer (often named "POS-58", "Printer001", "XP-…" or "MTP-…"). If it asks for a PIN, try 0000 or 1234. '
                          'Then come back here and choose it below.',
                        ),
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          WebButton(
                            _paired == null ? 'Show paired printers' : 'Refresh list',
                            kind: BtnKind.secondary,
                            busy: _busy && _paired == null,
                            onPressed: _loadPaired,
                          ),
                        ],
                      ),
                      if (_paired != null) ...[
                        const SizedBox(height: 12),
                        if (_paired!.isEmpty)
                          const Text('Nothing is paired yet. Pair the printer in the tablet\'s Bluetooth settings first.', style: tMuted)
                        else
                          _DeviceList(
                            items: [for (final (name, address) in _paired!) (name, address, address == p.btAddress)],
                            onPick: (i) async {
                              final (name, address) = _paired![i];
                              await p.save(kind: 'bluetooth', btAddress: address, btName: name);
                              await _test();
                            },
                          ),
                      ],
                    ] else ...[
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                const FieldLabel('Printer IP address'),
                                TextField(
                                  controller: _host,
                                  style: tSm,
                                  keyboardType: TextInputType.number,
                                  decoration: const InputDecoration(hintText: 'e.g. 192.168.1.50 (printed on the printer\'s self-test page)'),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          WebButton('Save', onPressed: () => p.save(kind: 'wifi', host: _host.text)),
                          const SizedBox(width: 8),
                          WebButton(
                            'Find printers',
                            kind: BtnKind.secondary,
                            busy: _busy && _found == null,
                            onPressed: () => _run(() async => _found = await ReceiptPrinter.discover()),
                          ),
                        ],
                      ),
                      if (_found != null) ...[
                        const SizedBox(height: 12),
                        if (_found!.isEmpty)
                          const Text('No printers found on this Wi-Fi. Check that the printer is on and connected to the same network.', style: tMuted)
                        else
                          _DeviceList(
                            items: [for (final h in _found!) ('Network printer', h, h == p.host)],
                            onPick: (i) async {
                              _host.text = _found![i];
                              await p.save(kind: 'wifi', host: _found![i]);
                              await _test();
                            },
                          ),
                      ],
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        WebCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const CardHeader(title: 'Settings'),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const FieldLabel('Paper width'),
                    _Segmented(
                      options: const [('58', '58 mm'), ('80', '80 mm')],
                      value: '${p.paperMm}',
                      onChanged: (v) => p.save(paperMm: int.parse(v)),
                    ),
                    const SizedBox(height: 8),
                    _Toggle(
                      title: 'Print a receipt after every sale',
                      subtitle: 'Off: print only when "Print receipt" is tapped.',
                      value: p.autoPrint,
                      onChanged: (v) => p.save(autoPrint: v),
                    ),
                    _Toggle(
                      title: 'Open the cash drawer on cash sales',
                      subtitle: 'Only if a cash drawer is plugged into the printer.',
                      value: p.openDrawer,
                      onChanged: (v) => p.save(openDrawer: v),
                    ),
                  ],
                ),
              ),
              if (p.ready)
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: WebButton('Forget this printer', kind: BtnKind.danger, onPressed: () => p.save(forget: true)),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _DeviceList extends StatelessWidget {
  const _DeviceList({required this.items, required this.onPick});
  final List<(String name, String detail, bool current)> items;
  final ValueChanged<int> onPick;

  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(border: Border.all(color: Brand.line), borderRadius: BorderRadius.circular(8)),
        clipBehavior: Clip.antiAlias,
        child: Column(
          children: [
            for (var i = 0; i < items.length; i++)
              Container(
                decoration: BoxDecoration(border: i == 0 ? null : const Border(top: BorderSide(color: Brand.slate100))),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: Row(
                  children: [
                    const Icon(Icons.print_outlined, size: 20, color: Brand.muted),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(items[i].$1, style: tSm.copyWith(fontWeight: FontWeight.w500)),
                          Text(items[i].$2, style: tXs),
                        ],
                      ),
                    ),
                    if (items[i].$3)
                      const WebBadge('In use', tone: Tone.good)
                    else
                      WebButton('Use this printer', kind: BtnKind.secondary, onPressed: () => onPick(i)),
                  ],
                ),
              ),
          ],
        ),
      );
}

class _Segmented extends StatelessWidget {
  const _Segmented({required this.options, required this.value, required this.onChanged});
  final List<(String, String)> options;
  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) => Align(
        alignment: Alignment.centerLeft,
        child: Container(
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(color: Brand.slate100, borderRadius: BorderRadius.circular(6)),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final (key, label) in options)
                GestureDetector(
                  onTap: () => onChanged(key),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 150),
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
                    decoration: BoxDecoration(
                      color: value == key ? Colors.white : Colors.transparent,
                      borderRadius: BorderRadius.circular(4),
                      boxShadow: value == key ? Brand.shadowSm : null,
                    ),
                    child: Text(label,
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: value == key ? Brand.ink : Brand.muted)),
                  ),
                ),
            ],
          ),
        ),
      );
}

class _Toggle extends StatelessWidget {
  const _Toggle({required this.title, required this.subtitle, required this.value, required this.onChanged});
  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [Text(title, style: tLabel), Text(subtitle, style: tXs)],
              ),
            ),
            Switch(value: value, onChanged: onChanged, activeTrackColor: Brand.navy),
          ],
        ),
      );
}
