import 'dart:convert';
import 'package:http/http.dart' as http;

class VaultClient {
  VaultClient(this.baseUrl, {this.token});

  final String baseUrl;
  String? token;

  Uri _u(String path) => Uri.parse('${baseUrl.replaceAll(RegExp(r'/$'), '')}$path');

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Future<Map<String, dynamic>> health() async {
    final r = await http.get(_u('/healthz'));
    if (r.statusCode != 200) throw Exception('health ${r.statusCode}');
    return jsonDecode(r.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> serverInfo() async {
    final r = await http.get(_u('/v1/server-info'));
    if (r.statusCode != 200) throw Exception('server-info ${r.statusCode}');
    return jsonDecode(r.body) as Map<String, dynamic>;
  }

  Future<bool> usernameAvailable(String username) async {
    final r = await http.get(_u('/v1/users/check?username=${Uri.encodeComponent(username)}'));
    if (r.statusCode != 200) throw Exception('check ${r.statusCode}');
    final body = jsonDecode(r.body) as Map<String, dynamic>;
    return body['available'] == true;
  }

  Future<Map<String, dynamic>> register({
    required String username,
    required String deviceName,
    required String devicePublicKey,
    required String kdfParamsJson,
    required String wrappedDekPin,
    required String wrappedDekRecovery,
  }) async {
    final r = await http.post(
      _u('/v1/users/register'),
      headers: _headers,
      body: jsonEncode({
        'username': username,
        'device_name': deviceName,
        'device_public_key': devicePublicKey,
        'kdf_params_json': kdfParamsJson,
        'wrapped_dek_pin': wrappedDekPin,
        'wrapped_dek_recovery': wrappedDekRecovery,
      }),
    );
    if (r.statusCode != 201) {
      final err = jsonDecode(r.body);
      throw Exception(err['message'] ?? 'register ${r.statusCode}');
    }
    return jsonDecode(r.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> vaultMeta() async {
    final r = await http.get(_u('/v1/vault/meta'), headers: _headers);
    if (r.statusCode != 200) throw Exception('vault meta ${r.statusCode}');
    return jsonDecode(r.body) as Map<String, dynamic>;
  }

  Future<List<Map<String, dynamic>>> listItems() async {
    final r = await http.get(_u('/v1/items'), headers: _headers);
    if (r.statusCode != 200) throw Exception('items ${r.statusCode}');
    final body = jsonDecode(r.body) as Map<String, dynamic>;
    return (body['items'] as List).cast<Map<String, dynamic>>();
  }

  Future<String> createItem({
    required String ciphertext,
    required String nonce,
    required String aad,
  }) async {
    final r = await http.post(
      _u('/v1/items'),
      headers: _headers,
      body: jsonEncode({'ciphertext': ciphertext, 'nonce': nonce, 'aad': aad}),
    );
    if (r.statusCode != 201) throw Exception('create item ${r.statusCode}');
    return (jsonDecode(r.body) as Map<String, dynamic>)['id'] as String;
  }
}
