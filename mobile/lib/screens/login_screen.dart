import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/app_state.dart';
import '../core/theme.dart';

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
      setState(() => _error = e.network
          ? "Can't reach the server. Signing in the first time needs internet; after that the app works offline."
          : e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Brand.navyDark,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(children: [
                    Container(
                      width: 48,
                      height: 48,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(color: Brand.gold, borderRadius: BorderRadius.circular(10)),
                      child: const Text('M', style: TextStyle(fontFamily: 'serif', fontSize: 24, fontWeight: FontWeight.w700, color: Brand.navyDark)),
                    ),
                    const SizedBox(width: 12),
                    const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text("Momikie's", style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w700)),
                      Text('GENERAL MERCHANDISE', style: TextStyle(color: Brand.gold, fontSize: 11, letterSpacing: 2, fontWeight: FontWeight.w600)),
                    ]),
                  ]),
                  const SizedBox(height: 28),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Text('Sign in', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: Brand.ink)),
                          const SizedBox(height: 4),
                          const Text('Point of sale with credit tracking. Works offline after the first sign-in.',
                              style: TextStyle(color: Brand.muted)),
                          const SizedBox(height: 18),
                          SegmentedButton<String>(
                            segments: const [
                              ButtonSegment(value: 'cashier', label: Text('Cashier'), icon: Icon(Icons.point_of_sale)),
                              ButtonSegment(value: 'owner', label: Text('Owner'), icon: Icon(Icons.verified_user_outlined)),
                            ],
                            selected: {_role},
                            onSelectionChanged: (s) => setState(() => _role = s.first),
                          ),
                          const SizedBox(height: 14),
                          TextField(
                            controller: _pin,
                            obscureText: true,
                            keyboardType: TextInputType.number,
                            textAlign: TextAlign.center,
                            style: const TextStyle(fontSize: 22, letterSpacing: 8),
                            decoration: const InputDecoration(labelText: 'PIN', hintText: '••••••'),
                            onSubmitted: (_) => _busy ? null : _submit(),
                          ),
                          if (_error != null) ...[
                            const SizedBox(height: 12),
                            Text(_error!, style: const TextStyle(color: Brand.bad)),
                          ],
                          const SizedBox(height: 16),
                          FilledButton(
                            onPressed: _busy ? null : _submit,
                            child: _busy
                                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                                : const Text('Sign in'),
                          ),
                          const SizedBox(height: 8),
                          TextButton(
                            onPressed: () => setState(() => _showServer = !_showServer),
                            child: Text(_showServer ? 'Hide server address' : 'Server address'),
                          ),
                          if (_showServer)
                            TextField(
                              controller: _server,
                              keyboardType: TextInputType.url,
                              decoration: const InputDecoration(labelText: 'Server', helperText: 'Where the website runs, e.g. https://momikiebakery.vercel.app'),
                            ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),
                  const Text('Developed by JM Labalan', textAlign: TextAlign.center, style: TextStyle(color: Colors.white54, fontSize: 12)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
