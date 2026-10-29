import 'dart:async';

import 'package:chewie/chewie.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:video_player/video_player.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';
import '../../core/errors.dart';
import '../../data/api_client.dart';
import '../../data/continue_watching.dart';
import '../../data/models.dart';
import '../../shared/widgets.dart';
import '../ads/preroll.dart';

class PlayerArgs {
  const PlayerArgs({
    required this.sessionId,
    required this.title,
    this.progressId,
    this.progressRoute,
    this.poster,
    this.startAtSeconds = 0,
    this.isLive = false,
  });

  final String sessionId;
  final String title;
  final String? progressId;
  final String? progressRoute;
  final String? poster;
  final double startAtSeconds;
  final bool isLive;
}

class PlayerScreen extends ConsumerStatefulWidget {
  const PlayerScreen({super.key, required this.args});

  final PlayerArgs args;

  @override
  ConsumerState<PlayerScreen> createState() => _PlayerScreenState();
}

class _PlayerScreenState extends ConsumerState<PlayerScreen> {
  VideoPlayerController? _video;
  ChewieController? _chewie;
  Timer? _poll;
  PlaybackSession? _session;
  String? _error;
  bool _stopping = false;
  late final FrankensteinApi _api;

  @override
  void initState() {
    super.initState();
    _api = ref.read(apiClientProvider);
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    try {
      var session = await _api.getPlayback(widget.args.sessionId);
      setState(() => _session = session);

      if (session.isStarting) {
        _poll = Timer.periodic(const Duration(milliseconds: 800), (_) async {
          try {
            session = await _api.getPlayback(widget.args.sessionId);
            if (!mounted) return;
            setState(() => _session = session);
            if (session.isReady) {
              _poll?.cancel();
              await _attachPlayer(session);
            } else if (session.isFailed) {
              _poll?.cancel();
              setState(() {
                _error = session.errorMessage ?? 'Playback failed';
              });
            }
          } catch (e) {
            _poll?.cancel();
            if (mounted) setState(() => _error = userFacingError(e));
          }
        });
      } else if (session.isReady) {
        await _attachPlayer(session);
      } else if (session.isFailed) {
        setState(() => _error = session.errorMessage ?? 'Playback failed');
      }
    } catch (e) {
      if (mounted) setState(() => _error = userFacingError(e));
    }
  }

  Future<void> _attachPlayer(PlaybackSession session) async {
    if (mounted) {
      await showPrerollAd(
        context: context,
        api: _api,
        contentType: widget.args.isLive ? 'sport' : 'vod',
        contentId: widget.args.sessionId,
      );
    }
    if (!mounted) return;

    final url = _api.absolutePlaylistUrl(session.playlistUrl);
    if (url == null) {
      setState(() => _error = 'No playlist URL');
      return;
    }
    final controller = VideoPlayerController.networkUrl(
      Uri.parse(url),
      // Local API playlists need Bearer; public R2 CDN URLs must not.
      httpHeaders: _api.playlistHttpHeaders(url),
    );
    await controller.initialize();
    if (widget.args.startAtSeconds > 0 && !widget.args.isLive) {
      await controller.seekTo(
        Duration(milliseconds: (widget.args.startAtSeconds * 1000).round()),
      );
    }
    final chewie = ChewieController(
      videoPlayerController: controller,
      autoPlay: true,
      looping: false,
      allowFullScreen: true,
      allowMuting: true,
      showControls: true,
      isLive: widget.args.isLive,
      materialProgressColors: ChewieProgressColors(
        playedColor: AppColors.accent,
        handleColor: AppColors.accentStrong,
        bufferedColor: AppColors.bgSubtle,
        backgroundColor: AppColors.border,
      ),
    );
    controller.addListener(_onProgress);
    if (!mounted) return;
    setState(() {
      _video = controller;
      _chewie = chewie;
    });
  }

  void _onProgress() {
    final v = _video;
    if (v == null || !v.value.isInitialized) return;
    final progressId = widget.args.progressId;
    final route = widget.args.progressRoute;
    if (progressId == null || route == null || widget.args.isLive) return;
    final pos = v.value.position.inMilliseconds / 1000.0;
    final dur = v.value.duration.inMilliseconds / 1000.0;
    if (pos < 15) return;
    unawaited(
      ref.read(continueWatchingProvider.notifier).save(
            ContinueWatchEntry(
              id: progressId,
              title: widget.args.title,
              position: pos,
              duration: dur,
              route: route,
              updatedAt: DateTime.now().millisecondsSinceEpoch,
              poster: widget.args.poster,
            ),
          ),
    );
  }

  Future<void> _stop() async {
    if (_stopping) return;
    _stopping = true;
    _poll?.cancel();
    _video?.removeListener(_onProgress);
    try {
      await _api.stopPlayback(widget.args.sessionId);
    } catch (_) {}
    if (mounted) Navigator.of(context).maybePop();
  }

  @override
  void dispose() {
    _poll?.cancel();
    _video?.removeListener(_onProgress);
    _chewie?.dispose();
    _video?.dispose();
    SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
    final sessionId = widget.args.sessionId;
    unawaited(() async {
      try {
        await _api.stopPlayback(sessionId);
      } catch (_) {}
    }());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bgPage,
      appBar: AppBar(
        backgroundColor: AppColors.bgPage,
        title: Row(
          children: [
            if (widget.args.isLive) ...[
              const LiveBadge(),
              const SizedBox(width: 8),
            ],
            Expanded(
              child: Text(
                widget.args.isLive ? 'Live Match Player' : widget.args.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
              ),
            ),
          ],
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: _stop,
        ),
        actions: [
          IconButton(
            tooltip: 'Cast',
            onPressed: () {},
            icon: const Icon(Icons.cast_rounded, size: 22),
          ),
          const Padding(
            padding: EdgeInsets.only(right: 12),
            child: CircleAvatar(
              radius: 14,
              backgroundColor: AppColors.profile,
              child: Icon(Icons.person, size: 16, color: Colors.white),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(child: _buildBody()),
          if (widget.args.isLive && _chewie != null)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
              color: AppColors.bgPanel,
              child: Row(
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: const BoxDecoration(
                      color: AppColors.success,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Text(
                    'SYNC LIVE',
                    style: TextStyle(
                      color: AppColors.success,
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    widget.args.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: AppColors.textMuted,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_error != null) {
      return StateMessage(
        title: 'Playback unavailable',
        message: _error,
        tone: StateTone.error,
        icon: Icons.error_outline,
        action: FilledButton(onPressed: _stop, child: const Text('Go back')),
      );
    }
    if (_chewie != null) {
      return Center(child: Chewie(controller: _chewie!));
    }
    final status = _session?.status ?? 'starting';
    return StateMessage(
      title: 'Preparing stream…',
      message: 'Session $status. Live remux can take up to a couple of minutes.',
      icon: Icons.hourglass_top,
    );
  }
}
