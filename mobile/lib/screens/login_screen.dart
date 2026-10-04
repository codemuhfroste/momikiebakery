import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../core/api.dart';
import '../core/app_state.dart';
import '../core/theme.dart';
import '../widgets/shell.dart';
import '../widgets/web.dart';

const _copy = {
  'cashier': (
    'Cashier sign in',
    'Enter your own staff PIN (or the shared cashier PIN) to open the register and record sales and credit payments.',
    'Sign in',
    Icons2.register,
  ),
  'owner': (
    'Owner sign in',
    'Enter the owner PIN for full access, including products, inventory, and the audit log.',
    'Sign in as owner',
    Icons2.audit,
  ),
};

/// The website's sign-in page (LoginScreen.tsx): the green brand panel with
/// the background video beside the PIN form on wide screens, a header band
/// above it on narrow ones. The first sign-in needs internet; after that
/// the app opens and sells offline.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _pin = TextEditingController();
  final _server = TextEditingController();
  String _role = 'cashier';
  bool _busy = false;
  String? _error;
  bool _showServer = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_server.text.isEmpty) _server.text = AppScope.read(context).api.baseUrl;
  }

  Future<void> _submit() async {
    final app = AppScope.read(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (_server.text.trim() != app.api.baseUrl) await app.setBaseUrl(_server.text);
      await app.login(_role, _pin.text.trim());
    } on ApiException catch (e) {
      setState(
        () => _error = e.network
            ? "Can't reach the server. Signing in the first time needs internet; after that the app works offline."
            : e.status == 401
            ? "That PIN isn't right. Please try again."
            : e.message,
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= Brand.wide;
    final form = _form(wide);
    // The keyboard only pushes the form up; the green panel keeps its size.
    final keyboard = MediaQuery.viewInsetsOf(context).bottom;
    return Scaffold(
      backgroundColor: Colors.white,
      resizeToAvoidBottomInset: false,
      body: Column(
        children: [
          Container(color: Brand.emerald950, height: MediaQuery.paddingOf(context).top),
          const DemoBanner(),
          Expanded(
            child: wide
                ? Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Expanded(flex: 11, child: _BrandPanel(full: true)),
                      Expanded(
                        flex: 10,
                        child: Center(
                          child: SingleChildScrollView(padding: EdgeInsets.fromLTRB(40, 40, 40, 40 + keyboard), child: form),
                        ),
                      ),
                    ],
                  )
                : ListView(
                    padding: EdgeInsets.only(bottom: keyboard),
                    children: [
                      const _BrandPanel(full: false),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(24, 48, 24, 48),
                        child: Center(child: form),
                      ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget _form(bool wide) {
    final (heading, sub, button, icon) = _copy[_role]!;
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 384),
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: 1),
        duration: const Duration(milliseconds: 400),
        curve: const Cubic(0.2, 0.7, 0.2, 1),
        builder: (_, v, child) => Opacity(
          opacity: v,
          child: Transform.translate(offset: Offset(0, 8 * (1 - v)), child: child),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: Container(
                width: 48,
                height: 48,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: Brand.navySoft, borderRadius: BorderRadius.circular(8)),
                child: WebIcon(icon, size: 24, color: Brand.navy, stroke: 1.8),
              ),
            ),
            const SizedBox(height: 20),
            Text(
              heading,
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: Brand.ink, letterSpacing: -0.6),
            ),
            const SizedBox(height: 8),
            Text(sub, style: tMuted),
            const SizedBox(height: 32),
            const FieldLabel('PIN'),
            TextField(
              controller: _pin,
              autofocus: true,
              // Scroll the PIN box and the Sign in button above the keyboard.
              scrollPadding: EdgeInsets.only(top: 20, bottom: MediaQuery.viewInsetsOf(context).bottom + 110),
              obscureText: true,
              obscuringCharacter: '•',
              keyboardType: TextInputType.number,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 20, letterSpacing: 10, color: Brand.ink),
              decoration: InputDecoration(
                hintText: '••••••',
                hintStyle: const TextStyle(fontSize: 20, letterSpacing: 10, color: Brand.slate300),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: Brand.slate300),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                  borderSide: const BorderSide(color: Brand.navy, width: 1.5),
                ),
              ),
              onSubmitted: (_) => _busy ? null : _submit(),
            ),
            if (_error != null) ...[
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: Brand.red50,
                  border: Border.all(color: Brand.red200),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(_error!, style: const TextStyle(fontSize: 14, color: Brand.red700)),
              ),
            ],
            const SizedBox(height: 20),
            WebButton(
              _busy ? 'Checking PIN…' : button,
              busy: _busy,
              onPressed: _submit,
              expand: true,
              radius: 8,
              fontWeight: FontWeight.w600,
              fontSize: 16,
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            const SizedBox(height: 20),
            // The website has a separate /owner page; here it's a switch.
            Wrap(
              alignment: WrapAlignment.spaceBetween,
              runSpacing: 8,
              children: [
                WebLink(
                  _role == 'cashier' ? 'Owner? Sign in as owner' : 'Cashier sign in',
                  onTap: () => setState(() {
                    _role = _role == 'cashier' ? 'owner' : 'cashier';
                    _error = null;
                  }),
                ),
                InkWell(
                  onTap: () => setState(() => _showServer = !_showServer),
                  child: Text(_showServer ? 'Hide server address' : 'Server address', style: tMuted),
                ),
              ],
            ),
            if (_showServer) ...[
              const SizedBox(height: 12),
              TextField(
                controller: _server,
                keyboardType: TextInputType.url,
                style: tSm,
                decoration: const InputDecoration(
                  helperText: 'Where the website runs, e.g. https://momikiebakery.vercel.app',
                  helperStyle: tXs,
                ),
              ),
            ],
            if (!wide) ...[
              const SizedBox(height: 40),
              Text.rich(
                const TextSpan(
                  children: [
                    TextSpan(text: 'Developed by '),
                    TextSpan(
                      text: 'JM Labalan',
                      style: TextStyle(fontWeight: FontWeight.w600, color: Brand.slate500),
                    ),
                  ],
                ),
                style: const TextStyle(fontSize: 12, color: Brand.slate400),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// The green panel: looping background video under a dark-green scrim, the
/// logo, and (wide screens) the store name and credit line.
class _BrandPanel extends StatefulWidget {
  const _BrandPanel({required this.full});
  final bool full;

  @override
  State<_BrandPanel> createState() => _BrandPanelState();
}

class _BrandPanelState extends State<_BrandPanel> {
  VideoPlayerController? _video;

  @override
  void initState() {
    super.initState();
    final c = VideoPlayerController.asset('assets/video/login.mp4', videoPlayerOptions: VideoPlayerOptions(mixWithOthers: true));
    _video = c;
    c
        .initialize()
        .then((_) {
          if (!mounted) return;
          c
            ..setVolume(0)
            ..setLooping(true)
            ..play();
          setState(() {});
        })
        .catchError((_) {
          // No video (e.g. unsupported codec): the plain green panel is fine.
        });
  }

  @override
  void dispose() {
    _video?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final v = _video;
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    final logo = Row(
      children: [
        const MLogo(size: 44, radius: 6, shadow: true),
        const SizedBox(width: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const [
            Text(
              "Momikie's",
              style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700, letterSpacing: -0.5, height: 1.25),
            ),
            Text(
              'GENERAL MERCHANDISE',
              style: TextStyle(color: Brand.gold, fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 2, height: 1.4),
            ),
          ],
        ),
      ],
    );
    return Container(
      color: Brand.emerald800,
      child: Stack(
        fit: widget.full ? StackFit.expand : StackFit.loose,
        children: [
          if (v != null && v.value.isInitialized && !reduceMotion)
            Positioned.fill(
              child: ClipRect(
                child: FittedBox(
                  fit: BoxFit.cover,
                  child: SizedBox(width: v.value.size.width, height: v.value.size.height, child: VideoPlayer(v)),
                ),
              ),
            ),
          // Scrim keeps the text readable over whatever is in the footage.
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Brand.emerald950.withValues(alpha: 0.7),
                    Brand.emerald900.withValues(alpha: 0.4),
                    const Color(0xFF047857).withValues(alpha: 0.3),
                  ],
                ),
              ),
            ),
          ),
          Padding(
            padding: widget.full ? const EdgeInsets.fromLTRB(56, 48, 56, 48) : const EdgeInsets.fromLTRB(24, 32, 24, 32),
            child: widget.full
                ? Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      logo,
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 448),
                        child: const Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              "Momikie's General Merchandise",
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 36,
                                fontWeight: FontWeight.w700,
                                height: 1.25,
                                letterSpacing: -0.9,
                              ),
                            ),
                            SizedBox(height: 16),
                            Text(
                              'All in one sales, credit and inventory management.',
                              style: TextStyle(color: Color(0xCCFFFFFF), fontSize: 16, height: 1.5),
                            ),
                          ],
                        ),
                      ),
                      const Text.rich(
                        TextSpan(
                          children: [
                            TextSpan(text: 'Developed by '),
                            TextSpan(
                              text: 'JM Labalan',
                              style: TextStyle(fontWeight: FontWeight.w600, color: Colors.white),
                            ),
                          ],
                        ),
                        style: TextStyle(
                          fontSize: 14,
                          color: Color(0xD9FFFFFF),
                          shadows: [Shadow(color: Color(0x40000000), blurRadius: 2)],
                        ),
                      ),
                    ],
                  )
                : logo,
          ),
        ],
      ),
    );
  }
}
