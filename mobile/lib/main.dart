import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'core/app_state.dart';
import 'core/nav.dart';
import 'core/theme.dart';
import 'screens/credit_screen.dart';
import 'screens/login_screen.dart';
import 'screens/register_screen.dart';
import 'screens/sales_screen.dart';
import 'screens/sync_screen.dart';
import 'screens/web_page.dart';
import 'widgets/shell.dart';

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
      child: AnnotatedRegion<SystemUiOverlayStyle>(
        // Light status-bar icons over the navy frame.
        value: SystemUiOverlayStyle.light.copyWith(statusBarColor: Colors.transparent),
        child: MaterialApp(
          title: "Momikie's POS",
          debugShowCheckedModeBanner: false,
          theme: buildTheme(),
          // Same type weights as the website even when Android's "Bold text"
          // setting is on (Chrome ignores it too, so the two match).
          builder: (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(boldText: false), child: child!),
          home: const _Root(),
        ),
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
  static const _native = ['register', 'sales', 'credit', 'sync'];
  final _web = GlobalKey<WebPageState>();
  bool _wasWeb = false;

  @override
  void initState() {
    super.initState();
    appNav.reset();
    appNav.addListener(_onNav);
  }

  @override
  void dispose() {
    appNav.removeListener(_onNav);
    super.dispose();
  }

  void _onNav() {
    final app = AppScope.read(context);
    if (appNav.page == 'sales' && appNav.webPath == null) app.refreshServerSales();
    // Back from a website page (where stock, prices or customers may have
    // changed): refresh the tablet's copy.
    if (_wasWeb && appNav.webPath == null) app.syncNow();
    _wasWeb = appNav.webPath != null;
    setState(() {});
  }

  /// Android's back button: back within website pages, then to the Register,
  /// then out of the app.
  Future<void> _back() async {
    if (appNav.webPath != null && await (_web.currentState?.goBack() ?? Future.value(false))) return;
    if (!appNav.onRegister) {
      appNav.go(appNav.webPath != null && _native.contains(appNav.page) ? appNav.page : 'register');
      return;
    }
    await SystemNavigator.pop();
  }

  @override
  Widget build(BuildContext context) {
    final page = appNav.webPath != null ? 4 : _native.indexOf(appNav.page).clamp(0, 3);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) => didPop ? null : _back(),
      child: AppShell(
        // Pages stay alive, so a half-rung sale survives a look at Transactions
        // or the Dashboard.
        child: IndexedStack(
          index: page,
          children: [
            const RegisterScreen(),
            const SalesScreen(),
            const CreditScreen(),
            const SyncScreen(),
            WebPage(key: _web),
          ],
        ),
      ),
    );
  }
}
