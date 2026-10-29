import type { AdNetwork } from "@frankenstein/shared-types";
import type { AdsServiceOptions } from "./service.js";

function env(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw.toLowerCase() === "true" || raw === "1";
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Google sample / test IDs — replace with production units in .env */
const TEST_ADMOB_ANDROID_APP = "ca-app-pub-3940256099942544~3347511713";
const TEST_ADMOB_IOS_APP = "ca-app-pub-3940256099942544~1458002511";
const TEST_ADMOB_INTERSTITIAL_ANDROID = "ca-app-pub-3940256099942544/1033173712";
const TEST_ADMOB_INTERSTITIAL_IOS = "ca-app-pub-3940256099942544/4411468910";
const TEST_ADMOB_BANNER_ANDROID = "ca-app-pub-3940256099942544/6300978111";
const TEST_ADMOB_BANNER_IOS = "ca-app-pub-3940256099942544/2934735716";

export function loadAdsOptionsFromEnv(): AdsServiceOptions {
  const enabled = envBool("ADS_ENABLED", true);
  const prerollEnabled = envBool("ADS_PREROLL_ENABLED", true);
  const skipAfterSec = envInt("ADS_SKIP_AFTER_SEC", 5);

  const priorityRaw = env("ADS_NETWORK_PRIORITY", "admob,applovin,vast,house");
  const networkPriority = priorityRaw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is AdNetwork =>
      s === "admob" || s === "applovin" || s === "vast" || s === "house"
    );

  const admobAndroidApp = env("ADMOB_ANDROID_APP_ID", TEST_ADMOB_ANDROID_APP) || null;
  const admobIosApp = env("ADMOB_IOS_APP_ID", TEST_ADMOB_IOS_APP) || null;
  const admob =
    admobAndroidApp || admobIosApp
      ? {
          androidAppId: admobAndroidApp,
          iosAppId: admobIosApp,
          interstitialUnitIdAndroid:
            env("ADMOB_INTERSTITIAL_ANDROID", TEST_ADMOB_INTERSTITIAL_ANDROID) || null,
          interstitialUnitIdIos:
            env("ADMOB_INTERSTITIAL_IOS", TEST_ADMOB_INTERSTITIAL_IOS) || null,
          rewardedUnitIdAndroid: env("ADMOB_REWARDED_ANDROID", "") || null,
          rewardedUnitIdIos: env("ADMOB_REWARDED_IOS", "") || null,
          bannerUnitIdAndroid: env("ADMOB_BANNER_ANDROID", TEST_ADMOB_BANNER_ANDROID) || null,
          bannerUnitIdIos: env("ADMOB_BANNER_IOS", TEST_ADMOB_BANNER_IOS) || null,
        }
      : null;

  const applovinSdk = env("APPLOVIN_SDK_KEY", "") || null;
  const applovin = applovinSdk
    ? {
        sdkKey: applovinSdk,
        interstitialUnitId: env("APPLOVIN_INTERSTITIAL_UNIT_ID", "") || null,
        bannerUnitId: env("APPLOVIN_BANNER_UNIT_ID", "") || null,
      }
    : null;

  // Google IMA sample single-inline linear tag when unset (web preroll needs a real VAST URL).
  const DEFAULT_VAST_TAG =
    "https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/single_ad_samples&sz=640x480&cust_params=sample_ct%3Dlinear&ciu_szs=300x250%2C728x90&gdfp_req=1&output=vast&unviewed_position_start=1&env=vp&impl=s&correlator=";
  const vastRaw = env("ADS_VAST_TAG_URL", DEFAULT_VAST_TAG);
  const vastTagUrl = vastRaw === "off" || vastRaw === "false" ? null : vastRaw || null;

  return {
    enabled,
    prerollEnabled,
    skipAfterSec,
    networkPriority: networkPriority.length
      ? networkPriority
      : ["admob", "applovin", "vast", "house"],
    admob,
    applovin,
    vastTagUrl,
    house: {
      title: env("ADS_HOUSE_TITLE", "Pulse Stream"),
      body: env(
        "ADS_HOUSE_BODY",
        "Support free streaming — a short message before your show."
      ),
      ctaLabel: env("ADS_HOUSE_CTA_LABEL", "Continue"),
      ctaUrl: env("ADS_HOUSE_CTA_URL", "") || null,
      imageUrl: env("ADS_HOUSE_IMAGE_URL", "") || null,
    },
  };
}
