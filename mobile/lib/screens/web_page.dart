import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import '../core/app_state.dart';
import '../core/nav.dart';
import '../core/theme.dart';
import '../widgets/common.dart';
import '../widgets/shell.dart';
import '../widgets/web.dart';

// The website's own cookies: the signed session (the same token the app
// already holds) and the "inside the app" flag that makes the site drop its
// sidebar, so its pages sit inside the app's frame.
const _sessionCookie = 'momikie_session';
const _embedCookie = 'momikie_app';

// Excel files the site hands out; the app downloads them itself and offers
// to save or share them (a web view can't save files on its own).
const _downloads = ['/api/reports/export', '/api/products/template', '/api/backup'];

// Site pages the app has built in (they work offline): links to them switch
// to the app's own page instead of loading the website's.
const _native = {'/pos': 'register', '/sales': 'sales', '/customers': 'credit'};

// Runs in each page. The site changes pages without reloading (Next.js), so
// the app can't see those link taps from outside: catch taps on links to the
// built-in pages and hand them to the app, and route printing to the app.
const _pageScript = """
(function () {
  if (window.__momikieApp) return;
  window.__momikieApp = true;
  var native = ['/pos', '/sales', '/customers'];
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.origin !== location.origin || native.indexOf(a.pathname) < 0) return;
    e.preventDefault();
    e.stopPropagation();
    MomikieApp.postMessage('nav:' + a.pathname);
  }, true);
  window.print = function () { MomikieApp.postMessage('print'); };
})();
""";

/// Forgets the website session inside the app (on sign out).
Future<void> clearWebSession() async {
  try {
    await WebViewCookieManager().clearCookies();
  } catch (_) {
    // No web view on this platform (e.g. tests).
  }
}

/// A website page (Dashboard, Products, Inventory, reports, a receipt…)
/// shown inside the app, signed in with the app's session. Needs internet;
/// Register, Transactions, Credit Accounts and Sync are built into the app
/// and work offline.
class WebPage extends StatefulWidget {
  const WebPage({super.key});

  @override
  State<WebPage> createState() => WebPageState();
}

class WebPageState extends State<WebPage> {
  // Made when the first website page is opened, not at start-up.
  WebViewController? _controller;
  WebViewController get _web => _controller ??= _makeController();
  int _loadedVisit = -1;
  // Pages visited since the app last opened a section here, so Back steps
  // through those and then returns to the app — not into another section's
  // pages (the web view keeps one history for all of them).
  final List<String> _history = [];
  bool _goingBack = false;
  int _progress = 100;
  String? _error;
  String _title = '';

  @override
  void initState() {
    super.initState();
    appNav.addListener(_onNav);
    WidgetsBinding.instance.addPostFrameCallback((_) => _onNav());
  }

