import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:momikie_pos/core/api.dart';
import 'package:momikie_pos/core/app_state.dart';
import 'package:momikie_pos/core/nav.dart';
import 'package:momikie_pos/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Renders every page at the tablet's landscape and portrait sizes and at a
/// phone's size, and fails on any layout overflow (Flutter reports those as
/// errors), so the website-style layout holds up on each screen.
http.Client fakeServer() => MockClient((req) async {
  switch (req.url.path) {
    case '/api/mobile/auth':
      return http.Response(jsonEncode({'token': 't', 'role': 'cashier', 'name': 'Cashier'}), 200);
    case '/api/mobile/bootstrap':
      return http.Response(
        jsonEncode({
          'me': {'name': 'Cashier', 'role': 'cashier'},
          'demo': true,
          'paymentsToday': 150,
          'products': [
            for (var i = 1; i <= 14; i++)
              {
                'id': i,
                'name': i == 3 ? 'A product with a very long name that has to wrap onto two lines' : 'Product $i',
                'category_name': i.isEven ? 'Beverages' : 'Bread & Pastries',
                'srp': 10.0 + i,
                'stock_qty': i == 5 ? 0 : 20,
                'reorder_level': 5,
                'barcode': '48000000000$i',
              },
          ],
          'customers': [
            {
              'id': 7,
              'name': 'Aling Nena Santos',
              'phone': '0917 123 4567',
              'credit_limit': 200,
              'balance': 250,
              'last_activity': '2026-10-03T03:00:00.000Z',
              'oldest_unpaid': '2026-08-01T03:00:00.000Z',
            },
            {'id': 8, 'name': 'Mang Jose', 'credit_limit': null, 'balance': 0},
          ],
        }),
        200,
      );
    case '/api/mobile/sales':
      return http.Response(
        jsonEncode({
          'sales': [
            {
              'id': 1,
              'receiptNo': 'MOM-20261004-0001',
              'createdAt': '2026-10-04T02:00:00.000Z',
              'total': 53,
              'paymentMethod': 'Credit',
              'customerName': 'Aling Nena Santos',
              'cashierName': 'Cashier',
              'creditAmount': 53,
              'creditPaid': 10,
              'overrideCount': 1,
              'itemCount': 2,
              'voided': false,
              'source': 'mobile',
              'syncNote': 'Sold 3 with 2 in stock',
            },
            {
              'id': 2,
              'receiptNo': 'MOM-20261004-0002',
              'createdAt': '2026-10-04T03:00:00.000Z',
              'total': 20,
              'paymentMethod': 'Cash',
              'cashierName': 'Ana',
              'creditAmount': 0,
              'itemCount': 1,
              'voided': true,
              'source': 'web',
            },
          ],
        }),
        200,
      );
  }
  return http.Response('{}', 404);
});

Future<void> showPages(WidgetTester tester, Size size) async {
  tester.view.physicalSize = size * 1.75;
  tester.view.devicePixelRatio = 1.75;
  addTearDown(tester.view.reset);
  SharedPreferences.setMockInitialValues({});
  final app = AppState(api: Api('https://pos.test', client: fakeServer()), autoSync: false);
  await app.init();
  await tester.pumpWidget(MomikieApp(state: app));
  await tester.pump(const Duration(milliseconds: 500));
  expect(find.text('Cashier sign in'), findsOneWidget);

  await app.login('cashier', '123456');
  await tester.pump(const Duration(milliseconds: 500));
  expect(find.text('Register'), findsWidgets);

  // Ring something up so the order panel shows its lines.
  await tester.tap(find.text('Product 1').first);
  await tester.tap(find.text('Product 2').first);
  await tester.pump(const Duration(milliseconds: 800));
  expect(find.textContaining('Complete sale'), findsOneWidget);

  // The menu (drawer on narrow screens) renders with every page in it.
  if (size.width < 1024) {
    await tester.tap(find.byTooltip('Open menu'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Dashboard'), findsOneWidget);
    await tester.tap(find.byTooltip('Close menu'));
    await tester.pump(const Duration(milliseconds: 400));
  } else {
    expect(find.text('Dashboard'), findsOneWidget);
  }
  // The app's own pages. (Website pages need a real device's web view.)
  for (final page in ['sales', 'credit', 'sync', 'register']) {
    appNav.go(page);
    await tester.pump(const Duration(milliseconds: 800));
  }
}

void main() {
  testWidgets('tablet landscape (sidebar layout)', (t) => showPages(t, const Size(1097, 686)));
  testWidgets('tablet portrait (menu layout)', (t) => showPages(t, const Size(686, 1097)));
  testWidgets('phone', (t) => showPages(t, const Size(390, 844)));
}
