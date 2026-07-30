import 'package:flutter_test/flutter_test.dart';
import 'package:localvault_mobile/crypto/vault_crypto.dart';
import 'dart:convert';

void main() {
  test('username validation', () {
    expect(isValidUsername('tareq'), isTrue);
    expect(isValidUsername('ab'), isFalse);
    expect(isValidUsername('Bad'), isFalse);
  });

  test('recovery passphrase word count', () {
    final r = generateRecoveryPassphrase();
    expect(r.split(' ').length, 8);
  });

  test('enroll and unlock with PIN (KAT)', () async {
    final mat = await enrollVaultCrypto('123456');
    expect(mat.recoveryPassphrase.split(' ').length, 8);
    final dek = await unlockWithPin(
      '123456',
      mat.kdfParamsJson,
      mat.wrappedDekPin,
    );
    final enc = await encryptItem(dek, jsonEncode({'password': 'x'}));
    final plain = await decryptItem(dek, enc.ciphertext, enc.nonce);
    expect(jsonDecode(plain)['password'], 'x');
  }, timeout: const Timeout(Duration(minutes: 2)));
}
