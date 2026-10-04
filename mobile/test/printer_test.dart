import 'package:flutter_test/flutter_test.dart';
import 'package:momikie_pos/core/models.dart';
import 'package:momikie_pos/core/printer.dart';

/// The printed text of ESC/POS bytes: printable characters and line breaks,
/// with the control sequences removed.
String printedText(List<int> bytes) {
  final out = StringBuffer();
  var i = 0;
  while (i < bytes.length) {
    final b = bytes[i];
    if (b == 0x1B || b == 0x1D) {
      // ESC/GS commands used here: ESC @ (2 bytes), ESC a/E/t n (3), GS ! n (3),
      // GS V 66 n (4), ESC p m t1 t2 (5).
      final cmd = bytes[i + 1];
      i += switch ((b, cmd)) { (0x1B, 0x40) => 2, (0x1D, 0x56) => 4, (0x1B, 0x70) => 5, _ => 3 };
      continue;
    }
    out.writeCharCode(b == 0x0A ? 0x0A : b);
    i++;
  }
  return out.toString();
}

PendingSale sampleSale({String method = 'Cash'}) => PendingSale(
      clientUuid: 'abcdef12-3456-4789-abcd-ef0123456789',
      recordedAt: DateTime.utc(2026, 10, 4, 6, 30),
      items: const [
        PendingSaleItem(productId: 1, name: 'Milo 22g', qty: 48, packs: 2, packName: 'box', packSize: 24, unitPrice: 240, srp: 240),
        PendingSaleItem(productId: 2, name: 'Pandesal (per piece) with a very long name that wraps', qty: 5, unitPrice: 3, srp: 3),
      ],
      discount: 5,
      paymentMethod: method,
      amountTendered: 500,
      total: 490,
      priceType: 'wholesale',
    );

void main() {
  test('a wholesale cash receipt reads right and fits a 58 mm roll', () {
    final bytes = buildReceipt(ReceiptData.fromPending(sampleSale(), cashier: 'Ana', receiptNo: 'MOM-20261004-0012'), width: 32);
    final text = printedText(bytes);
    for (final line in text.split('\n')) {
      expect(line.length, lessThanOrEqualTo(32), reason: line);
    }
    expect(text, contains("MOMIKIE'S GENERAL"));
    expect(text, contains('WHOLESALE'));
    expect(text, contains('Receipt No. MOM-20261004-0012'));
    expect(text, contains('Oct 4, 2026  2:30 PM')); // Philippine time
    expect(text, isNot(contains('Cashier')));
    expect(text, contains('2 boxes of 24 x 240.00'));
    expect(text, contains('480.00'));
    expect(text, contains('5 x 3.00'));
    expect(RegExp(r'Subtotal\s+P495\.00').hasMatch(text), isTrue, reason: text);
    expect(RegExp(r'Discount\s+-P5\.00').hasMatch(text), isTrue);
    expect(RegExp(r'TOTAL\s+P490\.00').hasMatch(text), isTrue);
    expect(RegExp(r'Change\s+P10\.00').hasMatch(text), isTrue);
    expect(text, contains('NOT VALID FOR'));
    expect(text, contains('CLAIM OF INPUT TAX.'));
    // Ends with feed + partial cut; no drawer kick unless asked.
    expect(bytes.sublist(bytes.length - 4), [0x1D, 0x56, 0x42, 0x00]);
    expect(String.fromCharCodes(bytes).contains('\x1Bp'), isFalse);
  });

  test('80 mm, cash drawer, offline reference, credit sale', () {
    final cash = buildReceipt(ReceiptData.fromPending(sampleSale(), cashier: 'Ana'), width: 48, openDrawer: true);
    expect(cash.sublist(5, 10), [0x1B, 0x70, 0x00, 0x19, 0xFA]); // drawer kick right after setup
    final text = printedText(cash);
    expect(text, contains('Ref. ABCDEF12'));
    expect(text, contains('Saved offline'));
    for (final line in text.split('\n')) {
      expect(line.length, lessThanOrEqualTo(48));
    }
    final credit = printedText(buildReceipt(ReceiptData.fromPending(sampleSale(method: 'Credit'), cashier: 'Ana'), width: 32));
    expect(credit, contains('Charged to account'));
  });

  test('a reprint from the server', () {
    final r = ReceiptData.fromServer({
      'sale': {
        'receiptNo': 'MOM-1', 'createdAt': '2026-10-04T01:00:00.000Z', 'cashierName': 'Owner', 'customerName': 'Aling Nena',
        'priceType': 'retail', 'subtotal': 36, 'discount': 0, 'total': 36, 'paymentMethod': 'GCash', 'amountTendered': 36,
        'creditAmount': 0, 'voided': true,
      },
      'items': [
        {'name': 'Ñiyog candy', 'qty': 3, 'unitPrice': 12, 'lineTotal': 36, 'packs': null},
      ],
    });
    final bytes = buildReceipt(r, width: 32);
    final text = printedText(bytes);
    expect(text, contains('VOIDED'));
    expect(text, contains('Customer: Aling Nena'));
    expect(bytes, contains(0xA5)); // Ñ in the printer's code page
    expect(RegExp(r'GCash\s+P36\.00').hasMatch(text), isTrue);
  });
}
