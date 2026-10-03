import 'package:flutter/material.dart';

import 'core/app_state.dart';
import 'core/theme.dart';
import 'screens/credit_screen.dart';
import 'screens/login_screen.dart';
import 'screens/register_screen.dart';
import 'screens/sales_screen.dart';
import 'screens/sync_screen.dart';
import 'widgets/common.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final state = AppState();
  await state.init();
  runApp(MomikieApp(state: state));
}

class MomikieApp extends StatelessWidget {
  const MomikieApp({super.key, required this.state});
  final AppState state;

  @override
  Widget build(BuildContext context) {
    return AppScope(
      state: state,
      child: MaterialApp(
        title: "Momikie's POS",
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        home: const _Root(),
      ),
    );
  }
}

class _Root extends StatelessWidget {
  const _Root();

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    if (!app.ready) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    return app.signedIn ? const HomeShell() : const LoginScreen();
  }
}

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _tab = 0;

  static const _titles = ['Register', 'Sales', 'Credit accounts', 'Sync'];

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(_titles[_tab]),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: Center(child: Text(app.meName ?? '', style: const TextStyle(color: Colors.white70))),
          ),
        ],
      ),
      body: Column(
        children: [
          const SyncBanner(),
          Expanded(
            child: IndexedStack(
              index: _tab,
              children: const [RegisterScreen(), SalesScreen(), CreditScreen(), SyncScreen()],
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) {
          setState(() => _tab = i);
          if (i == 1) app.refreshServerSales();
        },
        destinations: [
          const NavigationDestination(icon: Icon(Icons.point_of_sale_outlined), selectedIcon: Icon(Icons.point_of_sale), label: 'Register'),
          const NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long), label: 'Sales'),
          const NavigationDestination(icon: Icon(Icons.people_outline), selectedIcon: Icon(Icons.people), label: 'Credit'),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: app.waitingCount + app.attentionCount > 0,
              label: Text('${app.waitingCount + app.attentionCount}'),
              backgroundColor: app.attentionCount > 0 ? Brand.bad : Brand.warn,
              child: Icon(app.online ? Icons.cloud_done_outlined : Icons.cloud_off),
            ),
            label: 'Sync',
          ),
        ],
      ),
    );
  }
}
