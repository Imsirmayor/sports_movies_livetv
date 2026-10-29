import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';
import '../../core/errors.dart';
import '../../data/models.dart';
import '../../shared/widgets.dart';
import '../player/player_screen.dart';

class MovieDetailScreen extends ConsumerStatefulWidget {
  const MovieDetailScreen({super.key, required this.imdbId});

  final String imdbId;

  @override
  ConsumerState<MovieDetailScreen> createState() => _MovieDetailScreenState();
}

class _MovieDetailScreenState extends ConsumerState<MovieDetailScreen> {
  CatalogTitle? _title;
  CatalogStreamsResponse? _streams;
  String? _error;
  bool _loading = true;
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
      final api = ref.read(apiClientProvider);
      final title = await api.getCatalogMovie(widget.imdbId);
      if (!mounted) return;
      setState(() {
        _title = title;
        _loading = false;
      });
      await _loadStreams();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = userFacingError(e);
        _loading = false;
      });
    }
  }

  Future<void> _loadStreams() async {
    setState(() => _loadingStreams = true);
    try {
      final streams = await ref
          .read(apiClientProvider)
          .listCatalogMovieStreams(widget.imdbId);
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
        _error = userFacingError(e);
      });
    }
  }

  Future<void> _play() async {
    final title = _title;
    final index = _selectedStream;
    if (title == null || index == null) return;
    setState(() => _starting = true);
    try {
      final session =
          await ref.read(apiClientProvider).startCatalogMoviePlayback(
                imdbId: widget.imdbId,
                streamIndex: index,
              );
      if (!mounted) return;
      final continueItems = ref.read(continueWatchingProvider);
      final prior =
          continueItems.where((e) => e.id == 'movie:${widget.imdbId}');
      final startAt = prior.isEmpty ? 0.0 : prior.first.position;
      await context.push(
        '/player',
        extra: PlayerArgs(
          sessionId: session.sessionId,
          title: title.name,
          progressId: 'movie:${widget.imdbId}',
          progressRoute: '/movies/${widget.imdbId}',
          poster: title.poster,
          startAtSeconds: startAt,
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

  String _sizeLabel(num bytes) {
    if (bytes <= 0) return '—';
    final gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return '${gb.toStringAsFixed(1)} GB';
    final mb = bytes / (1024 * 1024);
    return '${mb.toStringAsFixed(0)} MB';
  }

  @override
  Widget build(BuildContext context) {
    final inList = ref.watch(myListProvider.notifier).contains(widget.imdbId);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: const Text('Movie Player'),
        actions: [
          IconButton(
            tooltip: 'Cast',
            onPressed: () {},
            icon: const Icon(Icons.cast_rounded, size: 22),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: GestureDetector(
              onTap: () => context.push('/settings'),
              child: const CircleAvatar(
                radius: 14,
                backgroundColor: AppColors.profile,
                child: Icon(Icons.person, size: 16, color: Colors.white),
              ),
            ),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null && _title == null
              ? StateMessage(
                  title: 'Movie unavailable',
                  message: _error,
                  tone: StateTone.error,
                  action: FilledButton(
                    onPressed: _load,
                    child: const Text('Retry'),
                  ),
                )
              : _buildBody(inList),
    );
  }

  Widget _buildBody(bool inList) {
    final title = _title!;
    final streams = _streams?.streams ?? const <CatalogStreamOption>[];
    CatalogStreamOption? selected;
    for (final s in streams) {
      if (s.index == _selectedStream) {
        selected = s;
        break;
      }
    }
    selected ??= streams.isNotEmpty ? streams.first : null;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(AppRadii.card),
          child: AspectRatio(
            aspectRatio: 16 / 10,
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (title.poster != null)
                  CachedNetworkImage(
                    imageUrl: title.poster!,
                    fit: BoxFit.cover,
                  )
                else
                  Container(color: AppColors.bgElevated),
                DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.black.withValues(alpha: 0.15),
                        Colors.black.withValues(alpha: 0.85),
                      ],
                    ),
                  ),
                ),
                const Positioned(
                  top: 12,
                  left: 12,
                  child: SoftBadge(
                    label: '4K / HD',
                    color: Colors.black54,
                  ),
                ),
                Center(
                  child: Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: AppColors.accent,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.accent.withValues(alpha: 0.45),
                          blurRadius: 24,
                        ),
                      ],
                    ),
                    child: IconButton(
                      onPressed: streams.isEmpty || _starting ? null : _play,
                      icon: Icon(
                        _starting
                            ? Icons.hourglass_top_rounded
                            : Icons.play_arrow_rounded,
                        size: 40,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 18),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                title.name,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w900,
                    ),
              ),
            ),
            const SoftBadge(
              label: '★ —',
              color: AppColors.bgElevated,
              textColor: AppColors.gold,
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          'Catalog title · ${title.type}',
          style: const TextStyle(color: AppColors.textMuted),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            if (title.year != null)
              SoftBadge(label: title.year!, color: AppColors.bgElevated),
            SoftBadge(
              label: selected != null
                  ? '${selected.resolution}p'
                  : 'HD',
              color: AppColors.bgElevated,
            ),
            if (selected != null)
              SoftBadge(
                label: selected.language.toUpperCase(),
                color: AppColors.bgElevated,
              ),
            SoftBadge(
              label: 'ULTRA HD',
              color: AppColors.bgElevated,
              textColor: AppColors.gold,
            ),
          ],
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: PulsePrimaryButton(
                label: _starting ? 'Starting…' : 'Watch Now',
                onPressed: streams.isEmpty || _starting ? null : _play,
                expand: true,
              ),
            ),
            const SizedBox(width: 10),
            _ActionTile(
              icon: inList
                  ? Icons.bookmark_rounded
                  : Icons.bookmark_border_rounded,
              label: 'My List',
              accent: inList,
              onTap: () async {
                await ref.read(myListProvider.notifier).toggle(
                      id: widget.imdbId,
                      title: title.name,
                      type: 'movie',
                      poster: title.poster,
                      route: '/movies/${widget.imdbId}',
                    );
              },
            ),
            const SizedBox(width: 8),
            _ActionTile(
              icon: Icons.download_rounded,
              label: selected != null
                  ? _sizeLabel(selected.sizeBytes)
                  : 'Download',
              onTap: () {},
            ),
            const SizedBox(width: 8),
            _ActionTile(
              icon: Icons.share_rounded,
              label: 'Share',
              onTap: () {},
            ),
          ],
        ),
        const SizedBox(height: 24),
        Text(
          'Streams',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
              ),
        ),
        const SizedBox(height: 10),
        if (_loadingStreams)
          const Padding(
            padding: EdgeInsets.all(24),
            child: Center(child: CircularProgressIndicator()),
          )
        else if (streams.isEmpty)
          const Text(
            'No streams available for this title.',
            style: TextStyle(color: AppColors.textMuted),
          )
        else
          ...streams.map((s) {
            final isSelected = _selectedStream == s.index;
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Material(
                color: isSelected ? AppColors.accentSoft : AppColors.bgPanel,
                borderRadius: BorderRadius.circular(AppRadii.sm),
                child: InkWell(
                  borderRadius: BorderRadius.circular(AppRadii.sm),
                  onTap: () => setState(() => _selectedStream = s.index),
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      children: [
                        Icon(
                          isSelected
                              ? Icons.check_circle_rounded
                              : Icons.circle_outlined,
                          color: isSelected
                              ? AppColors.accent
                              : AppColors.textMuted,
                          size: 22,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                s.label.isNotEmpty ? s.label : s.name,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                '${s.resolution}p · ${s.language} · ${s.seeders} seeders'
                                '${s.locallyCached ? " · ready" : s.cached ? " · RD+" : ""}',
                                style: const TextStyle(
                                  color: AppColors.textMuted,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Text(
                          _sizeLabel(s.sizeBytes),
                          style: const TextStyle(
                            color: AppColors.gold,
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          }),
      ],
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.accent = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.bgElevated,
      borderRadius: BorderRadius.circular(AppRadii.sm),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadii.sm),
        child: SizedBox(
          width: 64,
          height: 56,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                icon,
                size: 20,
                color: accent ? AppColors.accent : Colors.white,
              ),
              const SizedBox(height: 4),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                  color: accent ? AppColors.accent : AppColors.textMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
