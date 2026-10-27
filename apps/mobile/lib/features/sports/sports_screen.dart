import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';
import '../../core/errors.dart';
import '../../data/models.dart';
import '../../shared/countdown.dart';
import '../../shared/widgets.dart';

final _sportsFilterProvider = NotifierProvider<_SportsFilterNotifier, String>(
  _SportsFilterNotifier.new,
);

class _SportsFilterNotifier extends Notifier<String> {
  @override
  String build() => 'all';

  void set(String value) => state = value;
}

final _sportsEventsProvider = FutureProvider.autoDispose<SportEventsResponse>((
  ref,
) async {
  final api = ref.watch(apiClientProvider);
  final filter = ref.watch(_sportsFilterProvider);
  return api.searchSportsEvents(
    status: filter == 'live'
        ? 'live'
        : filter == 'upcoming'
            ? 'upcoming'
            : null,
  );
});

final _sportsMetaProvider = FutureProvider.autoDispose<SportsListResponse>((
  ref,
) {
  return ref.watch(apiClientProvider).listSports();
});

class SportsScreen extends ConsumerStatefulWidget {
  const SportsScreen({super.key});

  @override
  ConsumerState<SportsScreen> createState() => _SportsScreenState();
}

class _SportsScreenState extends ConsumerState<SportsScreen> {
  int _sportChip = 0;

