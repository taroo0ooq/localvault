import 'package:cryptography/cryptography.dart';
import 'package:flutter/material.dart';
import 'package:localvault_mobile/api/vault_client.dart';
import 'package:localvault_mobile/crypto/vault_crypto.dart';
import 'package:localvault_mobile/models/vault_item.dart';
import 'package:localvault_mobile/services/autofill_bridge.dart';
import 'package:localvault_mobile/services/biometric_service.dart';
import 'package:localvault_mobile/services/session_store.dart';
import 'package:localvault_mobile/theme/app_theme.dart';
import 'dart:convert';

enum _Screen { connect, enroll, unlock, vault }

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  final _store = SessionStore();
  final _bio = BiometricService();
  final _autofill = AutofillBridge();

  _Screen _screen = _Screen.connect;
  String _baseUrl = 'http://127.0.0.1:8443';
  String _username = '';
  String _pin = '';
  String _pin2 = '';
  String _token = '';
  String _error = '';
  String _recovery = '';
  bool _busy = false;
  bool _bioAvailable = false;
  SecretKey? _dek;
  List<VaultItem> _items = [];

  final _titleCtrl = TextEditingController();
  final _urlCtrl = TextEditingController();
  final _userCtrl = TextEditingController();
  final _passCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final s = await _store.load();
    final bio = await _bio.isAvailable;
    setState(() {
      _bioAvailable = bio;
      if (s['baseUrl'] != null) _baseUrl = s['baseUrl']!;
      if (s['username'] != null) _username = s['username']!;
      if (s['token'] != null) {
        _token = s['token']!;
        _screen = _Screen.unlock;
      }
    });
  }

  Future<void> _connect() async {
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      await VaultClient(_baseUrl).serverInfo();
      setState(() => _screen = _token.isEmpty ? _Screen.enroll : _Screen.unlock);
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _busy = false);
    }
  }

  Future<void> _register() async {
    if (!isValidUsername(_username) || _pin.length < 6 || _pin != _pin2) return;
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      // Optional biometrics enroll confirmation
      if (_bioAvailable) {
        await _bio.authenticate(reason: 'Confirm biometrics enrollment for LocalVault');
      }
      final mat = await enrollVaultCrypto(_pin);
      final reg = await VaultClient(_baseUrl).register(
        username: _username,
        deviceName: 'mobile',
        devicePublicKey: devicePublicKeyB64(),
        kdfParamsJson: mat.kdfParamsJson,
        wrappedDekPin: mat.wrappedDekPin,
        wrappedDekRecovery: mat.wrappedDekRecovery,
      );
      _token = reg['session_token'] as String;
      await _store.save(
        baseUrl: _baseUrl,
        username: reg['username'] as String,
        token: _token,
        deviceId: reg['device_id'] as String?,
      );
      setState(() {
        _recovery = mat.recoveryPassphrase;
        _dek = mat.dek;
        _screen = _Screen.vault;
      });
      await _refreshItems();
      await _autofill.notifyVaultUnlocked();
      await _publishAutofillIndex();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _busy = false);
    }
  }

  Future<void> _unlock() async {
    setState(() {
      _busy = true;
      _error = '';
    });
    try {
      if (_bioAvailable) {
        final ok = await _bio.authenticate(reason: 'Unlock LocalVault');
        if (!ok) {
          setState(() => _error = 'Biometric authentication cancelled');
          return;
        }
      }
      final client = VaultClient(_baseUrl, token: _token);
      final meta = await client.vaultMeta();
      final key = await unlockWithPin(
        _pin,
        meta['kdf_params_json'] as String,
        meta['wrapped_dek_pin'] as String,
      );
      setState(() {
        _dek = key;
        _screen = _Screen.vault;
      });
      await _refreshItems();
      await _autofill.notifyVaultUnlocked();
      await _publishAutofillIndex();
    } catch (e) {
      setState(() => _error = 'Unlock failed');
    } finally {
      setState(() => _busy = false);
    }
  }

  Future<void> _refreshItems() async {
    if (_dek == null) return;
    final client = VaultClient(_baseUrl, token: _token);
    final raw = await client.listItems();
    final out = <VaultItem>[];
    for (final it in raw) {
      try {
        final plain = await decryptItem(
          _dek!,
          it['ciphertext'] as String,
          it['nonce'] as String,
          aad: (it['aad'] as String?) ?? 'item',
        );
        out.add(VaultItem.fromPlain(it['id'] as String, jsonDecode(plain) as Map<String, dynamic>));
      } catch (_) {}
    }
    setState(() => _items = out);
  }

  Future<void> _publishAutofillIndex() async {
    final entries = _items
        .map((e) => {
              'id': e.id,
              'title': e.title,
              'url': e.url,
              'username': e.username,
            })
        .toList();
    await _autofill.publishDatasetIndex(entries);
  }

  Future<void> _addItem() async {
    if (_dek == null || _passCtrl.text.isEmpty) return;
    setState(() => _busy = true);
    try {
      final item = {
        'title': _titleCtrl.text,
        'url': _urlCtrl.text,
        'username': _userCtrl.text,
        'password': _passCtrl.text,
      };
      final enc = await encryptItem(_dek!, jsonEncode(item));
      final client = VaultClient(_baseUrl, token: _token);
      await client.createItem(
        ciphertext: enc.ciphertext,
        nonce: enc.nonce,
        aad: enc.aad,
      );
      _titleCtrl.clear();
      _urlCtrl.clear();
      _userCtrl.clear();
      _passCtrl.clear();
      await _refreshItems();
      await _publishAutofillIndex();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      setState(() => _busy = false);
    }
  }

  Future<void> _lock() async {
    setState(() {
      _dek = null;
      _items = [];
      _pin = '';
      _screen = _Screen.unlock;
    });
    await _autofill.notifyVaultLocked();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('LocalVault'),
        actions: [
          if (_dek != null)
            IconButton(onPressed: _lock, icon: const Icon(Icons.lock_outline)),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
              'S7 · mobile · ${_bioAvailable ? "biometrics ready" : "PIN only"}',
              style: const TextStyle(color: AppTheme.muted, fontSize: 12),
            ),
            const SizedBox(height: 12),
            if (_error.isNotEmpty)
              Container(
                padding: const EdgeInsets.all(12),
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: AppTheme.danger.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppTheme.danger.withValues(alpha: 0.4)),
                ),
                child: Text(_error, style: const TextStyle(color: AppTheme.danger)),
              ),
            if (_screen == _Screen.connect) ..._connectView(),
            if (_screen == _Screen.enroll) ..._enrollView(),
            if (_screen == _Screen.unlock) ..._unlockView(),
            if (_screen == _Screen.vault) ..._vaultView(),
          ],
        ),
      ),
    );
  }

  List<Widget> _connectView() => [
        const Text('Connect to vault host', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        const Text('LAN or Cloudflare/ngrok HTTPS URL', style: TextStyle(color: AppTheme.muted)),
        const SizedBox(height: 12),
        TextField(
          decoration: const InputDecoration(labelText: 'Vault URL'),
          controller: TextEditingController(text: _baseUrl)
            ..selection = TextSelection.collapsed(offset: _baseUrl.length),
          onChanged: (v) => _baseUrl = v,
        ),
        const SizedBox(height: 12),
        ElevatedButton(
          onPressed: _busy ? null : _connect,
          child: Text(_busy ? 'Connecting…' : 'Connect'),
        ),
      ];

  List<Widget> _enrollView() => [
        const Text('Register', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        const Text('username → PIN → recovery', style: TextStyle(color: AppTheme.primary, fontSize: 12)),
        const SizedBox(height: 12),
        TextField(
          decoration: const InputDecoration(labelText: 'Username'),
          onChanged: (v) => _username = v.toLowerCase(),
        ),
        const SizedBox(height: 8),
        TextField(
          decoration: const InputDecoration(labelText: 'PIN (min 6 digits)'),
          obscureText: true,
          keyboardType: TextInputType.number,
          onChanged: (v) => _pin = v,
        ),
        const SizedBox(height: 8),
        TextField(
          decoration: const InputDecoration(labelText: 'Confirm PIN'),
          obscureText: true,
          keyboardType: TextInputType.number,
          onChanged: (v) => _pin2 = v,
        ),
        const SizedBox(height: 12),
        ElevatedButton(
          onPressed: _busy ? null : _register,
          child: Text(_busy ? 'Registering…' : 'Create account'),
        ),
        if (_recovery.isNotEmpty) ...[
          const SizedBox(height: 12),
          SelectableText('Recovery: $_recovery', style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
        ],
        TextButton(
          onPressed: () => setState(() => _screen = _Screen.unlock),
          child: const Text('Already registered? Unlock'),
        ),
      ];

  List<Widget> _unlockView() => [
        const Text('Unlock', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
        const SizedBox(height: 12),
        TextField(
          decoration: const InputDecoration(labelText: 'Username'),
          controller: TextEditingController(text: _username),
          onChanged: (v) => _username = v,
        ),
        const SizedBox(height: 8),
        TextField(
          decoration: const InputDecoration(labelText: 'Session token'),
          obscureText: true,
          controller: TextEditingController(text: _token),
          onChanged: (v) => _token = v,
        ),
        const SizedBox(height: 8),
        TextField(
          decoration: const InputDecoration(labelText: 'PIN'),
          obscureText: true,
          keyboardType: TextInputType.number,
          onChanged: (v) => _pin = v,
        ),
        const SizedBox(height: 12),
        ElevatedButton(
          onPressed: _busy ? null : _unlock,
          child: Text(_busy ? 'Unlocking…' : (_bioAvailable ? 'Biometrics + PIN unlock' : 'Unlock with PIN')),
        ),
        TextButton(
          onPressed: () => setState(() => _screen = _Screen.enroll),
          child: const Text('Create new account'),
        ),
      ];

  List<Widget> _vaultView() => [
        Text('Vault · @$_username', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
        if (_recovery.isNotEmpty) ...[
          const SizedBox(height: 8),
          SelectableText('Save recovery offline: $_recovery',
              style: const TextStyle(color: AppTheme.primary, fontSize: 12)),
        ],
        const SizedBox(height: 12),
        TextField(controller: _titleCtrl, decoration: const InputDecoration(labelText: 'Title')),
        const SizedBox(height: 8),
        TextField(controller: _urlCtrl, decoration: const InputDecoration(labelText: 'URL')),
        const SizedBox(height: 8),
        TextField(controller: _userCtrl, decoration: const InputDecoration(labelText: 'Username')),
        const SizedBox(height: 8),
        TextField(controller: _passCtrl, decoration: const InputDecoration(labelText: 'Password'), obscureText: true),
        const SizedBox(height: 12),
        ElevatedButton(onPressed: _busy ? null : _addItem, child: const Text('Save encrypted')),
        const SizedBox(height: 16),
        ..._items.map(
          (it) => Card(
            color: AppTheme.surface,
            child: ListTile(
              title: Text(it.title.isEmpty ? it.url : it.title),
              subtitle: Text(it.username, style: const TextStyle(color: AppTheme.muted)),
            ),
          ),
        ),
        if (_items.isEmpty)
          const Padding(
            padding: EdgeInsets.all(24),
            child: Text('No items yet', textAlign: TextAlign.center, style: TextStyle(color: AppTheme.muted)),
          ),
      ];
}
