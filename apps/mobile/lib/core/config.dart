/// Runtime API configuration.
///
/// Defaults target the Android emulator loopback to the host machine API.
/// Override with:
///   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8787 \
///               --dart-define=API_TOKEN=your-token
///
/// Physical device: use your LAN IP, e.g. http://192.168.1.20:8787
/// and ensure the API binds beyond loopback (`API_HOST=0.0.0.0`).
class AppConfig {
  const AppConfig({
    required this.apiBaseUrl,
    required this.apiToken,
    this.stremioAddonUrl = '',
    this.maxResolution = 720,
    this.brandName = 'PULSE STREAM',
  });

  final String apiBaseUrl;
  final String apiToken;

  /// Torrentio + RealDebrid addon URL. Movies and series streams are fetched
  /// on the device. The value contains a debrid token, so it stays in secure storage.
  final String stremioAddonUrl;
  final int maxResolution;
  final String brandName;

  static const AppConfig fromEnvironment = AppConfig(
    apiBaseUrl: String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'http://10.0.2.2:8787',
    ),
    apiToken: String.fromEnvironment('API_TOKEN', defaultValue: ''),
    stremioAddonUrl: String.fromEnvironment(
      'STREMIO_ADDON_URL',
      defaultValue: '',
    ),
    maxResolution: int.fromEnvironment('MAX_RESOLUTION', defaultValue: 720),
    brandName: String.fromEnvironment(
      'BRAND_NAME',
      defaultValue: 'PULSE STREAM',
    ),
  );

  Uri get apiRoot {
    final base = apiBaseUrl.replaceAll(RegExp(r'/$'), '');
    return Uri.parse('$base/api');
  }

  bool get hasToken => apiToken.trim().isNotEmpty;

  bool get hasStremioAddon => stremioAddonUrl.trim().isNotEmpty;

  AppConfig copyWith({
    String? apiBaseUrl,
    String? apiToken,
    String? stremioAddonUrl,
    int? maxResolution,
    String? brandName,
  }) {
    return AppConfig(
      apiBaseUrl: apiBaseUrl ?? this.apiBaseUrl,
      apiToken: apiToken ?? this.apiToken,
      stremioAddonUrl: stremioAddonUrl ?? this.stremioAddonUrl,
      maxResolution: maxResolution ?? this.maxResolution,
      brandName: brandName ?? this.brandName,
    );
  }
}
