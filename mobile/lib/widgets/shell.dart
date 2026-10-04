// The website's frame (AppShell.tsx): the amber demo banner, the navy sidebar
// with grouped links and "Signed in as", the white header bar — and below
// the 1024px breakpoint, the navy top bar with a ☰ drawer instead.
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../core/app_state.dart';
import '../core/devices.dart';
import '../core/format.dart';
import '../core/nav.dart';
import '../screens/web_page.dart';
import '../core/theme.dart';
import 'common.dart';
import 'web.dart';

/// A sidebar link: a page built into the app (works offline), or — with a
/// [path] — a website page shown inside the app (needs internet).
class NavItem {
  const NavItem(this.id, this.label, this.icon, {this.path, this.ownerOnly = false});
  final String id;
  final String label;
  final String icon;
  final String? path;
  final bool ownerOnly;
}

class NavGroup {
  const NavGroup(this.label, this.items);
  final String label;
  final List<NavItem> items;
}

// The website's sidebar, in the same order. Staff see everything except the
// owner's Audit Log and Staff accounts, as on the site.
const navGroups = [
  NavGroup('Overview', [NavItem('dashboard', 'Dashboard', Icons2.dashboard, path: '/')]),
  NavGroup('Sales', [
    NavItem('register', 'Register', Icons2.register),
    NavItem('sales', 'Transactions', Icons2.sales),
    NavItem('credit', 'Credit Accounts', Icons2.credit),
  ]),
  NavGroup('Stock', [
    NavItem('products', 'Products', Icons2.products, path: '/products'),
    NavItem('inventory', 'Inventory', Icons2.inventory, path: '/inventory'),
  ]),
  NavGroup('Reports', [
    NavItem('expenses', 'Expenses', Icons2.expenses, path: '/expenses'),
    NavItem('eod', 'End of Day', Icons2.eod, path: '/reports'),
    NavItem('report', 'Sales Report', Icons2.report, path: '/reports/sales'),
  ]),
  NavGroup('Records', [
    NavItem('audit', 'Audit Log', Icons2.audit, path: '/audit-log', ownerOnly: true),
    NavItem('staff', 'Staff', Icons2.staff, path: '/staff', ownerOnly: true),
    NavItem('scanner', 'Scanner Check', Icons2.scanner, path: '/scanner'),
  ]),
  NavGroup('This tablet', [NavItem('sync', 'Sync', Icons2.sync), NavItem('printer', 'Printer', Icons2.printer)]),
];

/// "FOR DEMO PURPOSES ONLY" strip, shown while the server is in demo mode.
class DemoBanner extends StatelessWidget {
  const DemoBanner({super.key});
  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    if (!app.demo) return const SizedBox.shrink();
    final wide = MediaQuery.sizeOf(context).width >= 640;
    return Container(
      height: 36,
      color: Brand.amber400,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const WebIcon(Icons2.warning, size: 16, color: Brand.amber950, stroke: 2),
          const SizedBox(width: 8),
          Flexible(
            child: Text.rich(
              TextSpan(
                children: [
                  const TextSpan(
                    text: 'FOR DEMO PURPOSES ONLY. ',
                    style: TextStyle(fontWeight: FontWeight.w700, letterSpacing: 0.35),
                  ),
                  TextSpan(
                    text: wide
                        ? "The data shown here is sample data and does not reflect real data from Momikie's General Merchandise."
                        : "Sample data, not the store's real records.",
                  ),
                ],
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 14, color: Brand.amber950),
            ),
          ),
        ],
      ),
    );
  }
}

/// The white strip at the top of every page on wide screens.
class HeaderBar extends StatelessWidget {
  const HeaderBar({super.key});
  @override
  Widget build(BuildContext context) {
    final today = DateFormat('EEEE, MMMM d, y').format(manila(DateTime.now()));
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 12),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(bottom: BorderSide(color: Brand.line)),
      ),
      child: Row(
        children: [
          const Expanded(
            child: Text(
              "Momikie's General Merchandise — Point of Sale",
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: Brand.ink),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          Text(today, style: tMuted),
        ],
      ),
    );
  }
}

/// A page's scrolling body: the header bar (wide screens), then the content
/// with the site's padding (px-8 py-7 wide, px-4/6 py-5 narrow).
class PageBody extends StatelessWidget {
  const PageBody({super.key, required this.children, this.onRefresh, this.controller});
  final List<Widget> children;
  final Future<void> Function()? onRefresh;
  final ScrollController? controller;

  static EdgeInsets padding(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    if (w >= Brand.wide) return const EdgeInsets.fromLTRB(32, 28, 32, 28);
    return EdgeInsets.fromLTRB(w >= 640 ? 24 : 16, 20, w >= 640 ? 24 : 16, 20);
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= Brand.wide;
    final list = ListView(
      controller: controller,
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      children: [
        if (wide) const HeaderBar(),
        Padding(
          padding: padding(context),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
        ),
      ],
    );
    return onRefresh == null ? list : RefreshIndicator(onRefresh: onRefresh!, color: Brand.navy, child: list);
  }
}

