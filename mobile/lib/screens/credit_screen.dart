import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/format.dart';
import '../core/models.dart';
import '../core/nav.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import '../widgets/shell.dart';
import '../widgets/web.dart';

/// The website's Credit Accounts page (/customers): figures, then the
/// searchable, sortable customers table. Tapping a customer records a
/// payment — which works offline like sales do.
class CreditScreen extends StatefulWidget {
  const CreditScreen({super.key});

  @override
  State<CreditScreen> createState() => _CreditScreenState();
}

const _sorts = ['Balance (Highest)', 'Name (A–Z)', 'Recent activity', 'Owed the longest'];

class _CreditScreenState extends State<CreditScreen> {
  String _q = '';
  int _sort = 0;

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final customers = app.customers;
    final owed = customers.fold<double>(0, (s, c) => s + c.balance);
    final debtors = customers.where((c) => c.balance > 0.004).length;
    final overLimit = customers.where((c) => c.overLimit).length;
    final today = app.todayManila();
    final collectedHere = app.pendingPayments
        .where((p) => p.status == 'pending' && manilaDate(p.recordedAt) == today)
        .fold<double>(0, (s, p) => s + p.amount);

    final list = customers.where((c) {
      if (_q.isEmpty) return true;
      return '${c.name} ${c.phone ?? ''} ${c.address ?? ''}'.toLowerCase().contains(_q);
    }).toList();
    switch (_sort) {
      case 0:
        list.sort((a, b) => b.balance.compareTo(a.balance));
      case 1:
        list.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
      case 2:
        list.sort((a, b) => (b.lastActivity ?? DateTime(1970)).compareTo(a.lastActivity ?? DateTime(1970)));
      case 3:
        list.sort((a, b) => (a.oldestUnpaid ?? DateTime(9999)).compareTo(b.oldestUnpaid ?? DateTime(9999)));
    }

    return PageBody(
      onRefresh: app.syncNow,
      children: [
        const PageHeader(
          title: 'Credit Accounts',
          subtitle:
              'Customers who may buy now and pay later (utang). Each account shows what is owed, every purchase on credit, and every payment received.',
        ),
        StatGrid(
          children: [
            StatCard(label: 'Total owed to the store', value: peso(owed)),
            StatCard(label: 'Customers with a balance', value: '$debtors'),
            StatCard(label: 'Payments received today', value: peso(app.paymentsToday + collectedHere)),
            StatCard(label: 'Over their limit', value: '$overLimit', tone: overLimit > 0 ? StatTone.bad : StatTone.normal),
          ],
        ),
        WebCard(
          child: customers.isEmpty
              ? const EmptyState(
                  'No credit customers yet. Add a customer on the website, then choose Credit as the payment at the register.',
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TableControls(
                      hint: 'Search by name, mobile number or address…',
                      onQuery: (v) => setState(() => _q = v.trim().toLowerCase()),
                      sortLabel: _sorts[_sort],
                      sortOptions: _sorts,
                      onSort: (i) => setState(() => _sort = i),
                    ),
                    if (list.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 32),
                        child: Center(child: Text('No customers match.', style: tMuted)),
                      )
                    else
                      WebTable(
                        columns: const [
                          Col('Customer'),
                          Col('Mobile'),
                          Col('Credit limit', right: true),
                          Col('Balance owed', right: true),
                          Col('Owed for'),
                          Col('Last activity'),
                          Col('Status'),
                        ],
                        onRowTap: (i) => _pay(list[i]),
                        rows: [for (final c in list) _row(c)],
                      ),
                  ],
                ),
        ),
        const Padding(
          padding: EdgeInsets.only(top: 12),
          child: Text('Tap a customer to record a payment. Payments are saved on this tablet and sent when online.', style: tXs),
        ),
      ],
    );
  }

  List<Widget> _row(Customer c) {
    final days = c.oldestUnpaid == null ? null : DateTime.now().difference(c.oldestUnpaid!).inDays.clamp(0, 100000);
    final aging = days == null
        ? null
        : (
            days > 60
                ? Tone.bad
                : days > 30
                ? Tone.warn
                : Tone.neutral,
            days == 0 ? 'today' : '$days day${days == 1 ? '' : 's'}',
          );
    final (statusTone, statusLabel) = c.overLimit
        ? (Tone.bad, 'Over limit')
        : c.balance > 0.004
        ? (Tone.warn, 'Has balance')
        : (Tone.good, 'Paid up');
    return [
      Text(
        c.name,
        style: const TextStyle(fontWeight: FontWeight.w500, color: Brand.navy),
      ),
      Text(c.phone ?? '—', style: const TextStyle(color: Brand.muted)),
      Text(
        c.creditLimit == null ? 'No limit' : peso(c.creditLimit!),
        style: const TextStyle(color: Brand.muted, fontFeatures: tabular),
      ),
      Text(
        peso(c.balance),
        style: const TextStyle(fontWeight: FontWeight.w600, fontFeatures: tabular),
      ),
      aging == null ? const Text('—', style: TextStyle(color: Brand.muted)) : WebBadge(aging.$2, tone: aging.$1),
      Text(c.lastActivity == null ? '—' : longDateTime(c.lastActivity!), style: const TextStyle(color: Brand.muted)),
      WebBadge(statusLabel, tone: statusTone),
    ];
  }

  Future<void> _pay(Customer c) async {
    if (c.balance <= 0.004) {
      showMessage(context, '${c.name} has no balance to pay.');
      return;
    }
    final done = await showWebDialog<bool>(
      context,
      title: 'Record payment',
      description: '${c.name} owes ${peso(c.balance)}. Applied to their oldest unpaid receipts first.',
      body: (_) => _PaymentForm(customer: c),
    );
    if (done == true && mounted) showMessage(context, 'Payment saved for ${c.name}.');
  }
}

