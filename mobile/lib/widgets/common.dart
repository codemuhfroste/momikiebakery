import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/format.dart';
import '../core/models.dart';
import '../core/theme.dart';

/// The strip under the app bar that always says whether the phone is online
/// and how much is waiting to be sent — the one thing staff must be able to
/// trust during a blackout.
class SyncBanner extends StatelessWidget {
  const SyncBanner({super.key});

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final Color bg;
    final Color fg;
    final IconData icon;
    final String text;
    if (app.needsLogin) {
      (bg, fg, icon, text) = (const Color(0xFFFEF3C7), Brand.warn, Icons.lock_outline, 'Sign in again to send ${app.waitingCount} waiting item(s)');
    } else if (!app.online) {
      (bg, fg, icon, text) = (
        const Color(0xFFFEF3C7),
        Brand.warn,
        Icons.cloud_off,
        app.waitingCount == 0 ? 'Offline — sales are saved on this phone' : 'Offline — ${app.waitingCount} saved on this phone, will send when back online',
      );
    } else if (app.syncing) {
      (bg, fg, icon, text) = (const Color(0xFFE8EDFA), Brand.navy, Icons.sync, 'Syncing…');
    } else if (app.waitingCount > 0) {
      (bg, fg, icon, text) = (const Color(0xFFE8EDFA), Brand.navy, Icons.schedule, '${app.waitingCount} waiting to send');
    } else {
      (bg, fg, icon, text) = (
        const Color(0xFFECFDF5),
        Brand.good,
        Icons.cloud_done_outlined,
        app.lastSyncAt == null ? 'Online' : 'Online · synced ${timeOfDay(app.lastSyncAt!)}',
      );
    }
    return Material(
      color: bg,
      child: InkWell(
        onTap: app.syncing ? null : app.syncNow,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              Icon(icon, size: 18, color: fg),
              const SizedBox(width: 8),
              Expanded(child: Text(text, style: TextStyle(color: fg, fontWeight: FontWeight.w600, fontSize: 13))),
              if (app.attentionCount > 0)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: Brand.bad, borderRadius: BorderRadius.circular(10)),
                  child: Text('${app.attentionCount} need attention',
                      style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A product's photo, or tinted initials when it has none (or when offline
/// and the photo isn't cached) — same idea as the website's placeholders.
class ProductThumb extends StatelessWidget {
  const ProductThumb({super.key, required this.product, this.size = 44, this.radius = 8});

  final Product product;
  final double size;
  final double radius;

  static const _tints = [
    (Color(0xFFFEF3C7), Color(0xFF92400E)),
    (Color(0xFFE0F2FE), Color(0xFF075985)),
    (Color(0xFFD1FAE5), Color(0xFF065F46)),
    (Color(0xFFFFE4E6), Color(0xFF9F1239)),
    (Color(0xFFEDE9FE), Color(0xFF5B21B6)),
    (Color(0xFFFFEDD5), Color(0xFF9A3412)),
    (Color(0xFFCCFBF1), Color(0xFF115E59)),
    (Color(0xFFE2E8F0), Color(0xFF334155)),
  ];

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final url = app.api.photoUrl(product);
    final fallback = _initials();
    final child = url == null
        ? fallback
        : Image.network(
            url,
            headers: app.api.imageHeaders,
            fit: BoxFit.cover,
            errorBuilder: (_, _, _) => fallback,
          );
    return ClipRRect(borderRadius: BorderRadius.circular(radius), child: SizedBox(width: size, height: size, child: child));
  }

  Widget _initials() {
    var hash = 0;
    for (final c in product.name.codeUnits) {
      hash = (hash * 31 + c) & 0x7fffffff;
    }
    final (bg, fg) = _tints[hash % _tints.length];
    final words = product.name.replaceAll(RegExp(r'[^A-Za-z0-9 ]'), ' ').split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    final letters = words.length > 1 ? words[0][0] + words[1][0] : (words.isEmpty ? '?' : words[0].substring(0, words[0].length.clamp(0, 2)));
    return Container(
      color: bg,
      alignment: Alignment.center,
      child: Text(letters.toUpperCase(),
          style: TextStyle(color: fg, fontWeight: FontWeight.w700, fontSize: size * 0.3)),
    );
  }
}

class Pill extends StatelessWidget {
  const Pill(this.text, {super.key, this.color = Brand.muted});
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(6)),
        child: Text(text, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600)),
      );
}

void showMessage(BuildContext context, String text, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text), backgroundColor: error ? Brand.bad : null, behavior: SnackBarBehavior.floating));
}
