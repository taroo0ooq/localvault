import 'package:local_auth/local_auth.dart';

class BiometricService {
  final _auth = LocalAuthentication();

  Future<bool> get isAvailable async {
    try {
      final can = await _auth.canCheckBiometrics || await _auth.isDeviceSupported();
      final bios = await _auth.getAvailableBiometrics();
      return can && bios.isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  Future<bool> authenticate({String reason = 'Unlock LocalVault'}) async {
    try {
      return await _auth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          biometricOnly: false,
          stickyAuth: true,
        ),
      );
    } catch (_) {
      return false;
    }
  }
}
