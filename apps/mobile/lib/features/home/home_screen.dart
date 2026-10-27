import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';
import '../../core/errors.dart';
import '../../data/continue_watching.dart';
import '../../data/models.dart';
import '../../shared/countdown.dart';
import '../../shared/widgets.dart';

final _homeBootstrapProvider = FutureProvider<_HomeData>((ref) async {
  final api = ref.watch(apiClientProvider);
  List<SportEvent> live = const [];
  List<SportEvent> upcoming = const [];
  List<CatalogTitle> movies = const [];
  List<CatalogTitle> series = const [];

  if (ref.read(appConfigProvider).hasToken) {
    try {
      live = (await api.searchSportsEvents(status: 'live')).events;
    } catch (_) {}
    try {
      upcoming = (await api.searchSportsEvents(status: 'upcoming')).events;
    } catch (_) {}
    try {
      movies = (await api.listCatalogMovies()).items;
    } catch (_) {}
    try {
      series = (await api.listCatalogSeries()).items;
    } catch (_) {}
  }

  return _HomeData(
    live: live,
    upcoming: upcoming,
    movies: movies,
    series: series,
  );
});

class _HomeData {
  _HomeData({
    required this.live,
    required this.upcoming,
    required this.movies,
    required this.series,
  });

  final List<SportEvent> live;
  final List<SportEvent> upcoming;
  final List<CatalogTitle> movies;
  final List<CatalogTitle> series;
}

sealed class _HeroSlide {
  const _HeroSlide();
}

class _HeroSport extends _HeroSlide {
  const _HeroSport(this.event);
  final SportEvent event;
}

class _HeroCatalog extends _HeroSlide {
  const _HeroCatalog(this.item, {required this.isSeries});
  final CatalogTitle item;
  final bool isSeries;
}