class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= Brand.wide;
    return Scaffold(
      backgroundColor: Brand.page,
      drawer: wide
          ? null
          : Drawer(
              width: 288,
              backgroundColor: Brand.navyDark,
              shape: const RoundedRectangleBorder(),
              child: SafeArea(child: _Sidebar(inDrawer: true)),
            ),
      body: Column(
        children: [
          // Status bar area in the sidebar's navy, like a browser's chrome.
          Container(color: Brand.navyDark, height: MediaQuery.paddingOf(context).top),
          const DemoBanner(),
          Expanded(
            child: wide
                ? Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      SizedBox(width: 240, child: _Sidebar()),
                      Expanded(child: child),
                    ],
                  )
                : Column(
                    children: [
                      const _TopBar(),
                      Expanded(child: child),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar();
  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final status = SyncStatus.of(app);
    return Container(
      color: Brand.navyDark,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          Builder(
            builder: (ctx) => IconButton(
              onPressed: () => Scaffold.of(ctx).openDrawer(),
              tooltip: 'Open menu',
              icon: const WebIcon(Icons2.menu, size: 24, color: Colors.white, stroke: 2),
            ),
          ),
          const SizedBox(width: 4),
          const MLogo(size: 32),
          const SizedBox(width: 12),
          const Expanded(
            child: Text(
              "Momikie's General Merchandise",
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600),
            ),
          ),
          const DeviceIndicators(compact: true),
          InkWell(
            onTap: app.syncing ? null : app.syncNow,
            borderRadius: BorderRadius.circular(6),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              child: Row(
                children: [
                  Icon(status.icon, size: 16, color: status.color),
                  const SizedBox(width: 6),
                  Text(
                    status.short ?? status.text,
                    style: TextStyle(color: status.color, fontSize: 12, fontWeight: FontWeight.w500),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Sidebar extends StatelessWidget {
  const _Sidebar({this.inDrawer = false});
  final bool inDrawer;

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final owner = app.meRole == 'owner';
    final status = SyncStatus.of(app);
    return Container(
      color: Brand.navyDark,
      padding: EdgeInsets.fromLTRB(12, inDrawer ? 16 : 20, 12, 20),
      child: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(
                children: [
                  const MLogo(),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          "Momikie's",
                          style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600, height: 1.25),
                        ),
                        Text('General Merchandise', style: TextStyle(color: Color(0x8CFFFFFF), fontSize: 12, height: 1.25)),
                      ],
                    ),
                  ),
                  if (inDrawer)
                    IconButton(
                      onPressed: () => Navigator.of(context).pop(),
                      tooltip: 'Close menu',
                      icon: const WebIcon(Icons2.close, size: 20, color: Color(0xCCFFFFFF), stroke: 2),
                    ),
                ],
              ),
            ),
          ),
          const SliverToBoxAdapter(child: SizedBox(height: 28)),
          SliverList.list(
            children: [
              for (final g in navGroups.where((g) => g.items.any((i) => owner || !i.ownerOnly))) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 6),
                  child: Text(
                    g.label.toUpperCase(),
                    style: const TextStyle(color: Color(0x66FFFFFF), fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.55),
                  ),
                ),
                for (final item in g.items.where((i) => owner || !i.ownerOnly))
                  ListenableBuilder(
                    listenable: appNav,
                    builder: (context, _) => _NavLink(
                      item: item,
                      active: item.id == appNav.page,
                      badge: item.id == 'sync' && app.waitingCount + app.attentionCount > 0 ? app.waitingCount + app.attentionCount : null,
                      badgeColor: app.attentionCount > 0 ? Brand.red600 : Brand.amber400,
                      onTap: () {
                        if (inDrawer) Navigator.of(context).pop();
                        appNav.go(item.id, path: item.path);
                      },
                    ),
                  ),
                const SizedBox(height: 20),
              ],
            ],
          ),
          SliverFillRemaining(
            hasScrollBody: false,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.end,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Scanner and receipt printer — connected or not.
                const DeviceIndicators(),
                // Connection status — tap to sync now.
                InkWell(
                  onTap: app.syncing ? null : app.syncNow,
                  borderRadius: BorderRadius.circular(6),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: const EdgeInsets.only(top: 1),
                          child: Icon(status.icon, size: 16, color: status.color),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            status.text,
                            style: TextStyle(color: status.color, fontSize: 12, fontWeight: FontWeight.w500),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                Container(
                  margin: const EdgeInsets.only(top: 8),
                  padding: const EdgeInsets.fromLTRB(12, 16, 12, 0),
                  decoration: const BoxDecoration(
                    border: Border(top: BorderSide(color: Color(0x1AFFFFFF))),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text.rich(
                        TextSpan(
                          children: [
                            const TextSpan(text: 'Signed in as '),
                            TextSpan(
                              text: app.meName ?? '—',
                              style: const TextStyle(fontWeight: FontWeight.w500, color: Color(0xD9FFFFFF)),
                            ),
                          ],
                        ),
                        style: const TextStyle(fontSize: 12, color: Color(0x8CFFFFFF)),
                      ),
                      const SizedBox(height: 8),
                      OutlinedButton(
                        onPressed: () => _signOut(context, app),
                        style: OutlinedButton.styleFrom(
                          alignment: Alignment.centerLeft,
                          foregroundColor: const Color(0xCCFFFFFF),
                          side: const BorderSide(color: Color(0x26FFFFFF)),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          minimumSize: const Size(0, 34),
                          textStyle: const TextStyle(fontSize: 14, fontFamily: 'Geist'),
                        ),
                        child: const Text('Sign out'),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _signOut(BuildContext context, AppState app) async {
    if (app.waitingCount > 0) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Sign out?', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
          content: Text(
            '${app.waitingCount} item(s) are still waiting to send. They stay on this tablet and send after the next sign-in.',
            style: tMuted,
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Sign out', style: TextStyle(color: Brand.red700)),
            ),
          ],
        ),
      );
      if (ok != true) return;
    }
    await clearWebSession();
    await app.logout();
  }
}

