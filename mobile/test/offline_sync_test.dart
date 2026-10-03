import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:momikie_pos/core/api.dart';
import 'package:momikie_pos/core/app_state.dart';
import 'package:momikie_pos/core/models.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A tiny stand-in for the website's /api/mobile routes, with the same rules
/// that matter here: each clientUuid is recorded once, and it can be switched
/// "offline" (unreachable) or made to drop the connection after saving.
class FakeServer {
  bool offline = false;
  bool dropAfterSaving = false; // saves the sale, then the phone never hears back
  bool expiredToken = false;
  final recorded = <String, String>{}; // clientUuid -> receipt no
  final rejectIds = <String>{};
  final payments = <String>{};
  double pandesalStock = 100;
  double nenaBalance = 50;
  int syncCalls = 0;

  late final http.Client client = MockClient((req) async {
    if (offline) throw http.ClientException('no route to host');
    if (expiredToken && req.url.path != '/api/mobile/auth') {
      return http.Response(jsonEncode({'error': 'Please sign in again.'}), 401);
    }
    switch (req.url.path) {
      case '/api/mobile/auth':
        return http.Response(jsonEncode({'token': 't0k3n', 'role': 'cashier', 'name': 'Cashier'}), 200);
      case '/api/mobile/bootstrap':
        return http.Response(
          jsonEncode({
            'me': {'name': 'Cashier', 'role': 'cashier'},
            'products': [
              {'id': 1, 'name': 'Pandesal', 'srp': 3, 'stock_qty': pandesalStock, 'reorder_level': 10},
            ],
            'customers': [
              {'id': 7, 'name': 'Aling Nena', 'credit_limit': 200, 'balance': nenaBalance},
            ],
          }),
          200,
        );
      case '/api/mobile/sales':
        return http.Response(jsonEncode({'sales': []}), 200);
      case '/api/mobile/sync':
        syncCalls++;
        final body = jsonDecode(req.body) as Map<String, dynamic>;
        final saleResults = [];
        for (final s in body['sales'] as List) {
          final id = s['clientUuid'] as String;
          if (rejectIds.contains(id)) {
            saleResults.add({'clientUuid': id, 'status': 'rejected', 'error': 'Unknown product.'});
            continue;
          }
          if (!recorded.containsKey(id)) {
            recorded[id] = 'MOM-20261003-${(recorded.length + 1).toString().padLeft(4, '0')}';
            for (final i in s['items'] as List) {
              pandesalStock -= (i['qty'] as num).toDouble();
            }
            if (s['paymentMethod'] == 'Credit') {
              final total = (s['items'] as List).fold<double>(0, (t, i) => t + (i['qty'] as num) * (i['unitPrice'] as num));
              nenaBalance += total - (s['amountTendered'] as num);
            }
          }
          saleResults.add({'clientUuid': id, 'status': 'ok', 'receiptNo': recorded[id], 'saleId': recorded.length});
        }
        final payResults = [];
        for (final p in body['payments'] as List) {
          final id = p['clientUuid'] as String;
          if (payments.add(id)) nenaBalance -= (p['amount'] as num).toDouble();
          payResults.add({'clientUuid': id, 'status': 'ok'});
        }
        if (dropAfterSaving) {
          dropAfterSaving = false;
          throw http.ClientException('connection reset');
        }
        return http.Response(jsonEncode({'sales': saleResults, 'payments': payResults}), 200);
    }
    return http.Response('not found', 404);
  });
}

Future<AppState> newApp(FakeServer server) async {
  final app = AppState(api: Api('https://pos.test', client: server.client), autoSync: false);
  await app.init();
  return app;
}

