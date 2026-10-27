import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';

import '../../app/theme.dart';
import '../../data/ads.dart';
import '../../data/api_client.dart';
import '../../shared/widgets.dart';

/// Shows a pre-roll (AdMob interstitial or house fallback) then continues.
Future<void> showPrerollAd({
  required BuildContext context,
  required FrankensteinApi api,
  String contentType = 'vod',
  String? contentId,
}) async {
  final platform = Platform.isIOS ? 'ios' : 'android';
  AdsPrerollDecision decision;
  try {
    decision = await api.requestPreroll(
      platform: platform,
      contentType: contentType,
      contentId: contentId,
    );
  } catch (_) {
    return;
  }
  if (!decision.show) return;
  if (!context.mounted) return;

  unawaited(
    api.trackAdEvent(
      decisionId: decision.decisionId,
      event: 'impression',
      network: decision.network,
      platform: platform,
    ),
  );

  if (decision.network == 'admob') {
    final rewardedId = decision.admobRewardedUnitId;
    if (rewardedId != null && rewardedId.isNotEmpty) {
      final shown = await _showAdMobRewarded(
        unitId: rewardedId,
        decisionId: decision.decisionId,
        api: api,
        platform: platform,
      );
      if (shown) return;
    }
    final interstitialId = decision.admobInterstitialUnitId;
    if (interstitialId != null && interstitialId.isNotEmpty) {
      final shown = await _showAdMobInterstitial(
        unitId: interstitialId,
        decisionId: decision.decisionId,
        api: api,
        platform: platform,
      );
      if (shown) return;
    }
  }

  if (!context.mounted) return;
  await showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (ctx) => _HousePrerollDialog(
      decision: decision,
      api: api,
      platform: platform,
    ),
  );
}

Future<bool> _showAdMobRewarded({
  required String unitId,
  required String decisionId,
  required FrankensteinApi api,
  required String platform,
}) async {
  final completer = Completer<bool>();
  RewardedAd? ad;

  await RewardedAd.load(
    adUnitId: unitId,
    request: const AdRequest(),
    rewardedAdLoadCallback: RewardedAdLoadCallback(
      onAdLoaded: (loaded) {
        ad = loaded;
        loaded.fullScreenContentCallback = FullScreenContentCallback(
          onAdShowedFullScreenContent: (_) {
            unawaited(
              api.trackAdEvent(
                decisionId: decisionId,
                event: 'start',
                network: 'admob',
                platform: platform,
              ),
            );
          },
          onAdDismissedFullScreenContent: (a) {
            a.dispose();
            unawaited(
              api.trackAdEvent(
                decisionId: decisionId,
                event: 'complete',
                network: 'admob',
                platform: platform,
              ),
            );
            if (!completer.isCompleted) completer.complete(true);
          },
          onAdFailedToShowFullScreenContent: (a, err) {
            a.dispose();
            unawaited(
              api.trackAdEvent(
                decisionId: decisionId,
                event: 'error',
                network: 'admob',
                platform: platform,
                message: err.message,
              ),
            );
            if (!completer.isCompleted) completer.complete(false);
          },
        );
        loaded.show(
          onUserEarnedReward: (ad, reward) {
            // Unlock playback after reward; dismiss handled in fullScreen callback.
          },
        );
      },
      onAdFailedToLoad: (err) {
        unawaited(
          api.trackAdEvent(
            decisionId: decisionId,
            event: 'error',
            network: 'admob',
            platform: platform,
            message: err.message,
          ),
        );
        if (!completer.isCompleted) completer.complete(false);
      },
    ),
  );

  return completer.future.timeout(
    const Duration(seconds: 25),
    onTimeout: () {
      ad?.dispose();
      return false;
    },
  );
}

