import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/format.dart';
import '../core/models.dart';
import '../core/theme.dart';

/// What to say about the connection and the outbox — the one thing staff
/// must be able to trust during a blackout. Shown in the sidebar (wide) or
/// the top bar (narrow).
class SyncStatus {
  const SyncStatus(this.text, this.color, this.icon, {this.short});
  final String text;
  final String? short;
  final Color color;
  final IconData icon;

  factory SyncStatus.of(AppState app) {
    if (app.needsLogin) {
      return SyncStatus('Sign in again to send ${app.waitingCount} waiting', Brand.amber400, Icons.lock_outline, short: 'Sign in again');
    }
    if (!app.online) {
      return SyncStatus(
        app.waitingCount == 0 ? 'Offline — sales are saved on this tablet' : 'Offline — ${app.waitingCount} saved, sends when back online',
        Brand.amber400,
        Icons.cloud_off,
        short: app.waitingCount == 0 ? 'Offline' : 'Offline · ${app.waitingCount} waiting',
      );
    }
    if (app.syncing) return const SyncStatus('Syncing…', Color(0xFF93C5FD), Icons.sync);
    if (app.waitingCount > 0) {
      return SyncStatus('${app.waitingCount} waiting to send', const Color(0xFF93C5FD), Icons.schedule);
    }
    return SyncStatus(
      app.lastSyncAt == null ? 'Online' : 'Online · synced ${timeOfDay(app.lastSyncAt!)}',
      const Color(0xFF6EE7B7),
      Icons.cloud_done_outlined,
      short: 'Online',
    );
  }
}

/// A product's photo, or — like the website's placeholders — a tinted tile
/// with its initials (colour picked from the name, so it never changes).
class ProductThumb extends StatelessWidget {
  const ProductThumb({super.key, required this.product, this.size = 40, this.radius = 6, this.fontSize});

  final Product product;
  final double size;
  final double radius;
  final double? fontSize;

  // Tailwind's bg-*-100 / text-*-800 pairs, in the website's order.
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
        : Image.network(url, headers: app.api.imageHeaders, fit: BoxFit.cover, errorBuilder: (_, _, _) => fallback);
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: ColoredBox(
        color: Colors.white,
        child: SizedBox(width: size, height: size, child: child),
      ),
    );
  }

  Widget _initials() {
    // Same hash as the website (JavaScript's 32-bit `hash * 31 + code | 0`).
    var hash = 0;
    for (final c in product.name.codeUnits) {
      hash = (hash * 31 + c).toSigned(32);
    }
    final (bg, fg) = _tints[hash.abs() % _tints.length];
    final words = product.name.replaceAll(RegExp(r'[^A-Za-z0-9 ]'), ' ').split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    final letters = words.length > 1
        ? words[0][0] + words[1][0]
        : (words.isEmpty ? '?' : words[0].substring(0, words[0].length.clamp(0, 2)));
    return Container(
      color: bg,
      alignment: Alignment.center,
      child: Text(
        letters.toUpperCase(),
        style: TextStyle(color: fg, fontWeight: FontWeight.w600, fontSize: fontSize ?? size * 0.3),
      ),
    );
  }
}

void showMessage(BuildContext context, String text, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text), backgroundColor: error ? Brand.red700 : null));
}
