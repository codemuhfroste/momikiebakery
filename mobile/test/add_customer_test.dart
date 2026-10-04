import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:momikie_pos/core/api.dart';
import 'package:momikie_pos/core/app_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Adding a credit customer from the tablet: sent to the server, then the
/// customer list is reloaded so they can be picked at the register.
void main() {
  test('adds a customer online, explains when offline', () async {
    SharedPreferences.setMockInitialValues({});
    final customers = <Map<String, dynamic>>[];
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
              'products': [],
              'customers': customers,
            }),
            200,
          );
        case '/api/mobile/customers':
          posted = jsonDecode(req.body) as Map<String, dynamic>;
          if ((posted!['name'] as String).isEmpty) return http.Response(jsonEncode({'error': 'Name is required.'}), 400);
          customers.add({
            'id': 7,
            'name': posted!['name'],
            'phone': posted!['phone'],
            'balance': 0,
            'credit_limit': posted!['creditLimit'],
          });
          return http.Response(jsonEncode({'id': 7}), 200);
      }
      return http.Response(jsonEncode({'sales': []}), 200);
    });
    final app = AppState(api: Api('https://pos.test', client: client), autoSync: false);
    await app.init();
    await app.login('cashier', '123456');
    expect(app.customers, isEmpty);

    final (c, error) = await app.addCustomer(name: ' Aling Nena ', phone: '0917 123 4567', creditLimit: 2000);
    expect(error, isNull);
    expect(c?.id, 7);
    expect(c?.name, 'Aling Nena');
    expect(posted, containsPair('creditLimit', 2000));
    expect(app.customers.single.name, 'Aling Nena');

    final (_, nameError) = await app.addCustomer(name: '');
    expect(nameError, 'Name is required.');

    offline = true;
    final (none, offlineError) = await app.addCustomer(name: 'Mang Jose');
    expect(none, isNull);
    expect(offlineError, contains('offline'));
  });
}
