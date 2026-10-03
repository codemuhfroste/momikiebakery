import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/format.dart';
import '../core/models.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

/// Today's sales: anything still on this phone first, then what the server
/// has recorded (from every register and the website).
class SalesScreen extends StatelessWidget {
  const SalesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final waiting = app.pendingSales.where((s) => s.status == 'pending').toList().reversed.toList();
    final recorded = app.serverSales.where((s) => !s.voided).toList();
    final total = recorded.fold<double>(0, (s, x) => s + x.total);

    return RefreshIndicator(
      onRefresh: () async {
        await app.syncNow();
        await app.refreshServerSales();
      },
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text("Today's recorded sales", style: TextStyle(color: Brand.muted)),
                    Text(peso(total), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w800)),
                    Text('${recorded.length} sales${app.online ? '' : ' · as of last sync'}',
                        style: const TextStyle(color: Brand.muted, fontSize: 12)),
                  ]),
                ),
                if (waiting.isNotEmpty)
                  Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    const Text('On this phone', style: TextStyle(color: Brand.warn, fontSize: 12)),
                    Text(peso(waiting.fold<double>(0, (s, x) => s + x.total)),
                        style: const TextStyle(fontWeight: FontWeight.w700, color: Brand.warn)),
                  ]),
              ]),
            ),
          ),
          if (waiting.isNotEmpty) ...[
            const _Heading('Waiting to send', 'Saved on this phone; they go up automatically.'),
            for (final s in waiting) _PendingTile(sale: s),
          ],
          const _Heading('Recorded today', 'Pull down to refresh.'),
          if (app.serverSales.isEmpty)
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text('No recorded sales yet today.', style: TextStyle(color: Brand.muted)),
            ),
          for (final s in app.serverSales) _ServerSaleTile(sale: s),
        ],
      ),
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.title, this.hint);
  final String title;
  final String hint;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 18, 4, 6),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title.toUpperCase(), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Brand.muted, letterSpacing: 1)),
          Text(hint, style: const TextStyle(fontSize: 12, color: Brand.muted)),
        ]),
      );
}

class _PendingTile extends StatelessWidget {
  const _PendingTile({required this.sale});
  final PendingSale sale;
  @override
  Widget build(BuildContext context) => Card(
        margin: const EdgeInsets.only(bottom: 6),
        child: ListTile(
          leading: const Icon(Icons.schedule, color: Brand.warn),
          title: Text('${sale.items.length} item(s) · ${sale.paymentMethod}${sale.customerName == null ? '' : ' · ${sale.customerName}'}'),
          subtitle: Text('${timeOfDay(sale.recordedAt)} · ${sale.items.map((i) => '${qty(i.qty)}× ${i.name}').join(', ')}',
              maxLines: 1, overflow: TextOverflow.ellipsis),
          trailing: Text(peso(sale.total), style: const TextStyle(fontWeight: FontWeight.w700)),
        ),
      );
}

class _ServerSaleTile extends StatelessWidget {
  const _ServerSaleTile({required this.sale});
  final ServerSale sale;
  @override
  Widget build(BuildContext context) => Card(
        margin: const EdgeInsets.only(bottom: 6),
        child: ListTile(
          title: Row(children: [
            Flexible(child: Text(sale.receiptNo, style: TextStyle(fontWeight: FontWeight.w600, decoration: sale.voided ? TextDecoration.lineThrough : null))),
            const SizedBox(width: 6),
            if (sale.source == 'mobile') const Pill('App', color: Brand.navy),
            if (sale.voided) const Pill('Voided', color: Brand.bad),
          ]),
          subtitle: Text(
            '${timeOfDay(sale.createdAt)} · ${sale.paymentMethod}${sale.customerName == null ? '' : ' · ${sale.customerName}'}'
            '${sale.syncNote == null ? '' : '\n⚠ ${sale.syncNote}'}',
          ),
          isThreeLine: sale.syncNote != null,
          trailing: Text(peso(sale.total), style: const TextStyle(fontWeight: FontWeight.w700)),
        ),
      );
}
