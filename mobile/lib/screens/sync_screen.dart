import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/format.dart';
import '../core/theme.dart';

/// Connection, what's waiting, what the server couldn't accept, and the
/// account — everything about getting this phone's work into the system.
class SyncScreen extends StatelessWidget {
  const SyncScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final rejectedSales = app.pendingSales.where((s) => s.status == 'rejected').toList();
    final rejectedPayments = app.pendingPayments.where((p) => p.status == 'rejected').toList();

    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                Icon(app.online ? Icons.cloud_done_outlined : Icons.cloud_off, color: app.online ? Brand.good : Brand.warn),
                const SizedBox(width: 8),
                Text(app.online ? 'Online' : 'Offline', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              ]),
              const SizedBox(height: 8),
              _Row('Waiting to send', '${app.waitingCount}'),
              _Row('Need attention', '${app.attentionCount}'),
              _Row('Last synced', app.lastSyncAt == null ? 'Never' : dateTime(app.lastSyncAt!)),
              _Row('Products on this phone', '${app.products.length}'),
              if (app.lastError != null)
                Padding(padding: const EdgeInsets.only(top: 8), child: Text(app.lastError!, style: const TextStyle(color: Brand.bad))),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: app.syncing ? null : app.syncNow,
                icon: app.syncing
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.sync),
                label: Text(app.syncing ? 'Syncing…' : 'Sync now'),
              ),
            ]),
          ),
        ),
        if (rejectedSales.isNotEmpty || rejectedPayments.isNotEmpty) ...[
          const Padding(
            padding: EdgeInsets.fromLTRB(4, 18, 4, 6),
            child: Text('NEEDS ATTENTION', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Brand.bad, letterSpacing: 1)),
          ),
          const Padding(
            padding: EdgeInsets.fromLTRB(4, 0, 4, 8),
            child: Text(
              'The server couldn\'t record these as they were. They stay on this phone until you try again or remove them '
              '(for example after entering them on the website).',
              style: TextStyle(color: Brand.muted, fontSize: 12),
            ),
          ),
          for (final s in rejectedSales)
            _Attention(
              title: 'Sale · ${peso(s.total)} · ${s.paymentMethod}',
              detail: '${dateTime(s.recordedAt)} · ${s.items.map((i) => '${qty(i.qty)}× ${i.name}').join(', ')}',
              error: s.error ?? '',
              onRetry: () => app.retry(s.clientUuid),
              onRemove: () => app.discard(s.clientUuid),
            ),
          for (final p in rejectedPayments)
            _Attention(
              title: 'Payment · ${peso(p.amount)} from ${p.customerName}',
              detail: '${dateTime(p.recordedAt)} · ${p.method}',
              error: p.error ?? '',
              onRetry: () => app.retry(p.clientUuid),
              onRemove: () => app.discard(p.clientUuid),
            ),
        ],
        if (app.recentReceipts.isNotEmpty) ...[
          const Padding(
            padding: EdgeInsets.fromLTRB(4, 18, 4, 6),
            child: Text('RECENTLY SYNCED FROM THIS PHONE', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Brand.muted, letterSpacing: 1)),
          ),
          for (final r in app.recentReceipts.take(15))
            Card(
              margin: const EdgeInsets.only(bottom: 6),
              child: ListTile(
                dense: true,
                title: Text(r.receiptNo, style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text('${dateTime(r.recordedAt)}${r.note == null ? '' : '\n⚠ ${r.note}'}'),
                trailing: Text(peso(r.total)),
              ),
            ),
        ],
        const SizedBox(height: 18),
        Card(
          child: Column(children: [
            ListTile(
              leading: const Icon(Icons.person_outline),
              title: Text(app.meName ?? '—'),
              subtitle: Text(app.meRole == 'owner' ? 'Owner' : 'Cashier'),
            ),
            ListTile(leading: const Icon(Icons.dns_outlined), title: const Text('Server'), subtitle: Text(app.api.baseUrl)),
            ListTile(
              leading: const Icon(Icons.logout, color: Brand.bad),
              title: const Text('Sign out', style: TextStyle(color: Brand.bad)),
              subtitle: app.waitingCount > 0 ? Text('${app.waitingCount} item(s) stay on this phone and send after the next sign-in.') : null,
              onTap: () => app.logout(),
            ),
          ]),
        ),
      ],
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value);
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(children: [Text(label, style: const TextStyle(color: Brand.muted)), const Spacer(), Text(value, style: const TextStyle(fontWeight: FontWeight.w600))]),
      );
}

class _Attention extends StatelessWidget {
  const _Attention({required this.title, required this.detail, required this.error, required this.onRetry, required this.onRemove});
  final String title;
  final String detail;
  final String error;
  final VoidCallback onRetry;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) => Card(
        margin: const EdgeInsets.only(bottom: 8),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: const BorderSide(color: Color(0xFFFECACA))),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
            Text(detail, style: const TextStyle(color: Brand.muted, fontSize: 12)),
            const SizedBox(height: 6),
            Text(error, style: const TextStyle(color: Brand.bad)),
            Row(mainAxisAlignment: MainAxisAlignment.end, children: [
              TextButton(
                onPressed: () async {
                  final sure = await showDialog<bool>(
                    context: context,
                    builder: (_) => AlertDialog(
                      title: const Text('Remove from this phone?'),
                      content: const Text('Only do this if it has been dealt with another way. It will not be recorded.'),
                      actions: [
                        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
                        TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Remove', style: TextStyle(color: Brand.bad))),
                      ],
                    ),
                  );
                  if (sure == true) onRemove();
                },
                child: const Text('Remove', style: TextStyle(color: Brand.bad)),
              ),
              FilledButton(onPressed: onRetry, child: const Text('Try again')),
            ]),
          ]),
        ),
      );
}