  WebViewController _makeController() {
    final web = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Brand.page)
      // Printing isn't available inside the app; say so instead of nothing happening.
      ..addJavaScriptChannel(
        'MomikieApp',
        onMessageReceived: (m) {
          if (m.message.startsWith('nav:') && _native.containsKey(m.message.substring(4))) {
            appNav.go(_native[m.message.substring(4)]!);
          } else if (m.message == 'print' && mounted) {
            showMessage(context, 'Printing works from the website in a browser (e.g. on a computer connected to the printer).');
          }
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: _onNavigation,
          onProgress: (p) => mounted ? setState(() => _progress = p) : null,
          onPageStarted: (_) => mounted ? setState(() => _error = null) : null,
          // Page changes the site makes without reloading (e.g. a redirect
          // after saving): a built-in page or the sign-in page is handled here.
          onUrlChange: (change) => _onUrlChange(change.url),
          onPageFinished: (_) async {
            await _controller!.runJavaScript(_pageScript);
            final title = await _controller!.getTitle();
            if (mounted) setState(() => _title = title ?? '');
          },
          onWebResourceError: (e) {
            if (e.isForMainFrame ?? true) {
              setState(
                () => _error =
                    "This page comes from the website and needs internet. Register, Transactions, Credit Accounts "
                    'and Sync keep working offline.',
              );
            }
          },
        ),
      );
    final android = web.platform;
    if (android is AndroidWebViewController) {
      // <input type="file"> — Excel import and product photos.
      android.setOnShowFileSelector(_pickFiles);
    }
    return web;
  }

  @override
  void dispose() {
    appNav.removeListener(_onNav);
    super.dispose();
  }

  Uri _url(String path) => Uri.parse(AppScope.read(context).api.baseUrl).resolve(path);

  void _onNav() {
    final path = appNav.webPath;
    if (path == null || appNav.visit == _loadedVisit || !mounted) return;
    _loadedVisit = appNav.visit;
    _open(path);
  }

  Future<void> _open(String path) async {
    final app = AppScope.read(context);
    _history.clear();
    final url = _url(path);
    final cookies = WebViewCookieManager();
    for (final (name, value) in [(_sessionCookie, app.api.token ?? ''), (_embedCookie, '1')]) {
      await cookies.setCookie(WebViewCookie(name: name, value: value, domain: url.host, path: '/'));
    }
    setState(() {
      _error = null;
      _title = '';
    });
    await _web.loadRequest(url);
  }

  /// Android's back button: back within the website pages first.
  Future<bool> goBack() async {
    final web = _controller;
    if (web != null && _history.length > 1 && await web.canGoBack()) {
      _goingBack = true;
      await web.goBack();
      return true;
    }
    return false;
  }

  Future<NavigationDecision> _onNavigation(NavigationRequest request) async {
    final url = Uri.parse(request.url);
    final site = _url('/');
    if (url.host != site.host) return NavigationDecision.prevent; // stay on the store's site
    final path = url.path.isEmpty ? '/' : url.path;
    if (_native.containsKey(path) || path == '/login' || path == '/owner') {
      _leaveFor(path);
      return NavigationDecision.prevent;
    }
    if (_downloads.any((d) => path.startsWith(d))) {
      _download(url);
      return NavigationDecision.prevent;
    }
    return NavigationDecision.navigate;
  }

  void _onUrlChange(String? raw) {
    final url = raw == null ? null : Uri.tryParse(raw);
    if (url == null || url.host != _url('/').host) return;
    if (_goingBack) {
      _goingBack = false;
      if (_history.isNotEmpty) _history.removeLast();
    } else if (_history.isEmpty || _history.last != raw) {
      _history.add(raw!);
    }
    if (_native.containsKey(url.path) || url.path == '/login' || url.path == '/owner') {
      _controller?.goBack(); // don't leave the site's copy of that page in the history
      _leaveFor(url.path);
    }
  }

  void _leaveFor(String path) {
    if (_native.containsKey(path)) {
      appNav.go(_native[path]!);
    } else {
      // The website asked to sign in: the app's sign-in has expired.
      AppScope.read(context).syncNow();
      if (mounted) showMessage(context, 'Your sign-in has expired. Sign out and sign in again.', error: true);
    }
  }

  Future<void> _download(Uri url) async {
    final token = AppScope.read(context).api.token ?? '';
    showMessage(context, 'Preparing the Excel file…');
    try {
      final res = await http.get(url, headers: {'Cookie': '$_sessionCookie=$token'});
      if (res.statusCode != 200) throw Exception('HTTP ${res.statusCode}');
      final name = RegExp(r'filename="([^"]+)"').firstMatch(res.headers['content-disposition'] ?? '')?.group(1) ?? 'momikie.xlsx';
      final file = File('${(await getTemporaryDirectory()).path}/$name');
      await file.writeAsBytes(res.bodyBytes);
      if (!mounted) return;
      ScaffoldMessenger.of(context).hideCurrentSnackBar();
      // Android's share sheet: save to Files/Drive, or send by Messenger, Gmail…
      await SharePlus.instance.share(ShareParams(files: [XFile(file.path)], title: name));
    } catch (_) {
      if (mounted) showMessage(context, "Couldn't download the file. Check the internet connection.", error: true);
    }
  }

  Future<List<String>> _pickFiles(FileSelectorParams params) async {
    final types = params.acceptTypes.join(',');
    final picked = await FilePicker.pickFiles(
      type: types.contains('image')
          ? FileType.image
          : (types.contains('xlsx') || types.contains('spreadsheet') ? FileType.custom : FileType.any),
      allowedExtensions: types.contains('xlsx') || types.contains('spreadsheet') ? ['xlsx'] : null,
    );
    return [for (final f in picked) f.uri.toString()];
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= Brand.wide;
    return ColoredBox(
      color: Brand.page,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (wide) const HeaderBar(),
          SizedBox(
            height: 2,
            child: _progress < 100
                ? LinearProgressIndicator(value: _progress / 100, minHeight: 2, backgroundColor: Colors.transparent)
                : null,
          ),
          Expanded(
            child: Stack(
              children: [
                Semantics(
                  label: _title,
                  child: _controller == null ? const SizedBox.expand() : WebViewWidget(controller: _controller!),
                ),
                if (_error != null)
                  Positioned.fill(
                    child: ColoredBox(
                      color: Brand.page,
                      child: Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 480),
                            child: WebCard(
                              padding: const EdgeInsets.all(24),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(Icons.cloud_off, color: Brand.amber700, size: 32),
                                  const SizedBox(height: 12),
                                  const Text(
                                    'No internet connection',
                                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: Brand.ink),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(_error!, textAlign: TextAlign.center, style: tMuted),
                                  const SizedBox(height: 16),
                                  WebButton('Try again', onPressed: () => _open(appNav.webPath ?? '/')),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