class _NavLink extends StatelessWidget {
  const _NavLink({required this.item, required this.active, required this.onTap, this.badge, this.badgeColor = Brand.amber400});
  final NavItem item;
  final bool active;
  final VoidCallback onTap;
  final int? badge;
  final Color badgeColor;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 2),
    child: Material(
      color: active ? const Color(0x1AFFFFFF) : Colors.transparent,
      borderRadius: BorderRadius.circular(6),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        hoverColor: const Color(0x0DFFFFFF),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
          decoration: BoxDecoration(
            border: Border(left: BorderSide(color: active ? Brand.gold : Colors.transparent, width: 2)),
          ),
          child: Row(
            children: [
              WebIcon(item.icon, size: 18, color: active ? Brand.gold : const Color(0xB3FFFFFF)),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  item.label,
                  style: TextStyle(
                    fontSize: 14,
                    color: active ? Colors.white : const Color(0xB3FFFFFF),
                    fontWeight: active ? FontWeight.w500 : FontWeight.w400,
                  ),
                ),
              ),
              if (badge != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                  decoration: BoxDecoration(color: badgeColor, borderRadius: BorderRadius.circular(10)),
                  child: Text(
                    '$badge',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: badgeColor == Brand.amber400 ? Brand.amber950 : Colors.white,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    ),
  );
}


/// "Scanner connected" / "Printer not connected" lines in the sidebar (or
/// just coloured icons in the narrow top bar). Green = ready, amber = not
/// connected, grey = not set up. Tapping opens the Printer page.
class DeviceIndicators extends StatelessWidget {
  const DeviceIndicators({super.key, this.compact = false});
  final bool compact;

  static const _green = Color(0xFF6EE7B7);
  static const _amber = Brand.amber400;
  static const _grey = Color(0x8CFFFFFF);

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: deviceStatus,
        builder: (context, _) {
          final d = deviceStatus;
          final recentScan = d.lastScanAt != null && DateTime.now().difference(d.lastScanAt!) < const Duration(minutes: 30);
          final (scanColor, scanText) = d.scannerConnected
              ? (_green, 'Scanner connected')
              : recentScan
                  ? (_green, 'Scanner working · ${timeOfDay(d.lastScanAt!)}')
                  : (_amber, 'Scanner not connected');
          final (printColor, printText) = switch (d.printer) {
            PrinterState.connected => (_green, 'Printer connected'),
            PrinterState.checking => (const Color(0xFF93C5FD), 'Printer: checking…'),
            PrinterState.notConnected => (_amber, 'Printer not connected'),
            PrinterState.notSetUp => (_grey, 'Printer not set up'),
          };
          final scanTip = d.scannerConnected ? 'Scanner: ${d.scanners.join(', ')}' : 'Plug in or pair the barcode scanner, or scan any barcode to test it';
          final printTip = d.printerProblem ?? printText;
          if (compact) {
            return Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Tooltip(message: scanTip, child: _dot(Icons.qr_code_scanner, scanColor)),
                IconButton(
                  tooltip: printTip,
                  onPressed: () => appNav.go('printer'),
                  icon: _dot(Icons.print_outlined, printColor),
                ),
              ],
            );
          }
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _row(Icons.qr_code_scanner, scanColor, scanText, scanTip, null),
              _row(Icons.print_outlined, printColor, printText, printTip, () => appNav.go('printer')),
            ],
          );
        },
      );

  Widget _dot(IconData icon, Color color) => Stack(
        clipBehavior: Clip.none,
        children: [
          Icon(icon, size: 18, color: Colors.white70),
          Positioned(
            right: -2,
            bottom: -2,
            child: Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle, border: Border.all(color: Brand.navyDark, width: 1.5)),
            ),
          ),
        ],
      );

  Widget _row(IconData icon, Color color, String text, String tip, VoidCallback? onTap) => Tooltip(
        message: tip,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(6),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
            child: Row(
              children: [
                Icon(icon, size: 16, color: color),
                const SizedBox(width: 8),
                Expanded(child: Text(text, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w500))),
              ],
            ),
          ),
        ),
      );
}