const _filterLabels = [
  'All Channels',
  'Live Sports',
  'Documentaries',
  'Trending Series',
  'Originals & Docs',
  '4K Remasters',
];

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  int _chip = 0;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_homeBootstrapProvider);
    final continueWatching = ref.watch(continueWatchingProvider);

    return Scaffold(
      appBar: PulseAppBar(
        onSearch: () => context.push('/search'),
        onProfile: () => context.push('/settings'),
      ),
      body: RefreshIndicator(
        color: AppColors.accent,
        onRefresh: () async {
          ref.invalidate(_homeBootstrapProvider);
          ref.read(continueWatchingProvider.notifier).refresh();
        },
        child: CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: async.when(
                loading: () => const Padding(
                  padding: EdgeInsets.all(48),
                  child: Center(child: CircularProgressIndicator()),
                ),
                error: (e, _) => StateMessage(
                  title: 'Unable to load home',
                  message: userFacingError(e),
                  tone: StateTone.error,
                  action: FilledButton(
                    onPressed: () => ref.invalidate(_homeBootstrapProvider),
                    child: const Text('Retry'),
                  ),
                ),
                data: (data) => _HomeBody(
                  data: data,
                  continueWatching: continueWatching,
                  chip: _chip,
                  onChip: (i) => setState(() => _chip = i),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HomeBody extends ConsumerWidget {
  const _HomeBody({
    required this.data,
    required this.continueWatching,
    required this.chip,
    required this.onChip,
  });

  final _HomeData data;
  final List<ContinueWatchEntry> continueWatching;
  final int chip;
  final ValueChanged<int> onChip;

  List<_HeroSlide> get _slides {
    final out = <_HeroSlide>[];
    for (final e in data.live.take(4)) {
      out.add(_HeroSport(e));
    }
    for (final m in data.movies.take(3)) {
      out.add(_HeroCatalog(m, isSeries: false));
    }
    for (final s in data.series.take(2)) {
      out.add(_HeroCatalog(s, isSeries: true));
    }
    if (out.isEmpty) {
      for (final e in data.upcoming.take(3)) {
        out.add(_HeroSport(e));
      }
    }
    return out;
  }

  bool get _showSports => chip == 0 || chip == 1;
  bool get _showMovies => chip == 0 || chip == 2 || chip == 5;
  bool get _showSeries => chip == 0 || chip == 3 || chip == 4;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final slides = _slides;
    final schedule = data.upcoming.take(6).toList();
    final trending = data.movies.take(6).toList();
    final originals = data.series.take(10).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _HeroBanner(
          slides: slides,
          onAddToList: (id, title, type, route) async {
            final wasIn = ref.read(myListProvider.notifier).contains(id);
            await ref.read(myListProvider.notifier).toggle(
                  id: id,
                  title: title,
                  type: type,
                  route: route,
                );
            if (!context.mounted) return;
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(
                  wasIn ? 'Removed from My List' : 'Added to My List',
                ),
              ),
            );
          },
        ),
        const SizedBox(height: 14),
        PulsePillBar(
          labels: _filterLabels,
          selectedIndex: chip,
          showLiveDotAt: 1,
          onSelected: onChip,
        ),
        if (_showSports && data.live.isNotEmpty) ...[
          SectionHeader(
            title: 'Live Sports on Air',
            accentBar: AppColors.accent,
            actionLabel: 'See all',
            onAction: () => context.go('/sports'),
          ),
          SizedBox(
            height: 220,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              scrollDirection: Axis.horizontal,
              itemCount: data.live.length.clamp(0, 12),
              separatorBuilder: (_, _) => const SizedBox(width: 12),
              itemBuilder: (context, i) => _LiveSportCard(event: data.live[i]),
            ),
          ),
        ],
        if (continueWatching.isNotEmpty) ...[
          SectionHeader(
            title: 'Continue Watching',
            accentBar: AppColors.success,
            actionLabel: 'My List',
            onAction: () => context.go('/library'),
          ),
          SizedBox(
            height: 176,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              scrollDirection: Axis.horizontal,
              itemCount: continueWatching.length,
              separatorBuilder: (_, _) => const SizedBox(width: 12),
              itemBuilder: (context, i) =>
                  _ContinueCard(entry: continueWatching[i]),
            ),
          ),
        ],
        if (_showSeries && originals.isNotEmpty) ...[
          SectionHeader(
            title: 'Originals & Complete Box Sets',
            accentBar: AppColors.gold,
            actionLabel: 'Browse',
            onAction: () => context.go('/series'),
          ),
          SizedBox(
            height: 210,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              scrollDirection: Axis.horizontal,
              itemCount: originals.length,
              separatorBuilder: (_, _) => const SizedBox(width: 12),
              itemBuilder: (context, i) =>
                  _OriginalsCard(title: originals[i], index: i),
            ),
          ),
        ],
        if (_showMovies && trending.isNotEmpty) ...[
          SectionHeader(
            title: 'Top Trending Now',
            accentBar: const Color(0xFF6C8CFF),
            actionLabel: 'Movies',
            onAction: () => context.go('/movies'),
          ),
          HorizontalPosterRow(
            height: 248,
            children: [
              for (var i = 0; i < trending.length; i++)
                PosterCard(
                  title: trending[i].name,
                  subtitle: trending[i].year,
                  posterUrl: trending[i].poster,
                  badge: i == 0 ? 'TOP 1' : null,
                  rating: (8.9 - i * 0.2).toStringAsFixed(1),
                  width: 118,
                  height: 176,
                  onTap: () => context.push('/movies/${trending[i].id}'),
                ),
            ],
          ),
        ],
        if (_showSports) ...[
          SectionHeader(
            title: 'Live Schedule',
            accentBar: AppColors.accentStrong,
            actionLabel: 'Full schedule',
            onAction: () => context.go('/sports'),
          ),
          if (schedule.isEmpty)
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Text(
                'No upcoming kickoffs right now.',
                style: TextStyle(color: AppColors.textMuted),
              ),
            )
          else
            ...schedule.map((e) => _ScheduleRow(event: e)),
        ],
        const SizedBox(height: 48),
      ],
    );
  }
}

class _HeroBanner extends StatefulWidget {
  const _HeroBanner({
    required this.slides,
    required this.onAddToList,
  });

  final List<_HeroSlide> slides;
  final void Function(String id, String title, String type, String route)
      onAddToList;

  @override
  State<_HeroBanner> createState() => _HeroBannerState();
}

class _HeroBannerState extends State<_HeroBanner> {
  late final PageController _controller;
  Timer? _timer;
  int _index = 0;
  bool _paused = false;

  @override
  void initState() {
    super.initState();
    _controller = PageController();
    _restartTimer();
  }

