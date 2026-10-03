import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/format.dart';
import '../core/models.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

/// Credit customers (utang) with their balances, and recording payments —
/// which works offline like sales do.
class CreditScreen extends StatefulWidget {
  const CreditScreen({super.key});

  @override
  State<CreditScreen> createState() => _CreditScreenState();
}

class _CreditScreenState extends State<CreditScreen> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final list = app.customers.where((c) => _q.isEmpty || c.name.toLowerCase().contains(_q) || (c.phone ?? '').contains(_q)).toList()
      ..sort((a, b) => b.balance.compareTo(a.balance));
    final owed = app.customers.fold<double>(0, (s, c) => s + (c.balance > 0 ? c.balance : 0));

    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Total owed to the store', style: TextStyle(color: Brand.muted)),
              Text(peso(owed), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
            ]),
          ),
        ),
        const SizedBox(height: 10),
        TextField(
          decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search name or mobile'),
          onChanged: (v) => setState(() => _q = v.trim().toLowerCase()),
        ),
        const SizedBox(height: 10),
        if (list.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Text('No customers.', style: TextStyle(color: Brand.muted))),
        for (final c in list)
          Card(
            margin: const EdgeInsets.only(bottom: 6),
            child: ListTile(
              title: Text(c.name, style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text([
                if (c.phone != null) c.phone!,
                c.creditLimit == null ? 'No limit' : 'Limit ${peso(c.creditLimit!)}',
              ].join(' · ')),
              trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text(peso(c.balance), style: TextStyle(fontWeight: FontWeight.w700, color: c.balance > 0.004 ? Brand.warn : Brand.good)),
                Text(c.balance > 0.004 ? 'owes' : 'paid up', style: const TextStyle(fontSize: 11, color: Brand.muted)),
              ]),
              onTap: c.balance > 0.004 ? () => _pay(c) : null,
            ),
          ),
      ],
    );
  }

  Future<void> _pay(Customer c) async {
    final done = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _PaymentSheet(customer: c),
    );
    if (done == true && mounted) showMessage(context, 'Payment saved for ${c.name}.');
  }
}

class _PaymentSheet extends StatefulWidget {
  const _PaymentSheet({required this.customer});
  final Customer customer;
  @override
  State<_PaymentSheet> createState() => _PaymentSheetState();
}

class _PaymentSheetState extends State<_PaymentSheet> {
  final _amount = TextEditingController();
  final _note = TextEditingController();
  String _method = 'Cash';
  String? _error;
  bool _busy = false;

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await AppScope.read(context).recordPayment(
      customer: widget.customer,
      amount: double.tryParse(_amount.text) ?? 0,
      method: _method,
      note: _note.text,
    );
    if (!mounted) return;
    if (error != null) {
      setState(() {
        _busy = false;
        _error = error;
      });
    } else {
      Navigator.of(context).pop(true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.customer;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Payment from ${c.name}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            Text('Owes ${peso(c.balance)}. Applied to their oldest unpaid receipts first.', style: const TextStyle(color: Brand.muted)),
            const SizedBox(height: 14),
            TextField(
              controller: _amount,
              autofocus: true,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: InputDecoration(
                labelText: 'Amount received (₱)',
                suffixIcon: TextButton(onPressed: () => setState(() => _amount.text = c.balance.toStringAsFixed(2)), child: const Text('Full')),
              ),
            ),
            const SizedBox(height: 10),
            Wrap(spacing: 6, children: [
              for (final m in creditPaymentMethods)
                ChoiceChip(label: Text(m), selected: _method == m, onSelected: (_) => setState(() => _method = m)),
            ]),
            const SizedBox(height: 10),
            TextField(controller: _note, decoration: const InputDecoration(labelText: 'Note (optional)', hintText: 'e.g. GCash ref. no.')),
            if (_error != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_error!, style: const TextStyle(color: Brand.bad))),
            const SizedBox(height: 14),
            FilledButton(onPressed: _busy ? null : _save, child: const Text('Record payment')),
          ]),
        ),
      ),
    );
  }
}
