import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/app_state.dart';
import '../core/format.dart';
import '../core/models.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _search = TextEditingController();
  final _searchFocus = FocusNode();
  final List<CartLine> _cart = [];
  String? _category; // null = all

  double get _total => _cart.fold(0, (s, l) => s + l.total);
  double get _count => _cart.fold(0, (s, l) => s + l.qty);

  void _add(Product p) {
    final line = _cart.where((l) => l.product.id == p.id).firstOrNull;
    final inCart = line?.qty ?? 0;
    if (inCart + 1 > p.stockQty) {
      showMessage(context, 'Not enough stock for ${p.name} (${qty(p.stockQty)} left).', error: true);
      return;
    }
    HapticFeedback.selectionClick();
    setState(() => line == null ? _cart.add(CartLine(p, 1)) : line.qty += 1);
  }

  /// Enter in the search box — which is also where a Bluetooth/USB barcode
  /// scanner types: an exact barcode or SKU adds the item; a single search
  /// result adds that.
  void _submitSearch(List<Product> visible) {
    final code = _search.text.trim();
    if (code.isEmpty) return;
    final products = AppScope.read(context).products;
    final exact = products.where((p) => p.barcode == code || p.sku == code).firstOrNull;
    final hit = exact ?? (visible.length == 1 ? visible.first : null);
    if (hit != null) {
      _add(hit);
      _search.clear();
      setState(() {});
    } else {
      showMessage(context, 'No product with barcode or name "$code".', error: true);
    }
    _searchFocus.requestFocus();
  }

  Future<void> _openCart() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _CartSheet(cart: _cart, onChanged: () => setState(() {}), onCheckout: _checkout),
    );
    setState(() {});
  }

  Future<void> _checkout() async {
    Navigator.of(context).pop(); // close the cart
    final done = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _CheckoutSheet(cart: List.of(_cart)),
    );
    if (done != null && mounted) {
      setState(_cart.clear);
      await showDialog<void>(context: context, builder: (_) => _SaleDoneDialog(clientUuid: done));
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final q = _search.text.trim().toLowerCase();
    final categories = {for (final p in app.products) p.categoryName ?? 'Uncategorized'}.toList()..sort();
    final visible = app.products.where((p) {
      if (_category != null && (p.categoryName ?? 'Uncategorized') != _category) return false;
      if (q.isEmpty) return true;
      return p.name.toLowerCase().contains(q) || (p.barcode ?? '').contains(q) || (p.sku ?? '').toLowerCase().contains(q);
    }).toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
          child: TextField(
            controller: _search,
            focusNode: _searchFocus,
            autofocus: true,
            textInputAction: TextInputAction.done,
            decoration: InputDecoration(
              prefixIcon: const Icon(Icons.search),
              hintText: 'Search or scan a barcode',
              suffixIcon: _search.text.isEmpty
                  ? null
                  : IconButton(icon: const Icon(Icons.clear), onPressed: () => setState(_search.clear)),
            ),
            onChanged: (_) => setState(() {}),
            onSubmitted: (_) => _submitSearch(visible),
          ),
        ),
        SizedBox(
          height: 46,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            children: [
              ChoiceChip(label: const Text('All'), selected: _category == null, onSelected: (_) => setState(() => _category = null)),
              for (final c in categories) ...[
                const SizedBox(width: 6),
                ChoiceChip(label: Text(c), selected: _category == c, onSelected: (_) => setState(() => _category = c)),
              ],
            ],
          ),
        ),
        Expanded(
          child: app.products.isEmpty
              ? const _Empty('No products on this phone yet. Connect to the internet once to download them.')
              : visible.isEmpty
                  ? const _Empty('No products match.')
                  : GridView.builder(
                      padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
                      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                        maxCrossAxisExtent: 180,
                        mainAxisSpacing: 10,
                        crossAxisSpacing: 10,
                        childAspectRatio: 0.72,
                      ),
                      itemCount: visible.length,
                      itemBuilder: (_, i) => _ProductTile(
                        product: visible[i],
                        inCart: _cart.where((l) => l.product.id == visible[i].id).firstOrNull?.qty ?? 0,
                        onTap: () => _add(visible[i]),
                      ),
                    ),
        ),
        if (_cart.isNotEmpty)
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: FilledButton(
                onPressed: _openCart,
                style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
                child: Row(children: [
                  const Icon(Icons.shopping_basket_outlined),
                  const SizedBox(width: 10),
                  Text('${qty(_count)} item(s)'),
                  const Spacer(),
                  Text(peso(_total), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                  const SizedBox(width: 6),
                  const Icon(Icons.chevron_right),
                ]),
              ),
            ),
          ),
      ],
    );
  }
}

