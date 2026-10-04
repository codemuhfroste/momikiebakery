import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:momikie_pos/core/api.dart';
import 'package:momikie_pos/core/app_state.dart';
import 'package:momikie_pos/core/models.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A wholesale sale rung up on the tablet (possibly offline): lines sold by
/// the pack go to the server as packs at the pack price, and the tablet's
/// stock drops by the pieces.
void main() {
  test('a box sale is sent as packs and takes pieces off stock', () async {
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
                {'id': 1, 'name': 'Milo 22g', 'srp': 12, 'stock_qty': 100, 'reorder_level': 0, 'pack_name': 'box', 'pack_size': 24, 'wholesale_price': 240},
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
              'sales': [for (final s in body['sales'] as List) {'clientUuid': s['clientUuid'], 'status': 'ok', 'receiptNo': 'MOM-1'}],
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

    final milo = app.products.single;
    expect(milo.hasWholesale, isTrue);
    expect(milo.packLabel, 'box of 24');
    final error = await app.ringUpSale(
      cart: [CartLine(milo, 2, byPack: true), CartLine(milo, 5)],
      discount: 0,
      method: 'Cash',
      amountTendered: 600,
      priceType: 'wholesale',
    );
    expect(error, isNull);
    expect(app.pendingSales.single.total, 540); // 2 × 240 + 5 × 12
    expect(app.products.single.stockQty, 100 - 48 - 5);

    offline = false;
    await app.syncNow();
    final wire = sent.single;
    expect(wire['priceType'], 'wholesale');
    final items = (wire['items'] as List).cast<Map<String, dynamic>>();
    expect(items[0], containsPair('packs', 2));
    expect(items[0]['qty'], 48);
    expect(items[0]['unitPrice'], 240);
    expect(items[0]['srp'], 240); // the pack price the tablet showed
    expect(items[1].containsKey('packs'), isFalse);
    expect(items[1]['qty'], 5);
    expect(packPlural('box', 2), 'boxes');
    expect(packPlural('dozen', 3), 'dozen');
    expect(packPlural('tray', 2), 'trays');
  });
}