  @override
  void didUpdateWidget(covariant _HeroBanner oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.slides.length != widget.slides.length) {
      _index = 0;
      if (_controller.hasClients) {
        _controller.jumpToPage(0);
      }
      _restartTimer();
    }
  }

  void _restartTimer() {
    _timer?.cancel();
    if (widget.slides.length <= 1 || _paused) return;
    _timer = Timer.periodic(const Duration(seconds: 6), (_) {
      if (!mounted || !_controller.hasClients || widget.slides.isEmpty) return;
      final next = (_index + 1) % widget.slides.length;
      _controller.animateToPage(
        next,
        duration: const Duration(milliseconds: 650),
        curve: Curves.easeInOutCubic,
      );
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.slides.isEmpty) {
      return const Padding(
        padding: EdgeInsets.fromLTRB(16, 4, 16, 0),
        child: _EmptyHero(),
      );
    }

    return Column(
      children: [
        Listener(
          onPointerDown: (_) {
            _paused = true;
            _timer?.cancel();
          },
          onPointerUp: (_) {
            _paused = false;
            _restartTimer();
          },
          child: SizedBox(
            height: 340,
            child: PageView.builder(
              controller: _controller,
              itemCount: widget.slides.length,
              onPageChanged: (i) => setState(() => _index = i),
              itemBuilder: (context, i) {
                final slide = widget.slides[i];
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: switch (slide) {
                    _HeroSport(:final event) => _HeroSportSlide(
                        event: event,
                        onAddToList: () => widget.onAddToList(
                          event.id,
                          event.displayTitle,
                          'sport',
                          '/sports/${event.id}',
                        ),
                      ),
                    _HeroCatalog(:final item, :final isSeries) =>
                      _HeroCatalogSlide(
                        title: item,
                        isSeries: isSeries,
                        onAddToList: () => widget.onAddToList(
                          item.id,
                          item.name,
                          isSeries ? 'series' : 'movie',
                          isSeries
                              ? '/series/${item.id}'
                              : '/movies/${item.id}',
                        ),
                      ),
                  },
                );
              },
            ),
          ),
        ),
        if (widget.slides.length > 1) ...[
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(widget.slides.length, (i) {
              final active = i == _index;
              return AnimatedContainer(
                duration: const Duration(milliseconds: 280),
                curve: Curves.easeOutCubic,
                margin: const EdgeInsets.symmetric(horizontal: 3),
                width: active ? 18 : 6,
                height: 6,
                decoration: BoxDecoration(
                  color: active
                      ? AppColors.accent
                      : Colors.white.withValues(alpha: 0.28),
                  borderRadius: BorderRadius.circular(99),
                ),
              );
            }),
          ),
        ],
      ],
    );
  }
}

