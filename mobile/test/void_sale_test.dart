import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:momikie_pos/core/api.dart';
import 'package:momikie_pos/core/app_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Voiding from the app's Transactions list: sent with the reason, then the
/// day's sales and stock are reloaded; server refusals and being offline
/// come back as messages.
void main() {
  test('voids a sale, reloads, explains refusals', () async {
    SharedPreferences.setMockInitialValues({});
    var voided = false;
    var stock = 4;
    Map<String, dynamic>? posted;
    var offline = false;
    final client = MockClient((req) async {
      if (offline) throw http.ClientException('offline');
      switch (req.url.path) {
        case '/api/mobile/auth':
          return http.Response(jsonEncode({'token': 't', 'role': 'cashier', 'name': 'Cashier'}), 200);
        case '/api/mobile/bootstrap':
          return http.Response(
            jsonEncode({
              'me': {'name': 'Cashier', 'role': 'cashier'},
              'products': [
                {'id': 1, 'name': 'Sprite', 'srp': 20, 'stock_qty': stock, 'reorder_level': 0},
              ],
              'customers': [],
            }),
            200,
          );
        case '/api/mobile/sales':
          return http.Response(
            jsonEncode({
              'sales': [
                {
                  'id': 9,
                  'receiptNo': 'MOM-9',
                  'createdAt': '2026-10-04T11:00:00Z',
                  'total': 20,
                  'paymentMethod': 'Cash',
                  'creditAmount': 0,
                  'itemCount': 1,
                  'voided': voided,
                  'source': 'mobile',
                },
              ],
            }),
            200,
          );
        case '/api/mobile/void':
          posted = jsonDecode(req.body) as Map<String, dynamic>;
          if ((posted!['reason'] as String).isEmpty) return http.Response(jsonEncode({'error': 'Give a reason for the void.'}), 400);
          voided = true;
          stock = 5;
          return http.Response(jsonEncode({'ok': true}), 200);
      }
      return http.Response(jsonEncode({}), 200);
    });
    final app = AppState(api: Api('https://pos.test', client: client), autoSync: false);
    await app.init();
    await app.login('cashier', '123456');
    await app.refreshServerSales();
    final sale = app.serverSales.single;
    expect(sale.voided, isFalse);

    expect(await app.voidSale(sale, '  '), 'Give a reason for the void.');
    expect(await app.voidSale(sale, ' Wrong item '), isNull);
    expect(posted, {'saleId': 9, 'reason': 'Wrong item'});
    expect(app.serverSales.single.voided, isTrue);
    expect(app.products.single.stockQty, 5);

    offline = true;
    expect(await app.voidSale(sale, 'again'), contains('offline'));
  });
}
