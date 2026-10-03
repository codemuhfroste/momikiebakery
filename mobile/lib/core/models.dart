import 'dart:math';

typedef Json = Map<String, dynamic>;

double _d(Object? v) => v is num ? v.toDouble() : double.tryParse('$v') ?? 0;
double? _dn(Object? v) => v == null ? null : _d(v);
String? _s(Object? v) => v == null ? null : '$v';

/// A random id made on the phone for each sale/payment. The server uses it to
/// recognise an item it has already recorded, so re-sending is always safe.
String newClientId() {
  final r = Random.secure();
  String hex(int n) => List.generate(n, (_) => r.nextInt(16).toRadixString(16)).join();
  return '${hex(8)}-${hex(4)}-4${hex(3)}-${hex(4)}-${hex(12)}';
}

const paymentMethods = ['Cash', 'GCash', 'Maya', 'Card', 'Credit'];
const creditPaymentMethods = ['Cash', 'GCash', 'Maya', 'Card'];

class Product {
  final int id;
  final String name;
  final String? sku;
  final String? barcode;
  final String? categoryName;
  final double srp;
  final double stockQty;
  final double reorderLevel;
  final String? photoVersion;

  const Product({
    required this.id,
    required this.name,
    this.sku,
    this.barcode,
    this.categoryName,
    required this.srp,
    required this.stockQty,
    required this.reorderLevel,
    this.photoVersion,
  });

  factory Product.fromJson(Json j) => Product(
        id: (j['id'] as num).toInt(),
        name: '${j['name']}',
        sku: _s(j['sku']),
        barcode: _s(j['barcode']),
        categoryName: _s(j['category_name']),
        srp: _d(j['srp']),
        stockQty: _d(j['stock_qty']),
        reorderLevel: _d(j['reorder_level']),
        photoVersion: _s(j['photo_version']),
      );

  Json toJson() => {
        'id': id,
        'name': name,
        'sku': sku,
        'barcode': barcode,
        'category_name': categoryName,
        'srp': srp,
        'stock_qty': stockQty,
        'reorder_level': reorderLevel,
        'photo_version': photoVersion,
      };

  Product withStock(double stock) => Product(
        id: id,
        name: name,
        sku: sku,
        barcode: barcode,
        categoryName: categoryName,
        srp: srp,
        stockQty: stock,
        reorderLevel: reorderLevel,
        photoVersion: photoVersion,
      );
}

class Customer {
  final int id;
  final String name;
  final String? phone;
  final double? creditLimit; // null = no limit
  final double balance;

  const Customer({required this.id, required this.name, this.phone, this.creditLimit, required this.balance});

  factory Customer.fromJson(Json j) => Customer(
        id: (j['id'] as num).toInt(),
        name: '${j['name']}',
        phone: _s(j['phone']),
        creditLimit: _dn(j['credit_limit']),
        balance: _d(j['balance']),
      );

  Json toJson() => {'id': id, 'name': name, 'phone': phone, 'credit_limit': creditLimit, 'balance': balance};

  double? get available => creditLimit == null ? null : max(0, creditLimit! - balance);

  Customer withBalance(double b) => Customer(id: id, name: name, phone: phone, creditLimit: creditLimit, balance: b);
}

class CartLine {
  final Product product;
  double qty;
  CartLine(this.product, this.qty);
  double get total => product.srp * qty;
}

/// A sale saved on the phone and waiting to be sent (or one the server
/// couldn't accept, kept so someone can look at it).
class PendingSale {
  final String clientUuid;
  final DateTime recordedAt;
  final List<PendingSaleItem> items;
  final double discount;
  final String paymentMethod;
  final double amountTendered;
  final int? customerId;
  final String? customerName;
  final double total;
  String status; // "pending" | "rejected"
  String? error;

  PendingSale({
    required this.clientUuid,
    required this.recordedAt,
    required this.items,
    required this.discount,
    required this.paymentMethod,
    required this.amountTendered,
    this.customerId,
    this.customerName,
    required this.total,
    this.status = 'pending',
    this.error,
  });

  double get creditAmount => paymentMethod == 'Credit' ? round2(total - amountTendered) : 0;

  /// What the server's /api/mobile/sync expects.
  Json toWire() => {
        'clientUuid': clientUuid,
        'recordedAt': recordedAt.toUtc().toIso8601String(),
        'items': items.map((i) => i.toJson()).toList(),
        'discount': discount,
        'paymentMethod': paymentMethod,
        'amountTendered': amountTendered,
        'customerId': customerId,
      };

  Json toJson() => {
        ...toWire(),
        'customerName': customerName,
        'total': total,
        'status': status,
        'error': error,
      };

