class AdsHouseCreative {
  AdsHouseCreative({
    required this.title,
    required this.body,
    required this.ctaLabel,
    this.ctaUrl,
    this.imageUrl,
  });

  final String title;
  final String body;
  final String ctaLabel;
  final String? ctaUrl;
  final String? imageUrl;

  factory AdsHouseCreative.fromJson(Map<String, dynamic> json) {
    return AdsHouseCreative(
      title: json['title'] as String? ?? 'Ad',
      body: json['body'] as String? ?? '',
      ctaLabel: json['ctaLabel'] as String? ?? 'Continue',
      ctaUrl: json['ctaUrl'] as String?,
      imageUrl: json['imageUrl'] as String?,
    );
  }
}

class AdsPrerollDecision {
  AdsPrerollDecision({
    required this.show,
    this.network,
    required this.skipAfterSec,
    this.admobInterstitialUnitId,
    this.admobRewardedUnitId,
    this.applovinInterstitialUnitId,
    this.vastTagUrl,
    this.house,
    required this.decisionId,
  });

  final bool show;
  final String? network;
  final int skipAfterSec;
  final String? admobInterstitialUnitId;
  final String? admobRewardedUnitId;
  final String? applovinInterstitialUnitId;
  final String? vastTagUrl;
  final AdsHouseCreative? house;
  final String decisionId;

  factory AdsPrerollDecision.fromJson(Map<String, dynamic> json) {
    return AdsPrerollDecision(
      show: json['show'] as bool? ?? false,
      network: json['network'] as String?,
      skipAfterSec: (json['skipAfterSec'] as num?)?.toInt() ?? 5,
      admobInterstitialUnitId: json['admobInterstitialUnitId'] as String?,
      admobRewardedUnitId: json['admobRewardedUnitId'] as String?,
      applovinInterstitialUnitId: json['applovinInterstitialUnitId'] as String?,
      vastTagUrl: json['vastTagUrl'] as String?,
      house: json['house'] is Map<String, dynamic>
          ? AdsHouseCreative.fromJson(json['house'] as Map<String, dynamic>)
          : null,
      decisionId: json['decisionId'] as String? ?? '',
    );
  }
}

class AdsConfig {
  AdsConfig({
    required this.enabled,
    required this.prerollEnabled,
    required this.skipAfterSec,
    this.admobAndroidAppId,
    this.admobIosAppId,
  });

  final bool enabled;
  final bool prerollEnabled;
  final int skipAfterSec;
  final String? admobAndroidAppId;
  final String? admobIosAppId;

  factory AdsConfig.fromJson(Map<String, dynamic> json) {
    final admob = json['admob'];
    return AdsConfig(
      enabled: json['enabled'] as bool? ?? false,
      prerollEnabled: json['prerollEnabled'] as bool? ?? false,
      skipAfterSec: (json['skipAfterSec'] as num?)?.toInt() ?? 5,
      admobAndroidAppId: admob is Map ? admob['androidAppId'] as String? : null,
      admobIosAppId: admob is Map ? admob['iosAppId'] as String? : null,
    );
  }
}
