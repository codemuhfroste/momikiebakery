import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:momikie_pos/core/api.dart';
import 'package:momikie_pos/core/app_state.dart';
import 'package:momikie_pos/core/format.dart';
import 'package:momikie_pos/core/models.dart';
import 'package:momikie_pos/core/printer.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'printer_test.dart' show printedText;

/// Products sold by weight: the cart line holds kilos, the sale goes to the
/// server in kg with unit 'kg', stock drops by the kilos, and the receipt
/// reads "0.35 kg x 80.00".
void main() {
  test('a weighed sale is sent in kg and printed in kg', () async {
    SharedPreferences.setMockInitialValues({});
    final sent = <Map<String, dynamic>>[];
    var offline = true;
    final client = MockClient((req) async {
      if (offline && req.url.path != '/api/mobile/auth') throw http.ClientException('offline');
      switch (req.url.path) {
        case '/api/mobile/auth':
          return http.Response(jsonEncode({'token': 't', 'role': 'cashier', 'name': 'Cashier'}), 200);
        case '/api/mobile/bootstrap':
          return http.Response(
            jsonEncode({
              'me': {'name': 'Cashier', 'role': 'cashier'},
              'products': [
                {'id': 1, 'name': 'Tomato', 'srp': 80, 'stock_qty': 10.5, 'reorder_level': 1, 'unit': 'kg'},
                {'id': 2, 'name': 'Calamansi', 'srp': 2, 'stock_qty': 300, 'reorder_level': 0, 'unit': 'piece'},
              ],
              'customers': [],
            }),
            200,
          );
        case '/api/mobile/sync':
          final body = jsonDecode(req.body) as Map<String, dynamic>;
          sent.addAll((body['sales'] as List).cast<Map<String, dynamic>>());
          return http.Response(
            jsonEncode({
              'sales': [
                for (final s in body['sales'] as List) {'clientUuid': s['clientUuid'], 'status': 'ok', 'receiptNo': 'MOM-1'},
              ],
              'payments': [],
            }),
            200,
          );
      }
      return http.Response(jsonEncode({'sales': []}), 200);
    });
    final app = AppState(api: Api('https://pos.test', client: client), autoSync: false);
    await app.init();
    offline = false;
    await app.login('cashier', '123456');
    offline = true;

    final tomato = app.products.firstWhere((p) => p.name == 'Tomato');
    final calamansi = app.products.firstWhere((p) => p.name == 'Calamansi');
    expect(tomato.byWeight, isTrue);
    expect(calamansi.byWeight, isFalse);
    final line = CartLine(tomato, 0.35);
    expect(line.weighed, isTrue);
    expect(line.total, 28);

    final error = await app.ringUpSale(cart: [line, CartLine(calamansi, 10)], discount: 0, method: 'Cash', amountTendered: 100);
    expect(error, isNull);
    final pending = app.pendingSales.single;
    expect(pending.total, 48);
    expect(app.products.firstWhere((p) => p.id == 1).stockQty, closeTo(10.15, 1e-9));
    // Kept across restarts (saved as JSON).
    expect(PendingSaleItem.fromJson(pending.items.first.toJson()).unit, 'kg');

    final text = printedText(buildReceipt(ReceiptData.fromPending(pending, cashier: 'Ana'), width: 32));
    expect(text, contains('0.35 kg x 80.00'));
    expect(text, contains('10 x 2.00'));

    offline = false;
    await app.syncNow();
    final items = (sent.single['items'] as List).cast<Map<String, dynamic>>();
    expect(items[0]['qty'], 0.35);
    expect(items[0]['unit'], 'kg');
    expect(items[1].containsKey('unit'), isFalse);
  });

  test('reprint from the server shows kg', () {
    final data = ReceiptData.fromServer({
      'sale': {
        'receiptNo': 'MOM-2',
        'createdAt': '2026-10-04T06:30:00Z',
        'cashierName': 'Ana',
        'subtotal': 40,
        'discount': 0,
        'total': 40,
        'paymentMethod': 'Cash',
        'amountTendered': 50,
        'creditAmount': 0,
      },
      'items': [
        {'name': 'Pechay', 'qty': 0.5, 'unitPrice': 80, 'lineTotal': 40, 'unit': 'kg'},
      ],
    });
    expect(data.lines.single.detail, '0.5 kg x 80.00');
  });

  test('kg to the gram', () {
    expect(qty(0.35), '0.35');
    expect(qty(0.125), '0.125');
    expect(qty(2), '2');
    expect(round3(50 / 80), 0.625);
    expect(round3(25 / 80), 0.313);
  });
}