class _EmptyHero extends StatelessWidget {
  const _EmptyHero();

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadii.card),
      child: Container(
        height: 280,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF1C2430), Color(0xFF0F0F11)],
          ),
        ),
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SoftBadge(label: 'PULSE HOME', color: AppColors.accent),
            const Spacer(),
            Text(
              'Your next stream starts here',
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Live sports, cinema, and series from your configured API.',
              style: TextStyle(color: AppColors.textMuted),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: PulsePrimaryButton(
                    label: 'Explore Sports',
                    onPressed: () => context.go('/sports'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: PulseGhostButton(
                    label: 'Movies',
                    icon: Icons.movie_creation_outlined,
                    onPressed: () => context.go('/movies'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _HeroSportSlide extends StatelessWidget {
  const _HeroSportSlide({
    required this.event,
    required this.onAddToList,
  });

  final SportEvent event;
  final VoidCallback onAddToList;

  @override
  Widget build(BuildContext context) {
    final score = event.score;
    final hasScore = score?.home != null && score?.away != null;
    final homeAbbr = _abbr(event.homeTeam ?? 'HOME');
    final awayAbbr = _abbr(event.awayTeam ?? 'AWAY');

    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadii.card),
      child: Stack(
        fit: StackFit.expand,
        children: [
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0xFF2A3544), Color(0xFF101218)],
              ),
            ),
          ),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topRight,
                end: Alignment.bottomLeft,
                colors: [
                  AppColors.accent.withValues(alpha: 0.22),
                  Colors.transparent,
                  Colors.black.withValues(alpha: 0.82),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    if (event.isLive)
                      const LiveBadge(label: 'LIVE NOW')
                    else
                      SoftBadge(
                        label: event.status.toUpperCase(),
                        color: AppColors.bgSubtle,
                      ),
                    SoftBadge(
                      label: event.competition.toUpperCase(),
                      color: Colors.black.withValues(alpha: 0.45),
                    ),
                    SoftBadge(
                      label: '4K ULTRA HD',
                      color: Colors.black.withValues(alpha: 0.45),
                    ),
                    SoftBadge(
                      label: 'DOLBY ATMOS',
                      color: Colors.black.withValues(alpha: 0.45),
                    ),
                  ],
                ),
                if (hasScore) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.45),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: Colors.white.withValues(alpha: 0.12),
                      ),
                    ),
                    child: Text(
                      '$homeAbbr ${score!.home} - ${score.away} $awayAbbr',
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.4,
                      ),
                    ),
                  ),
                ],
                const Spacer(),
                Text(
                  event.displayTitle.toUpperCase(),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w900,
                        height: 1.1,
                        letterSpacing: 0.3,
                      ),
                ),
                const SizedBox(height: 6),
                MatchCountdownLabel(
                  startTime: event.startTime,
                  status: event.status,
                  style: const TextStyle(fontSize: 13),
                ),
                const SizedBox(height: 4),
                Text(
                  event.isLive
                      ? 'Multi-cam direct feed · English commentary'
                      : '${event.sport} · ${event.competition}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: AppColors.textMuted,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      flex: 3,
                      child: PulsePrimaryButton(
                        label: event.isPlayable
                            ? 'Watch Live Stream'
                            : 'Open Event',
                        onPressed: () =>
                            context.push('/sports/${event.id}'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      flex: 2,
                      child: PulseGhostButton(
                        label: 'My List',
                        onPressed: onAddToList,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _abbr(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    final t = name.trim();
    if (t.length <= 3) return t.toUpperCase();
    return t.substring(0, 3).toUpperCase();
  }
}

class _HeroCatalogSlide extends StatelessWidget {
  const _HeroCatalogSlide({
    required this.title,
    required this.isSeries,
    required this.onAddToList,
  });

  final CatalogTitle title;
  final bool isSeries;
  final VoidCallback onAddToList;

  @override
  Widget build(BuildContext context) {
    final route = isSeries ? '/series/${title.id}' : '/movies/${title.id}';

    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadii.card),
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (title.poster != null)
            CachedNetworkImage(imageUrl: title.poster!, fit: BoxFit.cover)
          else
            Container(color: AppColors.bgElevated),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.black.withValues(alpha: 0.15),
                  Colors.black.withValues(alpha: 0.88),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    SoftBadge(
                      label: isSeries ? 'SERIES' : 'FEATURED',
                      color: AppColors.accent,
                    ),
                    SoftBadge(
                      label: '4K ULTRA HD',
                      color: Colors.black.withValues(alpha: 0.45),
                    ),
                    SoftBadge(
                      label: 'DOLBY VISION',
                      color: Colors.black.withValues(alpha: 0.45),
                    ),
                  ],
                ),
                const Spacer(),
                Text(
                  title.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w900,
                        height: 1.1,
                      ),
                ),
                if (title.year != null) ...[
                  const SizedBox(height: 6),
                  Text(
                    title.year!,
                    style: const TextStyle(color: AppColors.textMuted),
                  ),
                ],
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      flex: 3,
                      child: PulsePrimaryButton(
                        label: isSeries ? 'Start Watching' : 'Watch Now',
                        onPressed: () => context.push(route),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      flex: 2,
                      child: PulseGhostButton(
                        label: 'My List',
                        onPressed: onAddToList,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LiveSportCard extends StatelessWidget {
  const _LiveSportCard({required this.event});

  final SportEvent event;

  @override
  Widget build(BuildContext context) {
    final score = event.score;
    final scoreText = score?.home != null && score?.away != null
        ? '${score!.home} - ${score.away}'
        : null;

    return SizedBox(
      width: 268,
      child: Material(
        color: AppColors.bgPanel,
        borderRadius: BorderRadius.circular(AppRadii.card),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => context.push('/sports/${event.id}'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                flex: 5,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    const DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [Color(0xFF243044), Color(0xFF15181F)],
                        ),
                      ),
                    ),
                    Positioned(
                      top: 10,
                      left: 10,
                      child: const LiveBadge(label: 'LIVE'),
                    ),
                    Positioned(
                      top: 10,
                      right: 10,
                      child: SoftBadge(
                        label: event.sport.toUpperCase(),
                        color: Colors.black.withValues(alpha: 0.5),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                flex: 6,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        event.competition.toUpperCase(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: AppColors.gold,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.6,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        event.displayTitle,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          height: 1.2,
                        ),
                      ),
                      const SizedBox(height: 4),
                      if (scoreText != null)
                        Text(
                          scoreText,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                          ),
                        )
                      else
                        MatchCountdownLabel(
                          startTime: event.startTime,
                          status: event.status,
                          style: const TextStyle(fontSize: 12),
                        ),
                      const Spacer(),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          onPressed: () =>
                              context.push('/sports/${event.id}'),
                          style: FilledButton.styleFrom(
                            backgroundColor: AppColors.accent,
                            minimumSize: const Size(0, 36),
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(AppRadii.sm),
                            ),
                          ),
                          child: const Text(
                            'Jump In',
                            style: TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 13,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ContinueCard extends StatelessWidget {
  const _ContinueCard({required this.entry});

  final ContinueWatchEntry entry;

  @override
  Widget build(BuildContext context) {
    final progress = entry.duration > 0
        ? (entry.position / entry.duration).clamp(0.0, 1.0)
        : 0.18;
    final leftMin = entry.duration > entry.position
        ? ((entry.duration - entry.position) / 60).floor()
        : null;

    return SizedBox(
      width: 248,
      child: Material(
        color: AppColors.bgPanel,
        borderRadius: BorderRadius.circular(AppRadii.card),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => context.push(entry.route),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    entry.poster == null
                        ? Container(color: AppColors.bgElevated)
                        : CachedNetworkImage(
                            imageUrl: entry.poster!,
                            fit: BoxFit.cover,
                          ),
                    Container(
                      color: Colors.black.withValues(alpha: 0.25),
                    ),
                    const Center(
                      child: CircleAvatar(
                        backgroundColor: AppColors.accent,
                        radius: 22,
                        child: Icon(
                          Icons.play_arrow_rounded,
                          color: Colors.white,
                          size: 28,
                        ),
                      ),
                    ),
                    if (leftMin != null)
                      Positioned(
                        top: 8,
                        right: 8,
                        child: SoftBadge(
                          label: '${leftMin}m left',
                          color: Colors.black.withValues(alpha: 0.65),
                        ),
                      ),
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 0,
                      child: LinearProgressIndicator(
                        value: progress,
                        minHeight: 4,
                        color: AppColors.success,
                        backgroundColor: Colors.white.withValues(alpha: 0.15),
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                child: Text(
                  entry.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OriginalsCard extends StatelessWidget {
  const _OriginalsCard({required this.title, required this.index});

  final CatalogTitle title;
  final int index;

  @override
  Widget build(BuildContext context) {
    final badge = switch (index % 3) {
      0 => "EDITOR'S PICK",
      1 => 'BOX SET',
      _ => 'TRENDING',
    };

    return SizedBox(
      width: 280,
      child: Material(
        color: AppColors.bgPanel,
        borderRadius: BorderRadius.circular(AppRadii.card),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => context.push('/series/${title.id}'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    title.poster == null
                        ? Container(color: AppColors.bgElevated)
                        : CachedNetworkImage(
                            imageUrl: title.poster!,
                            fit: BoxFit.cover,
                          ),
                    Positioned(
                      top: 10,
                      left: 10,
                      child: SoftBadge(
                        label: badge,
                        color: AppColors.gold.withValues(alpha: 0.92),
                        textColor: Colors.black,
                      ),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${title.year ?? 'Series'} · Dolby Vision',
                      style: const TextStyle(
                        color: AppColors.textMuted,
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: () => context.push('/series/${title.id}'),
                        style: FilledButton.styleFrom(
                          backgroundColor: AppColors.accent,
                          minimumSize: const Size(0, 34),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(AppRadii.sm),
                          ),
                        ),
                        child: const Text(
                          'Start Season 1',
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ScheduleRow extends StatelessWidget {
  const _ScheduleRow({required this.event});

  final SportEvent event;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
      child: Material(
        color: AppColors.bgPanel,
        borderRadius: BorderRadius.circular(AppRadii.sm),
        child: ListTile(
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
          onTap: () => context.push('/sports/${event.id}'),
          title: Text(
            event.displayTitle,
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
          ),
          subtitle: Text(
            '${event.competition} · ${event.sport}',
            style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
          ),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                width: 96,
                child: MatchCountdownLabel(
                  startTime: event.startTime,
                  status: event.status,
                  style: const TextStyle(fontSize: 11),
                ),
              ),
              const SizedBox(width: 4),
              Icon(
                Icons.notifications_none_rounded,
                color: AppColors.textMuted.withValues(alpha: 0.8),
                size: 20,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