  factory PendingSale.fromJson(Json j) => PendingSale(
        clientUuid: '${j['clientUuid']}',
        recordedAt: DateTime.parse('${j['recordedAt']}'),
        items: (j['items'] as List).map((i) => PendingSaleItem.fromJson(i as Json)).toList(),
        discount: _d(j['discount']),
        paymentMethod: '${j['paymentMethod']}',
        amountTendered: _d(j['amountTendered']),
        customerId: (j['customerId'] as num?)?.toInt(),
        customerName: _s(j['customerName']),
        total: _d(j['total']),
        status: '${j['status'] ?? 'pending'}',
        error: _s(j['error']),
      );
}

class PendingSaleItem {
  final int productId;
  final String name;
  final double qty;
  final double unitPrice;
  final double srp;
  final String? barcode;

  const PendingSaleItem({
    required this.productId,
    required this.name,
    required this.qty,
    required this.unitPrice,
    required this.srp,
    this.barcode,
  });

  Json toJson() =>
      {'productId': productId, 'name': name, 'qty': qty, 'unitPrice': unitPrice, 'srp': srp, 'barcode': barcode};

  factory PendingSaleItem.fromJson(Json j) => PendingSaleItem(
        productId: (j['productId'] as num).toInt(),
        name: '${j['name']}',
        qty: _d(j['qty']),
        unitPrice: _d(j['unitPrice']),
        srp: _d(j['srp']),
        barcode: _s(j['barcode']),
      );
}

class PendingPayment {
  final String clientUuid;
  final DateTime recordedAt;
  final int customerId;
  final String customerName;
  final double amount;
  final String method;
  final String? note;
  String status; // "pending" | "rejected"
  String? error;

  PendingPayment({
    required this.clientUuid,
    required this.recordedAt,
    required this.customerId,
    required this.customerName,
    required this.amount,
    required this.method,
    this.note,
    this.status = 'pending',
    this.error,
  });

  Json toWire() => {
        'clientUuid': clientUuid,
        'recordedAt': recordedAt.toUtc().toIso8601String(),
        'customerId': customerId,
        'amount': amount,
        'method': method,
        'note': note,
      };

  Json toJson() => {...toWire(), 'customerName': customerName, 'status': status, 'error': error};

  factory PendingPayment.fromJson(Json j) => PendingPayment(
        clientUuid: '${j['clientUuid']}',
        recordedAt: DateTime.parse('${j['recordedAt']}'),
        customerId: (j['customerId'] as num).toInt(),
        customerName: '${j['customerName']}',
        amount: _d(j['amount']),
        method: '${j['method']}',
        note: _s(j['note']),
        status: '${j['status'] ?? 'pending'}',
        error: _s(j['error']),
      );
}

/// A sale made on this phone that has since been recorded on the server.
class SyncedReceipt {
  final String clientUuid;
  final String receiptNo;
  final double total;
  final String? note;
  final DateTime recordedAt;

  const SyncedReceipt({
    required this.clientUuid,
    required this.receiptNo,
    required this.total,
    this.note,
    required this.recordedAt,
  });

  Json toJson() =>
      {'clientUuid': clientUuid, 'receiptNo': receiptNo, 'total': total, 'note': note, 'recordedAt': recordedAt.toIso8601String()};

  factory SyncedReceipt.fromJson(Json j) => SyncedReceipt(
        clientUuid: '${j['clientUuid']}',
        receiptNo: '${j['receiptNo']}',
        total: _d(j['total']),
        note: _s(j['note']),
        recordedAt: DateTime.parse('${j['recordedAt']}'),
      );
}

/// A sale as recorded on the server (Sales tab).
class ServerSale {
  final int id;
  final String receiptNo;
  final DateTime createdAt;
  final double total;
  final String paymentMethod;
  final String? customerName;
  final double creditAmount;
  final double itemCount;
  final bool voided;
  final String source;
  final String? syncNote;

  const ServerSale({
    required this.id,
    required this.receiptNo,
    required this.createdAt,
    required this.total,
    required this.paymentMethod,
    this.customerName,
    required this.creditAmount,
    required this.itemCount,
    required this.voided,
    required this.source,
    this.syncNote,
  });

  factory ServerSale.fromJson(Json j) => ServerSale(
        id: (j['id'] as num).toInt(),
        receiptNo: '${j['receiptNo']}',
        createdAt: DateTime.parse('${j['createdAt']}'),
        total: _d(j['total']),
        paymentMethod: '${j['paymentMethod']}',
        customerName: _s(j['customerName']),
        creditAmount: _d(j['creditAmount']),
        itemCount: _d(j['itemCount']),
        voided: j['voided'] == true,
        source: '${j['source'] ?? 'web'}',
        syncNote: _s(j['syncNote']),
      );

  Json toJson() => {
        'id': id,
        'receiptNo': receiptNo,
        'createdAt': createdAt.toIso8601String(),
        'total': total,
        'paymentMethod': paymentMethod,
        'customerName': customerName,
        'creditAmount': creditAmount,
        'itemCount': itemCount,
        'voided': voided,
        'source': source,
        'syncNote': syncNote,
      };
}

double round2(num value) => (value * 100).round() / 100;