class _PaymentForm extends StatefulWidget {
  const _PaymentForm({required this.customer});
  final Customer customer;
  @override
  State<_PaymentForm> createState() => _PaymentFormState();
}

class _PaymentFormState extends State<_PaymentForm> {
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
    final error = await AppScope.read(
      context,
    ).recordPayment(customer: widget.customer, amount: double.tryParse(_amount.text) ?? 0, method: _method, note: _note.text);
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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const FieldLabel('Amount received (₱)'),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _amount,
                autofocus: true,
                style: tSm.copyWith(fontFeatures: tabular),
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(hintText: '0.00'),
              ),
            ),
            const SizedBox(width: 8),
            WebButton(
              'Full balance',
              kind: BtnKind.secondary,
              onPressed: () => setState(() => _amount.text = c.balance.toStringAsFixed(2)),
            ),
          ],
        ),
        const SizedBox(height: 16),
        const FieldLabel('Paid by'),
        Row(
          children: [
            for (var i = 0; i < creditPaymentMethods.length; i++) ...[
              if (i > 0) const SizedBox(width: 6),
              Expanded(
                child: Material(
                  color: _method == creditPaymentMethods[i] ? Brand.navy : Colors.white,
                  borderRadius: BorderRadius.circular(6),
                  child: InkWell(
                    onTap: () => setState(() => _method = creditPaymentMethods[i]),
                    borderRadius: BorderRadius.circular(6),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(color: _method == creditPaymentMethods[i] ? Brand.navy : Brand.line),
                      ),
                      child: Text(
                        creditPaymentMethods[i],
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: _method == creditPaymentMethods[i] ? Colors.white : Brand.ink,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
        const SizedBox(height: 16),
        const FieldLabel('Note (optional)'),
        TextField(
          controller: _note,
          style: tSm,
          decoration: const InputDecoration(hintText: 'e.g. GCash reference number'),
        ),
        if (_error != null) ...[const SizedBox(height: 12), NoticeBox(tone: Tone.bad, child: Text(_error!))],
        const SizedBox(height: 20),
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            // The customer's page on the website: statement, purchases, receipts.
            WebLink(
              'Open account',
              onTap: () {
                Navigator.of(context).pop();
                appNav.go('credit', path: '/customers/${widget.customer.id}');
              },
            ),
            const Spacer(),
            WebButton('Cancel', kind: BtnKind.secondary, onPressed: () => Navigator.of(context).pop()),
            const SizedBox(width: 8),
            WebButton('Record payment', busy: _busy, onPressed: _save),
          ],
        ),
      ],
    );
  }
}
