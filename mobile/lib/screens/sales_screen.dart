import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../core/app_state.dart';
import '../core/format.dart';
import '../core/models.dart';
import '../core/nav.dart';
import '../core/theme.dart';
import '../widgets/shell.dart';
import '../widgets/web.dart';

enum _Filter { all, credit, overrides, voided }

/// The website's Transactions page (/sales): one day's sales with figures,
/// filter tabs and the receipts table — plus anything rung up on this tablet
/// that hasn't reached the server yet.
class SalesScreen extends StatefulWidget {
  const SalesScreen({super.key});

  @override
  State<SalesScreen> createState() => _SalesScreenState();
}

class _SalesScreenState extends State<SalesScreen> {
  _Filter _filter = _Filter.all;

  Future<void> _pickDate(AppState app) async {
    final current = DateTime.parse(app.salesDate);
    final picked = await showDatePicker(
      context: context,
      initialDate: current,
      firstDate: DateTime(2024),
      lastDate: DateTime.parse(app.todayManila()),
    );
    if (picked != null) await app.refreshServerSales(DateFormat('yyyy-MM-dd').format(picked));
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final date = app.salesDate;
    final showing = app.serverSalesDate == date ? app.serverSales : const <ServerSale>[];
    final valid = showing.where((s) => !s.voided).toList();
    final revenue = valid.fold<double>(0, (s, x) => s + x.total);
    final onCredit = valid.fold<double>(0, (s, x) => s + x.creditAmount);
    final overrideCount = showing.where((s) => s.overrideCount > 0).length;
    final rows = showing
        .where(
          (s) => switch (_filter) {
            _Filter.credit => s.creditAmount > 0,
            _Filter.overrides => s.overrideCount > 0,
            _Filter.voided => s.voided,
            _Filter.all => true,
          },
        )
        .toList();
    final waiting = date == app.todayManila() ? app.pendingSales.reversed.toList() : const <PendingSale>[];
    final dateLabel = DateFormat('MMM d, y').format(DateTime.parse(date));

    return PageBody(
      onRefresh: () async {
        await app.syncNow();
        await app.refreshServerSales();
      },
      children: [
        PageHeader(
          title: 'Transactions',
          subtitle: 'All sales for $dateLabel.${app.online ? '' : ' Offline — showing what was last downloaded.'}',
          actions: [
            const Text('Date', style: tMuted),
            InkWell(
              onTap: () => _pickDate(app),
              borderRadius: BorderRadius.circular(6),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: Brand.line),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(DateFormat('MM/dd/yyyy').format(DateTime.parse(date)), style: tSm.copyWith(fontFeatures: tabular)),
                    const SizedBox(width: 16),
                    const WebIcon(Icons2.calendar, size: 16, color: Brand.ink),
                  ],
                ),
              ),
            ),
            WebButton('Show', kind: BtnKind.secondary, busy: app.loadingSales, onPressed: () => app.refreshServerSales()),
          ],
        ),
        StatGrid(
          children: [
            StatCard(label: 'Total sales', value: peso(revenue), hint: '${valid.length} completed sales'),
            StatCard(label: 'Sold on credit', value: peso(onCredit), hint: 'Not yet paid — added to customer balances'),
            StatCard(
              label: 'Sales with price changes',
              value: '$overrideCount',
              hint: 'At least one item sold at other than SRP',
              tone: overrideCount > 0 ? StatTone.warn : StatTone.normal,
            ),
            StatCard(label: 'Voided sales', value: '${showing.length - valid.length}'),
          ],
        ),
        if (waiting.isNotEmpty) ...[
          WebCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const CardHeader(
                  title: 'Saved on this tablet',
                  description:
                      'Rung up here and not on the server yet. They are sent automatically and then appear below with a receipt number.',
                ),
                WebTable(
                  columns: const [
                    Col('Time'),
                    Col('Customer'),
                    Col('Items', right: true),
                    Col('Payment'),
                    Col('Total', right: true),
                    Col('Status'),
                  ],
                  rows: [
                    for (final s in waiting)
                      [
                        Text(timeOfDay(s.recordedAt)),
                        Text(s.customerName ?? '—'),
                        Text(qty(s.items.fold<double>(0, (n, i) => n + i.qty)), style: const TextStyle(fontFeatures: tabular)),
                        Text(s.paymentMethod),
                        Text(
                          peso(s.total),
                          style: const TextStyle(fontWeight: FontWeight.w500, fontFeatures: tabular),
                        ),
                        s.status == 'rejected'
                            ? const WebBadge('Needs attention — see Sync', tone: Tone.bad)
                            : WebBadge(app.online ? 'Sending…' : 'Waiting for internet', tone: Tone.warn),
                      ],
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
        ],
        WebTabs<_Filter>(
          active: _filter,
          onSelect: (f) => setState(() => _filter = f),
          tabs: const [
            (_Filter.all, 'All sales'),
            (_Filter.credit, 'On credit'),
            (_Filter.overrides, 'Price changes'),
            (_Filter.voided, 'Voided'),
          ],
        ),
        WebCard(
          child: app.loadingSales && app.serverSalesDate != date
              ? const Padding(
                  padding: EdgeInsets.all(48),
                  child: Center(child: CircularProgressIndicator()),
                )
              : rows.isEmpty
              ? EmptyState(
                  app.serverSalesDate != date && !app.online
                      ? "Connect to the internet to see this day's sales."
                      : 'No sales to show for this date and filter.',
                )
              : WebTable(
                  columns: const [
                    Col('Receipt no.'),
                    Col('Time'),
                    Col('Cashier'),
                    Col('Customer'),
                    Col('Items', right: true),
                    Col('Payment'),
                    Col('Total', right: true),
                    Col('Notes', flex: 2),
                  ],
                  // A receipt opens the website's receipt page (items, void, print).
                  onRowTap: (i) => appNav.go('sales', path: '/sales/${rows[i].id}'),
                  rows: [for (final s in rows) _row(s)],
                ),
        ),
      ],
    );
  }

  List<Widget> _row(ServerSale s) {
    final muted = s.voided ? Brand.muted : Brand.ink;
    final credit = s.creditAmount > 0 && !s.voided
        ? (s.creditPaid <= 0.004
              ? ('Unpaid', Tone.bad)
              : s.creditPaid >= s.creditAmount - 0.004
              ? ('Paid', Tone.good)
              : ('Partially paid', Tone.warn))
        : null;
    return [
      Text(
        s.receiptNo,
        style: const TextStyle(fontWeight: FontWeight.w500, color: Brand.navy),
      ),
      IntrinsicWidth(
        child: Text(timeOfDay(s.createdAt), softWrap: false, style: TextStyle(color: muted)),
      ), // whitespace-nowrap
      Text(s.cashierName ?? '—', style: TextStyle(color: muted)),
      Text(s.customerName ?? '—', style: TextStyle(color: muted)),
      Text(
        qty(s.itemCount),
        style: TextStyle(color: muted, fontFeatures: tabular),
      ),
      Text(s.paymentMethod, style: TextStyle(color: muted)),
      Text(
        peso(s.total),
        style: TextStyle(
          color: muted,
          fontWeight: FontWeight.w500,
          fontFeatures: tabular,
          decoration: s.voided ? TextDecoration.lineThrough : null,
        ),
      ),
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Wrap(
            spacing: 4,
            runSpacing: 4,
            children: [
              if (credit != null) WebBadge('Credit · ${credit.$1}', tone: credit.$2),
              if (s.overrideCount > 0) const WebBadge('Price changed', tone: Tone.warn),
              if (s.voided) const WebBadge('Voided', tone: Tone.bad),
              if (s.priceType == 'wholesale') const WebBadge('Wholesale', tone: Tone.info),
              if (s.source == 'mobile') const WebBadge('Mobile app', tone: Tone.info),
            ],
          ),
          if (s.syncNote != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 260),
                child: Text('⚠ Check: ${s.syncNote}', style: const TextStyle(fontSize: 12, color: Brand.amber800)),
              ),
            ),
        ],
      ),
    ];
  }
}
