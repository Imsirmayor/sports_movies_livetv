import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/config.dart';

class SettingsStore {
  SettingsStore(this._prefs, this._secure);

  final SharedPreferences _prefs;
  final FlutterSecureStorage _secure;

  static const _kBaseUrl = 'api_base_url';
  static const _kToken = 'api_token';
  static const _kAddon = 'stremio_addon_url';

  Future<AppConfig> load(AppConfig defaults) async {
    final base = _prefs.getString(_kBaseUrl);
    final token = await _secure.read(key: _kToken);
    final addon = await _secure.read(key: _kAddon);
    return defaults.copyWith(
      apiBaseUrl: (base != null && base.isNotEmpty) ? base : null,
      apiToken: (token != null && token.isNotEmpty) ? token : null,
      stremioAddonUrl: addon,
    );
  }

  Future<void> save({
    required String apiBaseUrl,
    required String apiToken,
    required String stremioAddonUrl,
  }) async {
    await _prefs.setString(_kBaseUrl, apiBaseUrl.trim());
    await _secure.write(key: _kToken, value: apiToken.trim());
    await _secure.write(key: _kAddon, value: stremioAddonUrl.trim());
  }
}
