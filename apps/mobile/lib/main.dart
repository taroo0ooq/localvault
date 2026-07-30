import 'package:flutter/material.dart';
import 'package:localvault_mobile/screens/home_shell.dart';
import 'package:localvault_mobile/theme/app_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const LocalVaultApp());
}

class LocalVaultApp extends StatelessWidget {
  const LocalVaultApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'LocalVault',
      theme: AppTheme.dark(),
      home: const HomeShell(),
      debugShowCheckedModeBanner: false,
    );
  }
}
