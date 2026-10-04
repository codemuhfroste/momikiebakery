import 'package:flutter/material.dart';

import '../core/app_state.dart';
import '../core/models.dart';
import 'web.dart';

/// The website's "Add customer" form (CustomerForm.tsx) in a dialog.
/// Returns the new customer, or null when cancelled.
Future<Customer?> showAddCustomer(BuildContext context, {String? name}) => showWebDialog<Customer>(
  context,
  title: 'Add credit customer',
  description: 'Someone who may buy now and pay later (utang).',
  body: (_) => _CustomerForm(name: name),
);

class _CustomerForm extends StatefulWidget {
  const _CustomerForm({this.name});
  final String? name;
  @override
  State<_CustomerForm> createState() => _CustomerFormState();
}

class _CustomerFormState extends State<_CustomerForm> {
  late final _name = TextEditingController(text: widget.name ?? '');
  final _phone = TextEditingController();
  final _limit = TextEditingController();
  final _address = TextEditingController();
  final _notes = TextEditingController();
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [_name, _phone, _limit, _address, _notes]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    final limitText = _limit.text.trim().replaceAll(',', '');
    final limit = limitText.isEmpty ? null : double.tryParse(limitText);
    if (_name.text.trim().isEmpty) return setState(() => _error = 'Enter the customer\'s name.');
    if (limitText.isNotEmpty && (limit == null || limit < 0)) return setState(() => _error = 'Credit limit must be zero or more.');
    setState(() {
      _busy = true;
      _error = null;
    });
    final (customer, error) = await AppScope.read(
      context,
    ).addCustomer(name: _name.text, phone: _phone.text, address: _address.text, notes: _notes.text, creditLimit: limit);
    if (!mounted) return;
    if (customer == null) {
      setState(() {
        _busy = false;
        _error = error ?? 'The customer could not be added.';
      });
    } else {
      Navigator.of(context).pop(customer);
    }
  }

  Widget _field(
    String label,
    TextEditingController c, {
    String? hint,
    String? help,
    TextInputType? keyboard,
    bool autofocus = false,
    int lines = 1,
  }) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      FieldLabel(label),
      TextField(
        controller: c,
        autofocus: autofocus,
        keyboardType: keyboard,
        minLines: lines,
        maxLines: lines,
        textCapitalization: keyboard == null ? TextCapitalization.words : TextCapitalization.none,
        style: tSm,
        decoration: InputDecoration(hintText: hint),
      ),
      if (help != null)
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(help, style: tXs),
        ),
    ],
  );

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _field('Full name', _name, autofocus: true),
        const SizedBox(height: 16),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _field('Mobile number', _phone, hint: '09XX XXX XXXX', keyboard: TextInputType.phone),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: _field(
                'Credit limit (₱)',
                _limit,
                hint: 'No limit',
                help: 'The most they may owe at one time. Blank = no limit.',
                keyboard: const TextInputType.numberWithOptions(decimal: true),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        _field('Address', _address),
        const SizedBox(height: 16),
        _field('Notes', _notes, lines: 2, keyboard: TextInputType.multiline),
        if (_error != null) ...[const SizedBox(height: 12), NoticeBox(tone: Tone.bad, child: Text(_error!))],
        const SizedBox(height: 20),
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            WebButton('Cancel', kind: BtnKind.secondary, onPressed: () => Navigator.of(context).pop()),
            const SizedBox(width: 8),
            WebButton('Add customer', busy: _busy, onPressed: _save),
          ],
        ),
      ],
    );
  }
}