class _ProductTile extends StatelessWidget {
  const _ProductTile({required this.product, required this.inCart, required this.onTap});
  final Product product;
  final double inCart;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final out = product.stockQty <= 0;
    return Card(
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: inCart > 0 ? Brand.navy : Brand.line, width: inCart > 0 ? 2 : 1),
      ),
      child: InkWell(
        onTap: out ? null : onTap,
        child: Opacity(
          opacity: out ? 0.45 : 1,
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Stack(children: [
                    Positioned.fill(child: LayoutBuilder(builder: (_, c) => ProductThumb(product: product, size: c.maxWidth))),
                    if (inCart > 0)
                      Positioned(
                        right: 4,
                        top: 4,
                        child: CircleAvatar(
                          radius: 12,
                          backgroundColor: Brand.navy,
                          child: Text(qty(inCart), style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
                        ),
                      ),
                  ]),
                ),
                const SizedBox(height: 6),
                Text(product.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                const SizedBox(height: 2),
                Row(children: [
                  Text(peso(product.srp), style: const TextStyle(fontWeight: FontWeight.w700, color: Brand.ink)),
                  const Spacer(),
                  Text(out ? 'Out' : '${qty(product.stockQty)} left',
                      style: TextStyle(fontSize: 11, color: out ? Brand.bad : Brand.muted)),
                ]),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CartSheet extends StatefulWidget {
  const _CartSheet({required this.cart, required this.onChanged, required this.onCheckout});
  final List<CartLine> cart;
  final VoidCallback onChanged;
  final VoidCallback onCheckout;

  @override
  State<_CartSheet> createState() => _CartSheetState();
}

class _CartSheetState extends State<_CartSheet> {
  void _change(CartLine l, double by) {
    final next = l.qty + by;
    if (next > l.product.stockQty) return;
    setState(() => next <= 0 ? widget.cart.remove(l) : l.qty = next);
    widget.onChanged();
    if (widget.cart.isEmpty) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final total = widget.cart.fold<double>(0, (s, l) => s + l.total);
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: Text('Current sale', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            ),
            Flexible(
              child: ListView.separated(
                shrinkWrap: true,
                padding: const EdgeInsets.symmetric(vertical: 8),
                itemCount: widget.cart.length,
                separatorBuilder: (_, _) => const Divider(height: 1),
                itemBuilder: (_, i) {
                  final l = widget.cart[i];
                  return ListTile(
                    leading: ProductThumb(product: l.product, size: 40),
                    title: Text(l.product.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                    subtitle: Text('${peso(l.product.srp)} each · ${peso(l.total)}'),
                    trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                      IconButton(onPressed: () => _change(l, -1), icon: const Icon(Icons.remove_circle_outline)),
                      Text(qty(l.qty), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                      IconButton(onPressed: () => _change(l, 1), icon: const Icon(Icons.add_circle_outline)),
                    ]),
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  const Text('Total', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                  const Spacer(),
                  Text(peso(total), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                ]),
                const SizedBox(height: 12),
                FilledButton(onPressed: widget.onCheckout, child: const Text('Checkout')),
                TextButton(
                  onPressed: () {
                    widget.cart.clear();
                    widget.onChanged();
                    Navigator.of(context).pop();
                  },
                  child: const Text('Clear sale', style: TextStyle(color: Brand.bad)),
                ),
              ]),
            ),
          ],
        ),
      ),
    );
  }
}

class _CheckoutSheet extends StatefulWidget {
  const _CheckoutSheet({required this.cart});
  final List<CartLine> cart;

  @override
  State<_CheckoutSheet> createState() => _CheckoutSheetState();
}

class _CheckoutSheetState extends State<_CheckoutSheet> {
  String _method = 'Cash';
  final _tendered = TextEditingController();
  final _discount = TextEditingController();
  int? _customerId;
  bool _busy = false;
  String? _error;

  double get _subtotal => widget.cart.fold(0, (s, l) => s + l.total);
  double get _disc => (double.tryParse(_discount.text) ?? 0).clamp(0, _subtotal).toDouble();
  double get _total => round2(_subtotal - _disc);
  double get _cash => double.tryParse(_tendered.text) ?? 0;