Future<bool> _showAdMobInterstitial({
  required String unitId,
  required String decisionId,
  required FrankensteinApi api,
  required String platform,
}) async {
  final completer = Completer<bool>();
  InterstitialAd? ad;

  await InterstitialAd.load(
    adUnitId: unitId,
    request: const AdRequest(),
    adLoadCallback: InterstitialAdLoadCallback(
      onAdLoaded: (loaded) {
        ad = loaded;
        loaded.fullScreenContentCallback = FullScreenContentCallback(
          onAdShowedFullScreenContent: (_) {
            unawaited(
              api.trackAdEvent(
                decisionId: decisionId,
                event: 'start',
                network: 'admob',
                platform: platform,
              ),
            );
          },
          onAdDismissedFullScreenContent: (a) {
            a.dispose();
            unawaited(
              api.trackAdEvent(
                decisionId: decisionId,
                event: 'complete',
                network: 'admob',
                platform: platform,
              ),
            );
            if (!completer.isCompleted) completer.complete(true);
          },
          onAdFailedToShowFullScreenContent: (a, err) {
            a.dispose();
            unawaited(
              api.trackAdEvent(
                decisionId: decisionId,
                event: 'error',
                network: 'admob',
                platform: platform,
                message: err.message,
              ),
            );
            if (!completer.isCompleted) completer.complete(false);
          },
        );
        loaded.show();
      },
      onAdFailedToLoad: (err) {
        unawaited(
          api.trackAdEvent(
            decisionId: decisionId,
            event: 'error',
            network: 'admob',
            platform: platform,
            message: err.message,
          ),
        );
        if (!completer.isCompleted) completer.complete(false);
      },
    ),
  );

  return completer.future.timeout(
    const Duration(seconds: 20),
    onTimeout: () {
      ad?.dispose();
      return false;
    },
  );
}

class _HousePrerollDialog extends StatefulWidget {
  const _HousePrerollDialog({
    required this.decision,
    required this.api,
    required this.platform,
  });

  final AdsPrerollDecision decision;
  final FrankensteinApi api;
  final String platform;

  @override
  State<_HousePrerollDialog> createState() => _HousePrerollDialogState();
}

class _HousePrerollDialogState extends State<_HousePrerollDialog> {
  late int _left;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _left = widget.decision.skipAfterSec;
    if (_left <= 0) {
      // Unlock immediately; auto-continue next frame so a failed AdMob load
      // never leaves a permanent modal with no dismiss path.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _continue(skipped: false);
      });
      return;
    }
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      if (_left <= 1) {
        t.cancel();
        setState(() => _left = 0);
        _continue(skipped: false);
      } else {
        setState(() => _left -= 1);
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _continue({required bool skipped}) {
    unawaited(
      widget.api.trackAdEvent(
        decisionId: widget.decision.decisionId,
        event: skipped ? 'skip' : 'complete',
        network: widget.decision.network ?? 'house',
        platform: widget.platform,
      ),
    );
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final house = widget.decision.house;
    final canSkip = _left <= 0;

    return Dialog(
      backgroundColor: AppColors.bgPanel,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadii.card),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                const SoftBadge(label: 'AD', color: AppColors.accent),
                const Spacer(),
                IconButton(
                  tooltip: canSkip ? 'Close' : 'Skip in ${_left}s',
                  onPressed: canSkip ? () => _continue(skipped: true) : null,
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                gradient: const LinearGradient(
                  colors: [Color(0xFF4A90E2), Color(0xFF7B61FF)],
                ),
              ),
              child: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 36),
            ),
            const SizedBox(height: 14),
            Text(
              house?.title ?? 'Advertisement',
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18),
            ),
            const SizedBox(height: 8),
            Text(
              house?.body ?? 'Sponsored message before playback.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.textMuted),
            ),
            const SizedBox(height: 18),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: canSkip ? () => _continue(skipped: true) : null,
                child: Text(
                  canSkip
                      ? (house?.ctaLabel ?? 'Continue')
                      : 'Continue in ${_left}s',
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
