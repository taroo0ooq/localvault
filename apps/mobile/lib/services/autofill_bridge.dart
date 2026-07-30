import 'package:flutter/services.dart';

/// Bridge to Android AutofillService / iOS Credential Provider (REQ-007).
class AutofillBridge {
  static const _channel = MethodChannel('com.localvault.mobile/autofill');

  /// Publish a lightweight metadata index for OS autofill (never plaintext passwords
  /// at rest outside encrypted vault blobs). Passwords returned only after PIN/bio gate.
  Future<void> publishDatasetIndex(List<Map<String, String>> entries) async {
    try {
      await _channel.invokeMethod('publishDatasetIndex', {'entries': entries});
    } on MissingPluginException {
      // Host platform not available (tests / desktop)
    }
  }

  Future<void> notifyVaultUnlocked() async {
    try {
      await _channel.invokeMethod('notifyVaultUnlocked');
    } on MissingPluginException {
      // ignore
    }
  }

  Future<void> notifyVaultLocked() async {
    try {
      await _channel.invokeMethod('notifyVaultLocked');
    } on MissingPluginException {
      // ignore
    }
  }
}
