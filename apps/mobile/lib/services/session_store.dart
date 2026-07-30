import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SessionStore {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  Future<void> save({
    required String baseUrl,
    required String username,
    required String token,
    String? deviceId,
  }) async {
    await _storage.write(key: 'baseUrl', value: baseUrl);
    await _storage.write(key: 'username', value: username);
    await _storage.write(key: 'token', value: token);
    if (deviceId != null) {
      await _storage.write(key: 'deviceId', value: deviceId);
    }
  }

  Future<Map<String, String?>> load() async => {
        'baseUrl': await _storage.read(key: 'baseUrl'),
        'username': await _storage.read(key: 'username'),
        'token': await _storage.read(key: 'token'),
        'deviceId': await _storage.read(key: 'deviceId'),
      };

  Future<void> clear() async => _storage.deleteAll();
}