  Future<void> _confirm() async {
    final app = AppScope.read(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await app.ringUpSale(
      cart: widget.cart,
      discount: _disc,
      method: _method,
      amountTendered: _method == 'Cash' || _method == 'Credit' ? _cash : _total,
      customerId: _customerId,
    );
    if (!mounted) return;
    if (error != null) {
      setState(() {
        _busy = false;
        _error = error;
      });
    } else {
      Navigator.of(context).pop(app.lastRungUp);
    }
  }

  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final customer = app.customerById(_customerId);
    final change = round2(_cash - _total);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Payment', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              Row(children: [
                const Text('Subtotal', style: TextStyle(color: Brand.muted)),
                const Spacer(),
                Text(peso(_subtotal)),
              ]),
              const SizedBox(height: 8),
              TextField(
                controller: _discount,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Discount (₱)', hintText: '0.00'),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 10),
              Row(children: [
                const Text('Total', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                const Spacer(),
                Text(peso(_total), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
              ]),
              const SizedBox(height: 12),
              Wrap(spacing: 6, runSpacing: 6, children: [
                for (final m in paymentMethods)
                  ChoiceChip(
                    label: Text(m),
                    selected: _method == m,
                    onSelected: (_) => setState(() {
                      _method = m;
                      _tendered.clear();
                    }),
                  ),
              ]),
              const SizedBox(height: 12),
              if (_method == 'Cash') ...[
                TextField(
                  controller: _tendered,
                  autofocus: true,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Cash received (₱)'),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 6),
                Row(children: [
                  TextButton(onPressed: () => setState(() => _tendered.text = _total.toStringAsFixed(2)), child: const Text('Exact amount')),
                  const Spacer(),
                  Text('Change ${peso(change < 0 ? 0 : change)}',
                      style: TextStyle(fontWeight: FontWeight.w700, color: change < 0 ? Brand.bad : Brand.good)),
                ]),
              ],
              if (_method == 'Credit') ...[
                DropdownButtonFormField<int>(
                  initialValue: _customerId,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Customer'),
                  items: [
                    for (final c in app.customers)
                      DropdownMenuItem(value: c.id, child: Text('${c.name} · owes ${peso(c.balance)}', overflow: TextOverflow.ellipsis)),
                  ],
                  onChanged: (v) => setState(() => _customerId = v),
                ),
                if (customer != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(
                      customer.available == null ? 'No credit limit' : 'Available credit: ${peso(customer.available!)}',
                      style: const TextStyle(color: Brand.muted, fontSize: 12),
                    ),
                  ),
                const SizedBox(height: 10),
                TextField(
                  controller: _tendered,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Down payment (optional, ₱)', hintText: '0.00'),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 6),
                Text('Added to their balance: ${peso(round2(_total - _cash).clamp(0, _total))}',
                    style: const TextStyle(fontWeight: FontWeight.w600)),
              ],
              if (_error != null) ...[
                const SizedBox(height: 10),
                Text(_error!, style: const TextStyle(color: Brand.bad)),
              ],
              const SizedBox(height: 14),
              FilledButton(
                onPressed: _busy ? null : _confirm,
                child: Text(_method == 'Credit' ? 'Charge to account' : 'Complete sale · ${peso(_total)}'),
              ),
              if (!app.online)
                const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: Text('Offline: the sale is saved on this phone and sent automatically when back online.',
                      textAlign: TextAlign.center, style: TextStyle(color: Brand.warn, fontSize: 12)),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SaleDoneDialog extends StatefulWidget {
  const _SaleDoneDialog({required this.clientUuid});
  final String clientUuid;

  @override
  State<_SaleDoneDialog> createState() => _SaleDoneDialogState();
}

class _SaleDoneDialogState extends State<_SaleDoneDialog> {
  @override
  Widget build(BuildContext context) {
    final app = AppScope.of(context);
    final synced = app.receiptFor(widget.clientUuid);
    final sale = app.lastSale?.clientUuid == widget.clientUuid ? app.lastSale : null;
    final change = sale != null && sale.paymentMethod == 'Cash' ? round2(sale.amountTendered - sale.total) : null;
    return AlertDialog(
      icon: const Icon(Icons.check_circle, color: Brand.good, size: 40),
      title: const Text('Sale complete'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        if (change != null && change > 0.004) ...[
          const Text('Give change', style: TextStyle(color: Brand.muted)),
          Text(peso(change), style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
        ],
        if (synced != null)
          Text('Receipt ${synced.receiptNo}', style: const TextStyle(fontWeight: FontWeight.w600))
        else
          Text(
            app.online && app.syncing ? 'Sending…' : 'Saved on this phone. A receipt number is given when it syncs.',
            textAlign: TextAlign.center,
            style: const TextStyle(color: Brand.muted),
          ),
      ]),
      actions: [FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Next customer'))],
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty(this.text);
  final String text;
  @override
  Widget build(BuildContext context) =>
      Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(text, textAlign: TextAlign.center, style: const TextStyle(color: Brand.muted))));
}