  @override
  Widget build(BuildContext context) {
    final filter = ref.watch(_sportsFilterProvider);
    final eventsAsync = ref.watch(_sportsEventsProvider);
    final metaAsync = ref.watch(_sportsMetaProvider);
    final sports = metaAsync.asData?.value.sports ?? const <String>[];
    final sportLabels = ['All Sports', ...sports.map(_sportLabel)];

    return Scaffold(
      appBar: PulseAppBar(onSearch: () => context.push('/search?tab=sports')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 4, bottom: 10),
            child: PulsePillBar(
              labels: sportLabels.take(6).toList(),
              selectedIndex: _sportChip.clamp(0, sportLabels.length - 1),
              onSelected: (i) {
                setState(() => _sportChip = i);
                // Sport-specific filter is client-side below.
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: AppColors.bgElevated,
                borderRadius: BorderRadius.circular(AppRadii.control),
              ),
              child: Row(
                children: [
                  for (final entry in const [
                    ('all', 'All Feed'),
                    ('live', 'Live Only'),
                    ('upcoming', 'Today'),
                  ])
                    Expanded(
                      child: GestureDetector(
                        onTap: () =>
                            ref.read(_sportsFilterProvider.notifier).set(entry.$1),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          decoration: BoxDecoration(
                            color: filter == entry.$1
                                ? AppColors.bgPanel
                                : Colors.transparent,
                            borderRadius:
                                BorderRadius.circular(AppRadii.control),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              if (entry.$1 == 'live') ...[
                                Container(
                                  width: 6,
                                  height: 6,
                                  decoration: const BoxDecoration(
                                    color: AppColors.accent,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                const SizedBox(width: 6),
                              ],
                              Text(
                                entry.$2,
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: filter == entry.$1
                                      ? Colors.white
                                      : AppColors.textMuted,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              color: AppColors.accent,
              onRefresh: () async {
                ref.invalidate(_sportsEventsProvider);
                ref.invalidate(_sportsMetaProvider);
              },
              child: eventsAsync.when(
                loading: () =>
                    const Center(child: CircularProgressIndicator()),
                error: (e, _) => ListView(
                  children: [
                    StateMessage(
                      title: 'Could not load events',
                      message: userFacingError(e),
                      tone: StateTone.error,
                      action: FilledButton(
                        onPressed: () =>
                            ref.invalidate(_sportsEventsProvider),
                        child: const Text('Retry'),
                      ),
                    ),
                  ],
                ),
                data: (res) {
                  var events = res.events;
                  if (_sportChip > 0 && _sportChip <= sports.length) {
                    final sport = sports[_sportChip - 1];
                    events = events
                        .where((e) => e.sport.toLowerCase() == sport.toLowerCase())
                        .toList();
                  }
                  if (events.isEmpty) {
                    return ListView(
                      children: const [
                        StateMessage(
                          title: 'No events right now',
                          message: 'Check back during game time.',
                          icon: Icons.sports,
                        ),
                      ],
                    );
                  }
                  final live = events.where((e) => e.isLive).toList();
                  final upcoming = events.where((e) => !e.isLive).toList();
                  final featured = live.isNotEmpty ? live : upcoming;
                  final leagues = <String>{
                    ...events.map((e) => e.competition),
                  }.take(6).toList();

                  return ListView(
                    padding: const EdgeInsets.only(bottom: 32),
                    children: [
                      if (featured.isNotEmpty) ...[
                        SectionHeader(
                          title: live.isNotEmpty
                              ? 'LIVE NOW (${live.length} Active Feeds)'
                              : 'UPCOMING (${upcoming.length})',
                          actionLabel: live.isNotEmpty ? 'Watch' : 'UTC',
                          onAction: live.isNotEmpty
                              ? () => context.push('/sports/${live.first.id}')
                              : null,
                        ),
                        SizedBox(
                          height: 300,
                          child: PageView.builder(
                            controller: PageController(viewportFraction: 0.92),
                            itemCount: featured.length.clamp(0, 8),
                            itemBuilder: (context, i) =>
                                _LiveHeroCard(event: featured[i]),
                          ),
                        ),
                      ],
                      if (leagues.isNotEmpty) ...[
                        SectionHeader(
                          title: 'Featured Leagues',
                          actionLabel: 'View All',
                          onAction: () {},
                        ),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          child: GridView.builder(
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            itemCount: leagues.length,
                            gridDelegate:
                                const SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: 3,
                              mainAxisSpacing: 10,
                              crossAxisSpacing: 10,
                              childAspectRatio: 1.05,
                            ),
                            itemBuilder: (context, i) {
                              return Container(
                                decoration: BoxDecoration(
                                  color: AppColors.bgPanel,
                                  borderRadius:
                                      BorderRadius.circular(AppRadii.sm),
                                ),
                                padding: const EdgeInsets.all(10),
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    CircleAvatar(
                                      radius: 18,
                                      backgroundColor: AppColors.accentSoft,
                                      child: Icon(
                                        Icons.sports,
                                        color: AppColors.accent,
                                        size: 18,
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                    Text(
                                      leagues[i],
                                      textAlign: TextAlign.center,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ],
                                ),
                              );
                            },
                          ),
                        ),
                      ],
                      SectionHeader(
                        title: upcoming.isEmpty
                            ? 'Match schedule'
                            : "Today's Matchups",
                        subtitle: '${events.length} matches · countdown on each card',
                      ),
                      ...upcoming.map((e) => _ScheduleCard(event: e)),
                      if (upcoming.isEmpty)
                        ...live.map((e) => _ScheduleCard(event: e)),
                    ],
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _sportLabel(String sport) {
    final s = sport.toLowerCase();
    if (s.contains('soccer') || s == 'football' || s.contains('liga')) {
      return 'Football ⚽';
    }
    if (s.contains('basket') || s == 'nba') return 'Basketball 🏀';
    if (s.contains('nhl') || s.contains('hockey')) return 'Hockey 🏒';
    if (s.contains('nfl')) return 'NFL 🏈';
    if (s.contains('f1') || s.contains('motor')) return 'Motor Sport';
    if (sport.isEmpty) return sport;
    return sport[0].toUpperCase() + sport.substring(1);
  }
}

class _LiveHeroCard extends StatelessWidget {
  const _LiveHeroCard({required this.event});

  final SportEvent event;

  @override
  Widget build(BuildContext context) {
    final score = event.score;
    final scoreText = score?.home != null && score?.away != null
        ? '${score!.home}  -  ${score.away}'
        : (event.isLive ? 'LIVE' : 'VS');

    return Padding(
      padding: const EdgeInsets.only(right: 10),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadii.card),
        child: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF243041), Color(0xFF14161C)],
            ),
          ),
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  if (event.isLive)
                    const LiveBadge()
                  else
                    const SoftBadge(
                      label: 'UPCOMING',
                      color: AppColors.bgSubtle,
                    ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: MatchCountdownLabel(
                      startTime: event.startTime,
                      status: event.status,
                      style: const TextStyle(fontSize: 12),
                    ),
                  ),
                  const SoftBadge(label: 'HD'),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                event.competition.toUpperCase(),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: AppColors.success,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5,
                ),
              ),
              const Spacer(),
              Text(
                event.displayTitle,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  height: 1.2,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                scoreText,
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w900,
                  height: 1.1,
                ),
              ),
              const SizedBox(height: 10),
              if (event.isPlayable)
                PulsePrimaryButton(
                  label: 'Watch Live HD',
                  expand: true,
                  onPressed: () => context.push('/sports/${event.id}'),
                )
              else
                MatchCountdownLabel(
                  startTime: event.startTime,
                  status: event.status,
                  pill: true,
                  expand: true,
                  style: const TextStyle(fontSize: 15),
                  onElapsed: () =>
                      context.push('/sports/${event.id}'),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ScheduleCard extends StatelessWidget {
  const _ScheduleCard({required this.event});

  final SportEvent event;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Material(
        color: AppColors.bgPanel,
        borderRadius: BorderRadius.circular(AppRadii.card),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(
                    event.competition.toUpperCase(),
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: AppColors.textMuted,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    event.isPlayable ? 'Stream ready' : 'Countdown',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: event.isPlayable
                          ? AppColors.gold
                          : AppColors.accentStrong,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                event.displayTitle,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${event.sport.toUpperCase()} · ${event.status}',
                style: const TextStyle(
                  color: AppColors.textMuted,
                  fontSize: 12,
                ),
              ),
              const SizedBox(height: 12),
              MatchCountdownLabel(
                startTime: event.startTime,
                status: event.status,
                pill: true,
                expand: true,
                style: const TextStyle(fontSize: 14),
                onElapsed: event.isPlayable
                    ? null
                    : () => context.push('/sports/${event.id}'),
              ),
              if (event.isPlayable) ...[
                const SizedBox(height: 10),
                PulsePrimaryButton(
                  label: 'Watch Live HD',
                  expand: true,
                  onPressed: () => context.push('/sports/${event.id}'),
                ),
              ] else ...[
                const SizedBox(height: 8),
                Text(
                  'Stream unlocks at kickoff — no need to open the event yet.',
                  style: TextStyle(
                    color: AppColors.textMuted.withValues(alpha: 0.9),
                    fontSize: 11,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
