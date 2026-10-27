import { randomUUID } from "node:crypto";
import type {
  AdsConfig,
  AdsPrerollDecision,
  AdsPrerollRequest,
  AdNetwork,
} from "@frankenstein/shared-types";
import { createLogger } from "@frankenstein/media-worker";

const log = createLogger("Ads");

export type AdsServiceOptions = {
  enabled: boolean;
  prerollEnabled: boolean;
  skipAfterSec: number;
  /** Prefer admob → applovin → vast → house. */
  networkPriority: AdNetwork[];
  admob: AdsConfig["admob"];
  applovin: AdsConfig["applovin"];
  vastTagUrl: string | null;
  house: NonNullable<AdsConfig["house"]>;
};

/**
 * Ad decisioning for Pulse clients.
 * Returns unit IDs / VAST tags from env — SDKs run on device/browser.
 */
export class AdsService {
  private readonly opts: AdsServiceOptions;

  constructor(opts: AdsServiceOptions) {
    this.opts = opts;
  }

  getConfig(): AdsConfig {
    const networks = this.opts.networkPriority.filter((n) => {
      if (n === "admob") return Boolean(this.opts.admob);
      if (n === "applovin") return Boolean(this.opts.applovin?.sdkKey);
      if (n === "vast") return Boolean(this.opts.vastTagUrl);
      if (n === "house") return true;
      return false;
    });

    return {
      enabled: this.opts.enabled,
      prerollEnabled: this.opts.enabled && this.opts.prerollEnabled,
      skipAfterSec: this.opts.skipAfterSec,
      networks,
      admob: this.opts.admob,
      applovin: this.opts.applovin,
      vastTagUrl: this.opts.vastTagUrl,
      house: this.opts.house,
    };
  }

  decidePreroll(req: AdsPrerollRequest): AdsPrerollDecision {
    const decisionId = randomUUID();
    const base = {
      placement: "preroll" as const,
      skipAfterSec: this.opts.skipAfterSec,
      admobInterstitialUnitId: null as string | null,
      admobRewardedUnitId: null as string | null,
      applovinInterstitialUnitId: null as string | null,
      vastTagUrl: null as string | null,
      house: this.opts.house,
      decisionId,
    };

    if (!this.opts.enabled || !this.opts.prerollEnabled) {
      return { ...base, show: false, network: null, house: null };
    }

    for (const network of this.opts.networkPriority) {
      if (network === "admob" && (req.platform === "android" || req.platform === "ios")) {
        const rewarded =
          req.platform === "ios"
            ? this.opts.admob?.rewardedUnitIdIos
            : this.opts.admob?.rewardedUnitIdAndroid;
        const interstitial =
          req.platform === "ios"
            ? this.opts.admob?.interstitialUnitIdIos
            : this.opts.admob?.interstitialUnitIdAndroid;
        if (rewarded || interstitial) {
          log.info(
            `preroll decision=${decisionId} network=admob platform=${req.platform}` +
              ` format=${rewarded ? "rewarded" : "interstitial"}`
          );
          return {
            ...base,
            show: true,
            network: "admob",
            admobRewardedUnitId: rewarded ?? null,
            admobInterstitialUnitId: rewarded ? null : interstitial ?? null,
          };
        }
      }

      if (network === "applovin" && this.opts.applovin?.interstitialUnitId) {
        if (req.platform === "android" || req.platform === "ios") {
          log.info(`preroll decision=${decisionId} network=applovin platform=${req.platform}`);
          return {
            ...base,
            show: true,
            network: "applovin",
            applovinInterstitialUnitId: this.opts.applovin.interstitialUnitId,
          };
        }
      }

      if (network === "vast" && req.platform === "web" && this.opts.vastTagUrl) {
        log.info(`preroll decision=${decisionId} network=vast platform=web`);
        return {
          ...base,
          show: true,
          network: "vast",
          vastTagUrl: this.opts.vastTagUrl,
        };
      }

      if (network === "house") {
        log.info(`preroll decision=${decisionId} network=house platform=${req.platform}`);
        return {
          ...base,
          show: true,
          network: "house",
        };
      }
    }

    return { ...base, show: false, network: null, house: null };
  }

  trackEvent(input: {
    decisionId: string;
    event: string;
    network?: string;
    platform?: string;
    message?: string;
  }): void {
    log.info(
      `ad_event decision=${input.decisionId} event=${input.event}` +
        `${input.network ? ` network=${input.network}` : ""}` +
        `${input.platform ? ` platform=${input.platform}` : ""}` +
        `${input.message ? ` msg=${input.message}` : ""}`
    );
  }
}
