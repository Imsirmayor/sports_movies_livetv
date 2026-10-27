import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/config.dart';
import '../data/api_client.dart';
import '../data/continue_watching.dart';
import '../data/settings_store.dart';

final sharedPreferencesProvider = Provider<SharedPreferences>((ref) {
  throw UnimplementedError('SharedPreferences must be overridden in main()');
});

final settingsStoreProvider = Provider<SettingsStore>((ref) {
  return SettingsStore(
    ref.watch(sharedPreferencesProvider),
    const FlutterSecureStorage(),
  );
});

final appConfigProvider =
    NotifierProvider<AppConfigNotifier, AppConfig>(AppConfigNotifier.new);

class AppConfigNotifier extends Notifier<AppConfig> {
  @override
  AppConfig build() => AppConfig.fromEnvironment;

  Future<void> loadPersisted() async {
    final store = ref.read(settingsStoreProvider);
    state = await store.load(AppConfig.fromEnvironment);
  }

  Future<void> update({
    required String apiBaseUrl,
    required String apiToken,
  }) async {
    final store = ref.read(settingsStoreProvider);
    await store.save(apiBaseUrl: apiBaseUrl, apiToken: apiToken);
    state = state.copyWith(apiBaseUrl: apiBaseUrl, apiToken: apiToken);
  }
}

final apiClientProvider = Provider<FrankensteinApi>((ref) {
  return FrankensteinApi(ref.watch(appConfigProvider));
});

final continueWatchingStoreProvider = Provider<ContinueWatchingStore>((ref) {
  return ContinueWatchingStore(ref.watch(sharedPreferencesProvider));
});

final myListStoreProvider = Provider<MyListStore>((ref) {
  return MyListStore(ref.watch(sharedPreferencesProvider));
});

final continueWatchingProvider =
    NotifierProvider<ContinueWatchingNotifier, List<ContinueWatchEntry>>(
  ContinueWatchingNotifier.new,
);

class ContinueWatchingNotifier extends Notifier<List<ContinueWatchEntry>> {
  @override
  List<ContinueWatchEntry> build() {
    return ref.watch(continueWatchingStoreProvider).list();
  }

  void refresh() {
    state = ref.read(continueWatchingStoreProvider).list();
  }

  Future<void> save(ContinueWatchEntry entry) async {
    await ref.read(continueWatchingStoreProvider).save(entry);
    refresh();
  }
}

final myListProvider =
    NotifierProvider<MyListNotifier, List<Map<String, dynamic>>>(
  MyListNotifier.new,
);

class MyListNotifier extends Notifier<List<Map<String, dynamic>>> {
  @override
  List<Map<String, dynamic>> build() {
    return ref.watch(myListStoreProvider).list();
  }

  void refresh() {
    state = ref.read(myListStoreProvider).list();
  }

  Future<void> toggle({
    required String id,
    required String title,
    required String type,
    String? poster,
    required String route,
  }) async {
    await ref.read(myListStoreProvider).toggle(
          id: id,
          title: title,
          type: type,
          poster: poster,
          route: route,
        );
    refresh();
  }

  bool contains(String id) => state.any((e) => e['id'] == id);
}
