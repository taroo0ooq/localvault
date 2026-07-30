import 'package:flutter_test/flutter_test.dart';
import 'package:localvault_mobile/main.dart';

void main() {
  testWidgets('app loads LocalVault title', (tester) async {
    await tester.pumpWidget(const LocalVaultApp());
    expect(find.text('LocalVault'), findsOneWidget);
    expect(find.textContaining('S7'), findsOneWidget);
  });
}
