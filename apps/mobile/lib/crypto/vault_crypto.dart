import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';

/// Mobile Argon2id profile (REQ-015): 64 MiB, t=3, p=1
const mobileArgon2Memory = 65536;
const mobileArgon2Iterations = 3;
const mobileArgon2Parallelism = 1;

final _argon2 = Argon2id(
  parallelism: mobileArgon2Parallelism,
  memory: mobileArgon2Memory,
  iterations: mobileArgon2Iterations,
  hashLength: 32,
);

final _aes = AesGcm.with256bits();
final _rnd = Random.secure();

Uint8List randomBytes(int n) {
  final b = Uint8List(n);
  for (var i = 0; i < n; i++) {
    b[i] = _rnd.nextInt(256);
  }
  return b;
}

String b64(List<int> bytes) => base64Encode(bytes);
Uint8List fromB64(String s) => Uint8List.fromList(base64Decode(s));

const _words = [
  'anchor', 'bright', 'cedar', 'drift', 'ember', 'fjord', 'glacier', 'harbor',
  'ion', 'jade', 'kite', 'lotus', 'maple', 'north', 'orbit', 'pine', 'quartz',
  'river', 'solar', 'tide', 'umbra', 'vale', 'willow', 'xenon', 'yellow', 'zephyr',
  'alpha', 'bravo', 'comet', 'delta', 'echo', 'frost', 'grove', 'horizon', 'iris',
];

String generateRecoveryPassphrase({int wordCount = 8}) {
  final out = <String>[];
  for (var i = 0; i < wordCount; i++) {
    out.add(_words[_rnd.nextInt(_words.length)]);
  }
  return out.join(' ');
}

bool isValidUsername(String u) =>
    RegExp(r'^[a-z0-9][a-z0-9._-]{2,31}$').hasMatch(u);

class EnrollmentMaterial {
  EnrollmentMaterial({
    required this.kdfParamsJson,
    required this.wrappedDekPin,
    required this.wrappedDekRecovery,
    required this.dek,
    required this.recoveryPassphrase,
  });

  final String kdfParamsJson;
  final String wrappedDekPin;
  final String wrappedDekRecovery;
  final SecretKey dek;
  final String recoveryPassphrase;
}

Future<SecretKey> deriveKek(String secret, List<int> salt) async {
  final result = await _argon2.deriveKey(
    secretKey: SecretKey(utf8.encode(secret)),
    nonce: salt,
  );
  return result;
}

Future<String> wrapDek(SecretKey dek, SecretKey kek) async {
  final dekBytes = await dek.extractBytes();
  final secretBox = await _aes.encrypt(
    dekBytes,
    secretKey: kek,
  );
  final out = <int>[...secretBox.nonce, ...secretBox.cipherText, ...secretBox.mac.bytes];
  return b64(out);
}

Future<SecretKey> unwrapDek(String wrappedB64, SecretKey kek) async {
  final raw = fromB64(wrappedB64);
  final nonce = raw.sublist(0, 12);
  final mac = Mac(raw.sublist(raw.length - 16));
  final ct = raw.sublist(12, raw.length - 16);
  final clear = await _aes.decrypt(
    SecretBox(ct, nonce: nonce, mac: mac),
    secretKey: kek,
  );
  return SecretKey(clear);
}

Future<EnrollmentMaterial> enrollVaultCrypto(String pin) async {
  if (!RegExp(r'^\d{6,12}$').hasMatch(pin)) {
    throw ArgumentError('PIN must be 6–12 digits');
  }
  final pinSalt = randomBytes(16);
  final recSalt = randomBytes(16);
  final recovery = generateRecoveryPassphrase();
  final dek = SecretKey(randomBytes(32));

  final pinKek = await deriveKek(pin, pinSalt);
  final recKek = await deriveKek(recovery, recSalt);
  final wrappedPin = await wrapDek(dek, pinKek);
  final wrappedRec = await wrapDek(dek, recKek);

  final kdf = {
    'version': 1,
    'pin_profile': 'mobile_pin',
    'pin': {
      'm': mobileArgon2Memory,
      't': mobileArgon2Iterations,
      'p': mobileArgon2Parallelism,
      'salt_b64': b64(pinSalt),
    },
    'recovery': {
      'm': 131072,
      't': 4,
      'p': 2,
      'salt_b64': b64(recSalt),
    },
  };

  return EnrollmentMaterial(
    kdfParamsJson: jsonEncode(kdf),
    wrappedDekPin: wrappedPin,
    wrappedDekRecovery: wrappedRec,
    dek: dek,
    recoveryPassphrase: recovery,
  );
}

Future<SecretKey> unlockWithPin(
  String pin,
  String kdfParamsJson,
  String wrappedDekPin,
) async {
  final kdf = jsonDecode(kdfParamsJson) as Map<String, dynamic>;
  final pinParams = kdf['pin'] as Map<String, dynamic>;
  final salt = fromB64(pinParams['salt_b64'] as String);
  // Use params from vault_meta when present
  final algo = Argon2id(
    parallelism: (pinParams['p'] as num?)?.toInt() ?? mobileArgon2Parallelism,
    memory: (pinParams['m'] as num?)?.toInt() ?? mobileArgon2Memory,
    iterations: (pinParams['t'] as num?)?.toInt() ?? mobileArgon2Iterations,
    hashLength: 32,
  );
  final kek = await algo.deriveKey(
    secretKey: SecretKey(utf8.encode(pin)),
    nonce: salt,
  );
  return unwrapDek(wrappedDekPin, kek);
}

Future<({String ciphertext, String nonce, String aad})> encryptItem(
  SecretKey dek,
  String plaintext, {
  String aad = 'item',
}) async {
  final box = await _aes.encrypt(
    utf8.encode(plaintext),
    secretKey: dek,
    aad: utf8.encode(aad),
  );
  return (
    ciphertext: b64([...box.cipherText, ...box.mac.bytes]),
    nonce: b64(box.nonce),
    aad: aad,
  );
}

Future<String> decryptItem(
  SecretKey dek,
  String ciphertextB64,
  String nonceB64, {
  String aad = 'item',
}) async {
  final raw = fromB64(ciphertextB64);
  final mac = Mac(raw.sublist(raw.length - 16));
  final ct = raw.sublist(0, raw.length - 16);
  final clear = await _aes.decrypt(
    SecretBox(ct, nonce: fromB64(nonceB64), mac: mac),
    secretKey: dek,
    aad: utf8.encode(aad),
  );
  return utf8.decode(clear);
}

/// Opaque ed25519-length public key for device registration (S7).
String devicePublicKeyB64() => b64(randomBytes(32));