void main() {
  late FakeServer server;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    server = FakeServer();
  });

  Future<AppState> signedIn() async {
    final app = await newApp(server);
    await app.login('cashier', '123456');
    return app;
  }

  List<CartLine> cart(AppState app, double n) => [CartLine(app.products.first, n)];

  test('a sale rung up offline is kept on the phone and applied to local stock', () async {
    final app = await signedIn();
    server.offline = true;

    final err = await app.ringUpSale(cart: cart(app, 10), discount: 0, method: 'Cash', amountTendered: 50);
    await app.syncNow();

    expect(err, isNull);
    expect(app.online, isFalse);
    expect(app.waitingCount, 1);
    expect(app.products.first.stockQty, 90);
    expect(server.recorded, isEmpty);
  });

  test('the outbox survives the app being closed (flat battery, crash)', () async {
    final app = await signedIn();
    server.offline = true;
    await app.ringUpSale(cart: cart(app, 4), discount: 0, method: 'Cash', amountTendered: 20);

    final reopened = await newApp(server);
    expect(reopened.waitingCount, 1);
    expect(reopened.pendingSales.single.items.single.qty, 4);
    expect(reopened.signedIn, isTrue, reason: 'stays signed in, so it opens offline');
  });

  test('when the connection returns, waiting sales are sent and get receipt numbers', () async {
    final app = await signedIn();
    server.offline = true;
    await app.ringUpSale(cart: cart(app, 10), discount: 0, method: 'Cash', amountTendered: 50);
    await app.ringUpSale(cart: cart(app, 5), discount: 0, method: 'GCash', amountTendered: 0);
    expect(app.waitingCount, 2);

    server.offline = false;
    await app.syncNow();

    expect(app.waitingCount, 0);
    expect(app.online, isTrue);
    expect(server.recorded.length, 2);
    expect(app.recentReceipts.map((r) => r.receiptNo), containsAll(['MOM-20261003-0001', 'MOM-20261003-0002']));
    expect(app.products.first.stockQty, 85, reason: 'server stock (100-15), not counted twice');
  });

  test('a dropped connection right after the server saved does not double the sale', () async {
    final app = await signedIn();
    server.offline = true;
    await app.ringUpSale(cart: cart(app, 10), discount: 0, method: 'Cash', amountTendered: 50);
    await app.syncNow(); // offline: stays queued
    expect(app.waitingCount, 1);

    // Connection comes back, the server records the sale, then the reply is lost.
    server
      ..offline = false
      ..dropAfterSaving = true;
    await app.syncNow();
    expect(server.recorded.length, 1, reason: 'the server did save it');
    expect(app.waitingCount, 1, reason: 'but the phone never heard back, so it keeps it');

    // Next sync re-sends the same id; the server recognises it.
    await app.syncNow();
    expect(app.waitingCount, 0);
    expect(server.recorded.length, 1, reason: 'still one sale, not two');
    expect(server.pandesalStock, 90, reason: 'stock taken once');
    expect(app.recentReceipts.single.receiptNo, 'MOM-20261003-0001');
  });

  test('a sale the server rejects stays under "needs attention" and can be retried or removed', () async {
    final app = await signedIn();
    server.offline = true;
    await app.ringUpSale(cart: cart(app, 2), discount: 0, method: 'Cash', amountTendered: 10);
    final id = app.pendingSales.single.clientUuid;
    server
      ..offline = false
      ..rejectIds.add(id);
    await app.syncNow();

    expect(app.attentionCount, 1);
    expect(app.pendingSales.single.error, 'Unknown product.');

    server.rejectIds.clear();
    await app.retry(id);
    await app.syncNow();
    expect(app.attentionCount, 0);
    expect(server.recorded.containsKey(id), isTrue);
  });

  test('an expired sign-in keeps everything and asks to sign in again', () async {
    final app = await signedIn();
    server.offline = true;
    await app.ringUpSale(cart: cart(app, 2), discount: 0, method: 'Cash', amountTendered: 10);
    server
      ..offline = false
      ..expiredToken = true;
    await app.syncNow();

    expect(app.needsLogin, isTrue);
    expect(app.waitingCount, 1);

    server.expiredToken = false;
    await app.login('cashier', '123456');
    expect(app.waitingCount, 0);
    expect(server.recorded.length, 1);
  });

  test('credit sale and payment offline update the balance, then sync', () async {
    final app = await signedIn();
    server.offline = true;
    final e1 = await app.ringUpSale(cart: cart(app, 20), discount: 0, method: 'Credit', amountTendered: 10, customerId: 7);
    expect(e1, isNull);
    expect(app.customers.single.balance, 100, reason: '50 + (60 - 10 down)');

    final e2 = await app.recordPayment(customer: app.customers.single, amount: 30, method: 'Cash');
    expect(e2, isNull);
    expect(app.customers.single.balance, 70);

    server.offline = false;
    await app.syncNow();
    expect(app.waitingCount, 0);
    expect(server.nenaBalance, 70);
    expect(app.customers.single.balance, 70);
  });

  test('same checks as the website before saving', () async {
    final app = await signedIn();
    expect(await app.ringUpSale(cart: cart(app, 10), discount: 0, method: 'Cash', amountTendered: 5), isNotNull,
        reason: 'cash short');
    expect(await app.ringUpSale(cart: cart(app, 80), discount: 0, method: 'Credit', amountTendered: 0, customerId: 7), isNotNull,
        reason: 'over the ₱200 limit');
    expect(await app.ringUpSale(cart: cart(app, 1), discount: 0, method: 'Credit', amountTendered: 0), isNotNull,
        reason: 'credit without a customer');
    expect(await app.recordPayment(customer: app.customers.single, amount: 999, method: 'Cash'), isNotNull,
        reason: 'more than owed');
    expect(app.waitingCount, 0);
  });
}
