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
    this.brandName = 'PULSE STREAM',
  });

  final String apiBaseUrl;
  final String apiToken;
  final String brandName;

  static const AppConfig fromEnvironment = AppConfig(
    apiBaseUrl: String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: 'http://10.0.2.2:8787',
    ),
    apiToken: String.fromEnvironment('API_TOKEN', defaultValue: ''),
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

  AppConfig copyWith({
    String? apiBaseUrl,
    String? apiToken,
    String? brandName,
  }) {
    return AppConfig(
      apiBaseUrl: apiBaseUrl ?? this.apiBaseUrl,
      apiToken: apiToken ?? this.apiToken,
      brandName: brandName ?? this.brandName,
    );
  }
}
