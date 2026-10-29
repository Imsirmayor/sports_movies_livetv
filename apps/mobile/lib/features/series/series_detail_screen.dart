import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';
import '../../core/errors.dart';
import '../../data/models.dart';
import '../../shared/widgets.dart';
import '../player/player_screen.dart';

class SeriesDetailScreen extends ConsumerStatefulWidget {
  const SeriesDetailScreen({super.key, required this.imdbId});

  final String imdbId;

  @override
  ConsumerState<SeriesDetailScreen> createState() => _SeriesDetailScreenState();
}

class _SeriesDetailScreenState extends ConsumerState<SeriesDetailScreen> {
  SeriesMeta? _meta;
  String? _error;
  bool _loading = true;
  int? _season;
  SeriesEpisode? _episode;
  CatalogStreamsResponse? _streams;
  bool _loadingStreams = false;
  bool _starting = false;
  int? _selectedStream;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final meta =
          await ref.read(apiClientProvider).getCatalogSeries(widget.imdbId);
      if (!mounted) return;
      final season = meta.seasons.isNotEmpty ? meta.seasons.first : null;
      final episode = season == null
          ? null
          : meta.episodes.where((e) => e.season == season).firstOrNull;
      setState(() {
        _meta = meta;
        _season = season;
        _episode = episode;
        _loading = false;
      });
      if (episode != null) await _loadStreams(episode);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = userFacingError(e);
        _loading = false;
      });
    }
  }

  Future<void> _loadStreams(SeriesEpisode episode) async {
    setState(() {
      _loadingStreams = true;
      _streams = null;
      _selectedStream = null;
    });
    try {
      final streams = await ref.read(apiClientProvider).listCatalogSeriesStreams(
            imdbId: widget.imdbId,
            season: episode.season,
            episode: episode.episode,
          );
      if (!mounted) return;
      setState(() {
        _streams = streams;
        _selectedStream =
            streams.streams.isNotEmpty ? streams.streams.first.index : null;
        _loadingStreams = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadingStreams = false;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(userFacingError(e))),
        );
      });
    }
  }

  SeriesEpisode? _nextEpisodeAfter(SeriesEpisode episode) {
    final meta = _meta;
    if (meta == null) return null;
    final ordered = [...meta.episodes]
      ..sort((a, b) => a.season != b.season
          ? a.season.compareTo(b.season)
          : a.episode.compareTo(b.episode));
    final idx = ordered.indexWhere(
      (e) => e.season == episode.season && e.episode == episode.episode,
    );
    if (idx < 0 || idx >= ordered.length - 1) return null;
    return ordered[idx + 1];
  }

  Future<void> _preloadNext(SeriesEpisode episode) async {
    final next = _nextEpisodeAfter(episode);
    if (next == null) return;
    await ref.read(apiClientProvider).warmCatalogSeries(
          imdbId: widget.imdbId,
          season: next.season,
          episode: next.episode,
        );
  }

  Future<void> _play() async {
    final meta = _meta;
    final episode = _episode;
    final index = _selectedStream;
    if (meta == null || episode == null || index == null) return;
    setState(() => _starting = true);
    // Kick next-episode warm while this session starts.
    unawaited(_preloadNext(episode));
    try {
      final session =
          await ref.read(apiClientProvider).startCatalogSeriesPlayback(
                imdbId: widget.imdbId,
                season: episode.season,
                episode: episode.episode,
                streamIndex: index,
              );
      if (!mounted) return;
      final progressId =
          'series:${widget.imdbId}:S${episode.season}E${episode.episode}';
      final prior = ref
          .read(continueWatchingProvider)
          .where((e) => e.id == progressId);
      await context.push(
        '/player',
        extra: PlayerArgs(
          sessionId: session.sessionId,
          title: '${meta.name} · S${episode.season}E${episode.episode}',
          progressId: progressId,
          progressRoute: '/series/${widget.imdbId}',
          poster: meta.poster,
          startAtSeconds: prior.isEmpty ? 0 : prior.first.position,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(userFacingError(e))),
      );
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: PulseAppBar(
        showBack: true,
        title: Text(
          _meta?.name ?? 'Series',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null && _meta == null
              ? StateMessage(
                  title: 'Series unavailable',
                  message: _error,
                  tone: StateTone.error,
                  action:
                      FilledButton(onPressed: _load, child: const Text('Retry')),
                )
              : _buildBody(),
    );
  }

  Widget _buildBody() {
    final meta = _meta!;
    final seasons = meta.seasons;
    final episodes = meta.episodes
        .where((e) => _season == null || e.season == _season)
        .toList();
    final streams = _streams?.streams ?? const <CatalogStreamOption>[];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(AppRadii.sm),
              child: SizedBox(
                width: 110,
                height: 165,
                child: meta.poster == null
                    ? Container(
                        color: AppColors.bgElevated,
                        child: const Icon(Icons.tv),
                      )
                    : CachedNetworkImage(
                        imageUrl: meta.poster!,
                        fit: BoxFit.cover,
                      ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    meta.name,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                  if (meta.year != null)
                    Text(meta.year!,
                        style: const TextStyle(color: AppColors.textMuted)),
                  const SizedBox(height: 8),
                  Text(
                    '${meta.seasons.length} seasons · ${meta.episodes.length} episodes',
                    style: const TextStyle(color: AppColors.textMuted),
                  ),
                  const SizedBox(height: 12),
                  PulsePrimaryButton(
                    label: _starting
                        ? 'Starting…'
                        : _episode == null
                            ? 'Select episode'
                            : 'Play S${_episode!.season}E${_episode!.episode}',
                    onPressed: _starting ||
                            _episode == null ||
                            _selectedStream == null ||
                            _loadingStreams
                        ? null
                        : _play,
                    expand: true,
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),
        Text('Season', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        SizedBox(
          height: 40,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: seasons.length,
            separatorBuilder: (_, _) => const SizedBox(width: 8),
            itemBuilder: (context, i) {
              final s = seasons[i];
              final selected = s == _season;
              return ChoiceChip(
                label: Text('S$s'),
                selected: selected,
                onSelected: (_) {
                  final ep =
                      meta.episodes.where((e) => e.season == s).firstOrNull;
                  setState(() {
                    _season = s;
                    _episode = ep;
                  });
                  if (ep != null) _loadStreams(ep);
                },
              );
            },
          ),
        ),
        const SizedBox(height: 16),
        Text('Episodes', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        ...episodes.map((ep) {
          final selected = _episode?.season == ep.season &&
              _episode?.episode == ep.episode;
          return Card(
            color: selected ? AppColors.accentSoft : null,
            child: ListTile(
              selected: selected,
              title: Text('E${ep.episode} · ${ep.name}'),
              subtitle: ep.overview == null || ep.overview!.isEmpty
                  ? null
                  : Text(ep.overview!, maxLines: 2, overflow: TextOverflow.ellipsis),
              onTap: () {
                setState(() => _episode = ep);
                _loadStreams(ep);
              },
            ),
          );
        }),
        const SizedBox(height: 16),
        Text('Streams', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        if (_loadingStreams)
          const Center(child: CircularProgressIndicator())
        else if (_episode == null)
          const Text('Select an episode', style: TextStyle(color: AppColors.textMuted))
        else if (streams.isEmpty)
          const Text('No streams for this episode',
              style: TextStyle(color: AppColors.textMuted))
        else ...[
          ...streams.map((s) {
            final selected = _selectedStream == s.index;
            return Card(
              color: selected ? AppColors.accentSoft : null,
              child: ListTile(
                selected: selected,
                title: Text(s.label.isNotEmpty ? s.label : s.name),
                subtitle: Text('${s.resolution}p · ${s.language}'),
                onTap: () => setState(() => _selectedStream = s.index),
              ),
            );
          }),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: _starting || _selectedStream == null ? null : _play,
            icon: _starting
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.play_arrow),
            label: Text(_starting ? 'Starting…' : 'Watch episode'),
          ),
        ],
      ],
    );
  }
}
