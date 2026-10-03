import 'dart:convert';

import 'package:http/http.dart' as http;

import 'models.dart';

class ApiException implements Exception {
  final String message;
  final int? status;

  /// True when the server couldn't be reached at all (no signal, blackout,
  /// router down) — as opposed to the server answering with an error.
  final bool network;

  ApiException(this.message, {this.status, this.network = false});

  bool get unauthorized => status == 401;

  @override
  String toString() => message;
}

/// Talks to the website's /api/mobile/* routes — the same server and
/// database as the website. The phone never holds database credentials; it
/// carries the signed session token from sign-in as a Bearer header.
class Api {
  String baseUrl;
  String? token;
  final http.Client _client;

  Api(this.baseUrl, {http.Client? client}) : _client = client ?? http.Client();

  String get _base => baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;

  Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('$_base/api/mobile$path').replace(queryParameters: query);

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  /// Product photos are served by the website and need the same token.
  String? photoUrl(Product p) => p.photoVersion == null ? null : '$_base/api/products/${p.id}/photo?v=${p.photoVersion}';
  Map<String, String> get imageHeaders => {if (token != null) 'Authorization': 'Bearer $token'};

  Future<Json> login({required String role, required String pin}) async =>
      await _send(() => _client.post(_uri('/auth'), headers: _headers, body: jsonEncode({'role': role, 'pin': pin}))) as Json;

  Future<Json> bootstrap() async => await _send(() => _client.get(_uri('/bootstrap'), headers: _headers)) as Json;

  Future<Json> sync({required List<Json> sales, required List<Json> payments}) async => await _send(
        () => _client.post(_uri('/sync'), headers: _headers, body: jsonEncode({'sales': sales, 'payments': payments})),
        timeout: const Duration(seconds: 60),
      ) as Json;

  Future<Json> sales(String date) async =>
      await _send(() => _client.get(_uri('/sales', {'date': date}), headers: _headers)) as Json;

  Future<Object?> _send(Future<http.Response> Function() request, {Duration timeout = const Duration(seconds: 20)}) async {
    http.Response res;
    try {
      res = await request().timeout(timeout);
    } catch (_) {
      throw ApiException("Can't reach the server. You're offline — sales are saved on this phone.", network: true);
    }
    Object? body;
    try {
      body = res.body.isEmpty ? null : jsonDecode(res.body);
    } catch (_) {
      body = null;
    }
    if (res.statusCode >= 200 && res.statusCode < 300) return body;
    final message = body is Map && body['error'] is String ? body['error'] as String : 'Server error (HTTP ${res.statusCode}).';
    throw ApiException(message, status: res.statusCode);
  }
}
