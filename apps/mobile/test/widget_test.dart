import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:pulse_stream/app/providers.dart';
import 'package:pulse_stream/data/catalog_client.dart';
import 'package:pulse_stream/data/models.dart';
import 'package:pulse_stream/main.dart';
import 'package:pulse_stream/sports/catalog.dart';
import 'package:pulse_stream/sports/html_client.dart';

class _QuietCatalog extends CatalogClient {
  _QuietCatalog() : super(stremioAddonUrl: '');

  @override
  Future<List<CatalogTitle>> topMovies() async => const [];

  @override
  Future<List<CatalogTitle>> topSeries() async => const [];
}

class _QuietHtml extends HtmlClient {
  @override
  Future<String> getText(String url, {Map<String, String>? headers}) async {
    return '<html></html>';
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('app boots', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          sharedPreferencesProvider.overrideWithValue(prefs),
          catalogClientProvider.overrideWithValue(_QuietCatalog()),
          htmlClientProvider.overrideWithValue(_QuietHtml()),
        ],
        child: const PulseStreamApp(),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Sports'), findsWidgets);
  });
}
