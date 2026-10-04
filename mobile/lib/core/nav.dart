import 'package:flutter/foundation.dart';

/// Which page is showing. Native pages (Register, Transactions, Credit
/// Accounts, Sync) are ids; website pages shown inside the app also carry the
/// site path to open. [page] is the sidebar item lit up — e.g. a receipt
/// opened from Transactions is page "sales" with path "/sales/12".
class AppNav extends ChangeNotifier {
  String page = 'register';
  String? webPath;

  /// Bumped on every visit so picking the same website page again reloads it.
  int visit = 0;

  bool get onRegister => page == 'register' && webPath == null;

  /// After signing in: start at the Register (quietly — the shell is being built).
  void reset() {
    page = 'register';
    webPath = null;
  }

  void go(String id, {String? path}) {
    page = id;
    webPath = path;
    visit++;
    notifyListeners();
  }
}

final appNav = AppNav();
