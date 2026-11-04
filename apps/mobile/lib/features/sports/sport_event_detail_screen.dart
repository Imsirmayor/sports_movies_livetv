import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/theme.dart';
import '../../core/errors.dart';
import '../../data/models.dart';
import '../../shared/countdown.dart';
import '../../shared/widgets.dart';
import '../../sports/catalog.dart';
import '../../sports/stream_resolver.dart';
import '../player/player_screen.dart';

class SportEventDetailScreen extends ConsumerStatefulWidget {
  const SportEventDetailScreen({super.key, required this.eventId});

  final String eventId;

  @override
  ConsumerState<SportEventDetailScreen> createState() =>
      _SportEventDetailScreenState();
}

class _SportEventDetailScreenState
    extends ConsumerState<SportEventDetailScreen> {
  SportEvent? _event;
  List<SportFeed> _feeds = const [];
  String? _error;
  bool _loading = true;
  String? _openingUrl;
  int _tab = 0;

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
      final catalog = await ref.read(sportsCatalogProvider.future);
      final event = catalog.find(widget.eventId);
      if (event == null) {
        throw SportsScrapeException(
          'This event is not in the current listings.',
        );
      }
      if (!mounted) return;
      setState(() {
        _event = event;
        _feeds = catalog.feedsFor(event.id);
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = userFacingError(e);
        _loading = false;
      });
    }
  }

  Future<void> _watch(SportFeed feed) async {
    final event = _event;
    if (event == null || _openingUrl != null) return;
    setState(() => _openingUrl = feed.eventUrl);
    try {
      final resolved = await resolveSportFeed(
        feed,
        ref.read(htmlClientProvider).getText,
      );
      if (!mounted) return;
      await context.push(
        '/player',
        extra: PlayerArgs(
          streamUrl: resolved.streamUrl,
          httpHeaders: resolved.headers,
          title: '${event.displayTitle} · ${feed.siteName}',
          isLive: true,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(userFacingError(e))));
    } finally {
      if (mounted) setState(() => _openingUrl = null);
    }
  }

  String _abbr(String? name) {
    if (name == null || name.trim().isEmpty) return '—';
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.length == 1) {
      return parts.first.length <= 3
          ? parts.first.toUpperCase()
          : parts.first.substring(0, 3).toUpperCase();
    }
    return parts.take(2).map((p) => p[0].toUpperCase()).join();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(
          'Live Match Player',
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
        ),
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
          : _error != null
          ? StateMessage(
              title: 'Event unavailable',
              message: _error,
              tone: StateTone.error,
              action: FilledButton(
                onPressed: _load,
                child: const Text('Retry'),
              ),
            )
          : _buildBody(_event!),
    );
  }

  Widget _buildBody(SportEvent event) {
    final home = event.homeTeam ?? 'Home';
    final away = event.awayTeam ?? 'Away';
    final live = event.isLive;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
      children: [
        // Preview / hero frame
        ClipRRect(
          borderRadius: BorderRadius.circular(AppRadii.card),
          child: AspectRatio(
            aspectRatio: 16 / 9,
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFF1E2A24), Color(0xFF12141A)],
                ),
              ),
              child: Stack(
                children: [
                  Positioned(
                    top: 12,
                    left: 12,
                    child: Row(
                      children: [
                        if (live) const LiveBadge(),
                        const SizedBox(width: 8),
                        SoftBadge(
                          label: '${_abbr(home)} vs ${_abbr(away)}',
                          color: Colors.black.withValues(alpha: 0.55),
                        ),
                      ],
                    ),
                  ),
                  const Positioned(
                    top: 12,
                    right: 12,
                    child: SoftBadge(label: 'HD STREAM', color: Colors.black54),
                  ),
                  Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        SoftBadge(
                          label: event.competition.toUpperCase(),
                          color: Colors.black.withValues(alpha: 0.45),
                          textColor: AppColors.success,
                        ),
                        const SizedBox(height: 16),
                        Icon(
                          Icons.play_circle_filled_rounded,
                          size: 64,
                          color: AppColors.accent.withValues(alpha: 0.95),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 14),

        // Scoreboard card
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.bgPanel,
            borderRadius: BorderRadius.circular(AppRadii.card),
          ),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      event.competition.toUpperCase(),
                      style: const TextStyle(
                        color: AppColors.textMuted,
                        fontWeight: FontWeight.w700,
                        fontSize: 11,
                        letterSpacing: 0.6,
                      ),
                    ),
                  ),
                  SoftBadge(
                    label: event.feedsLabel.toUpperCase(),
                    color: AppColors.bgElevated,
                    textColor: AppColors.gold,
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(child: _teamCol(home, _abbr(home))),
                  Column(
                    children: [
                      Text(
                        live ? 'LIVE' : event.status.toUpperCase(),
                        style: TextStyle(
                          color: live ? AppColors.accent : AppColors.textMuted,
                          fontWeight: FontWeight.w800,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'VS',
                        style: Theme.of(context).textTheme.headlineMedium
                            ?.copyWith(fontWeight: FontWeight.w900),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        event.sport.toUpperCase(),
                        style: const TextStyle(
                          color: AppColors.textMuted,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                  Expanded(child: _teamCol(away, _abbr(away))),
                ],
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Icon(
                    Icons.verified_rounded,
                    size: 16,
                    color: AppColors.success,
                  ),
                  const SizedBox(width: 6),
                  const Expanded(
                    child: Text(
                      'Official Broadcast Feed',
                      style: TextStyle(
                        color: AppColors.success,
                        fontWeight: FontWeight.w600,
                        fontSize: 12,
                      ),
                    ),
                  ),
                  Text(
                    event.provider,
                    style: const TextStyle(
                      color: AppColors.textMuted,
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),

        if (_feeds.isEmpty)
          const StateMessage(
            title: 'No playable stream',
            message: 'This match was not found on any enabled listing page.',
            tone: StateTone.warn,
            icon: Icons.lock_outline,
          )
        else ...[
          if (!live) ...[
            MatchCountdownLabel(
              startTime: event.startTime,
              status: event.status,
              pill: true,
              expand: true,
              style: const TextStyle(fontSize: 16),
              onElapsed: _load,
            ),
            const SizedBox(height: 10),
          ],
          Text(
            'Feeds',
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 4),
          Text(
            'Each row is this match on one listing page. Play scrapes that page for its embed.',
            style: TextStyle(
              color: AppColors.textMuted.withValues(alpha: 0.95),
              fontSize: 13,
            ),
          ),
          const SizedBox(height: 8),
          for (final feed in _feeds)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Material(
                color: AppColors.bgPanel,
                borderRadius: BorderRadius.circular(AppRadii.card),
                child: ListTile(
                  title: Text(
                    feed.siteName,
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  subtitle: Text(
                    '${feed.hostLabel} · ${feed.league}',
                    style: const TextStyle(color: AppColors.textMuted),
                  ),
                  trailing: _openingUrl == feed.eventUrl
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.play_circle_fill_rounded),
                  onTap: _openingUrl == null ? () => _watch(feed) : null,
                ),
              ),
            ),
        ],

        const SizedBox(height: 18),
        PulsePillBar(
          labels: const ['Timeline & Events', 'Live Stats', 'Lineups'],
          selectedIndex: _tab,
          onSelected: (i) => setState(() => _tab = i),
        ),
        const SizedBox(height: 16),
        if (_tab == 0)
          _infoCard(
            icon: Icons.sports_soccer,
            title: event.displayTitle,
            body:
                '${event.competition} · ${event.sport}\nStatus: ${event.status}\nFeeds: ${event.feedsLabel}',
          )
        else if (_tab == 1)
          _infoCard(
            icon: Icons.bar_chart_rounded,
            title: 'Live Stats',
            body:
                'Detailed match stats appear here when the feed provides them.\nProvider: ${event.provider}',
          )
        else
          _infoCard(
            icon: Icons.groups_rounded,
            title: 'Lineups',
            body:
                'Home: $home\nAway: $away\nLineup data is not available for this feed yet.',
          ),
      ],
    );
  }

  Widget _teamCol(String name, String abbr) {
    return Column(
      children: [
        CircleAvatar(
          radius: 22,
          backgroundColor: AppColors.bgElevated,
          child: Text(
            abbr,
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          name,
          textAlign: TextAlign.center,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
        ),
      ],
    );
  }

  Widget _infoCard({
    required IconData icon,
    required String title,
    required String body,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.bgPanel,
        borderRadius: BorderRadius.circular(AppRadii.card),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: AppColors.accent, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            body,
            style: const TextStyle(color: AppColors.textMuted, height: 1.45),
          ),
        ],
      ),
    );
  }
}
