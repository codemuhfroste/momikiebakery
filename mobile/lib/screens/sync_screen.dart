import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../widgets/shell.dart';
import 'web_page.dart';
import '../widgets/web.dart';

/// Connection, what's waiting, what the server couldn't accept, and the
/// account — everything about getting this tablet's work into the system.
/// Built from the same parts as the website's pages.
class SyncScreen extends StatelessWidget {
  const SyncScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final rejectedSales = app.pendingSales.where((s) => s.status == 'rejected').toList();
    final rejectedPayments = app.pendingPayments.where((p) => p.status == 'rejected').toList();

    return PageBody(
      onRefresh: app.syncNow,
      children: [
        PageHeader(
          title: 'Sync',
          subtitle:
              'Sales and credit payments are saved on this tablet first, then sent to the website whenever there is internet — so the register keeps working during a brownout.',
          actions: [WebButton(app.syncing ? 'Syncing…' : 'Sync now', busy: app.syncing, onPressed: app.syncing ? null : app.syncNow)],
        ),
        if (app.lastError != null) ...[NoticeBox(tone: Tone.warn, child: Text(app.lastError!)), const SizedBox(height: 24)],
        StatGrid(
          children: [
            StatCard(
              label: 'Connection',
              value: app.online ? 'Online' : 'Offline',
              hint: app.online
                  ? 'Connected to ${Uri.tryParse(app.api.baseUrl)?.host ?? app.api.baseUrl}'
                  : 'Sales are saved on this tablet',
              tone: app.online ? StatTone.normal : StatTone.warn,
            ),
            StatCard(label: 'Waiting to send', value: '${app.waitingCount}', hint: 'Sent automatically when online'),
            StatCard(
              label: 'Need attention',
              value: '${app.attentionCount}',
              hint: 'The server could not record these as they were',
              tone: app.attentionCount > 0 ? StatTone.bad : StatTone.normal,
            ),
            StatCard(
              label: 'Last synced',
              value: app.lastSyncAt == null ? 'Never' : timeOfDay(app.lastSyncAt!),
              hint: '${app.products.length} products on this tablet',
            ),
          ],
        ),
        if (rejectedSales.isNotEmpty || rejectedPayments.isNotEmpty) ...[
          WebCard(
            borderColor: Brand.red200,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const CardHeader(
                  title: 'Needs attention',
                  description:
                      'These stay on this tablet until you try again or remove them (for example after entering them on the website).',
                ),
                WebTable(
                  columns: const [Col('Recorded'), Col('What'), Col('Problem', flex: 2), Col('', right: true)],
                  rows: [
                    for (final s in rejectedSales)
                      [
                        Text(dateTime(s.recordedAt)),
                        Text('Sale · ${peso(s.total)} · ${s.paymentMethod}\n${s.items.map((i) => '${qty(i.qty)}× ${i.name}').join(', ')}'),
                        Text(s.error ?? '', style: const TextStyle(color: Brand.red700)),
                        _Actions(onRetry: () => app.retry(s.clientUuid), onRemove: () => app.discard(s.clientUuid)),
                      ],
                    for (final p in rejectedPayments)
                      [
                        Text(dateTime(p.recordedAt)),
                        Text('Payment · ${peso(p.amount)} from ${p.customerName} · ${p.method}'),
                        Text(p.error ?? '', style: const TextStyle(color: Brand.red700)),
                        _Actions(onRetry: () => app.retry(p.clientUuid), onRemove: () => app.discard(p.clientUuid)),
                      ],
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
        ],
        WebCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const CardHeader(
                title: 'Recently synced from this tablet',
                description: 'Receipt numbers the server gave to sales rung up here.',
              ),
              if (app.recentReceipts.isEmpty)
                const EmptyState('Nothing synced from this tablet yet.')
              else
                WebTable(
                  columns: const [Col('Receipt no.'), Col('Rung up'), Col('Total', right: true), Col('Notes', flex: 2)],
                  rows: [
                    for (final r in app.recentReceipts.take(15))
                      [
                        Text(
                          r.receiptNo,
                          style: const TextStyle(fontWeight: FontWeight.w500, color: Brand.navy),
                        ),
                        Text(dateTime(r.recordedAt)),
                        Text(peso(r.total), style: const TextStyle(fontFeatures: tabular)),
                        r.note == null
                            ? const Text('—', style: TextStyle(color: Brand.muted))
                            : Text('⚠ ${r.note}', style: const TextStyle(color: Brand.amber800)),
                      ],
                  ],
                ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        WebCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const CardHeader(title: 'This tablet'),
              Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _kv('Signed in as', app.meName ?? '—'),
                    _kv('Role', app.meRole == 'owner' ? 'Owner' : 'Cashier'),
                    _kv('Server', app.api.baseUrl),
                    _kv('Products on this tablet', '${app.products.length}'),
                    const SizedBox(height: 16),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: WebButton(
                        'Sign out',
                        kind: BtnKind.danger,
                        onPressed: () async {
                          await clearWebSession();
                          await app.logout();
                        },
                      ),
                    ),
                    if (app.waitingCount > 0)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text('${app.waitingCount} item(s) stay on this tablet and send after the next sign-in.', style: tXs),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _kv(String k, String v) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      children: [
        SizedBox(width: 200, child: Text(k, style: tMuted)),
        Expanded(
          child: Text(v, style: tSm.copyWith(fontWeight: FontWeight.w500)),
        ),
      ],
    ),
  );
}

class _Actions extends StatelessWidget {
  const _Actions({required this.onRetry, required this.onRemove});
  final VoidCallback onRetry;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      WebButton(
        'Remove',
        kind: BtnKind.danger,
        onPressed: () async {
          final sure = await showDialog<bool>(
            context: context,
            builder: (ctx) => AlertDialog(
              title: const Text('Remove from this tablet?', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
              content: const Text('Only do this if it has been dealt with another way. It will not be recorded.', style: tMuted),
              actions: [
                TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                TextButton(
                  onPressed: () => Navigator.pop(ctx, true),
                  child: const Text('Remove', style: TextStyle(color: Brand.red700)),
                ),
              ],
            ),
          );
          if (sure == true) onRemove();
        },
      ),
      const SizedBox(width: 8),
      WebButton('Try again', onPressed: onRetry),
    ],
  );
}
