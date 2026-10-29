import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';
import '../../core/errors.dart';
import '../../data/models.dart';
import '../../shared/countdown.dart';
import '../../shared/widgets.dart';

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key, this.initialTab = 'all'});

  final String initialTab;

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  late String _tab;
  final _controller = TextEditingController();
  bool _busy = false;
  String? _error;
  List<CatalogTitle> _movies = const [];
  List<CatalogTitle> _series = const [];
  List<SportEvent> _sports = const [];

  @override
  void initState() {
    super.initState();
    _tab = widget.initialTab;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _run(String raw) async {
    final q = raw.trim();
    if (q.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final api = ref.read(apiClientProvider);
    try {
      List<CatalogTitle> movies = const [];
      List<CatalogTitle> series = const [];
      List<SportEvent> sports = const [];
      if (_tab == 'all' || _tab == 'movies') {
        movies = (await api.searchCatalogMovies(q)).items;
      }
      if (_tab == 'all' || _tab == 'series') {
        series = (await api.searchCatalogSeries(q)).items;
      }
      if (_tab == 'all' || _tab == 'sports') {
        sports = (await api.searchSportsEvents(q: q, team: q)).events;
      }
      if (!mounted) return;
      setState(() {
        _movies = movies;
        _series = series;
        _sports = sports;
        _busy = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = userFacingError(e);
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Search')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: TextField(
              controller: _controller,
              autofocus: true,
              textInputAction: TextInputAction.search,
              onSubmitted: _run,
              decoration: const InputDecoration(
                hintText: 'Movies, series, teams…',
                prefixIcon: Icon(Icons.search),
              ),
            ),
          ),
          FilterChipBar(
            labels: const ['All', 'Movies', 'Series', 'Sports'],
            selectedIndex: switch (_tab) {
              'movies' => 1,
              'series' => 2,
              'sports' => 3,
              _ => 0,
            },
            onSelected: (i) {
              setState(() {
                _tab = switch (i) {
                  1 => 'movies',
                  2 => 'series',
                  3 => 'sports',
                  _ => 'all',
                };
              });
              if (_controller.text.trim().isNotEmpty) {
                _run(_controller.text);
              }
            },
          ),
          if (_busy) const LinearProgressIndicator(color: AppColors.accent),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(_error!, style: const TextStyle(color: AppColors.danger)),
            ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.only(bottom: 32),
              children: [
                if (_movies.isNotEmpty) ...[
                  const SectionHeader(title: 'Movies'),
                  ..._movies.map(
                    (m) => ListTile(
                      title: Text(m.name),
                      subtitle: Text(m.year ?? 'Movie'),
                      onTap: () => context.push('/movies/${m.id}'),
                    ),
                  ),
                ],
                if (_series.isNotEmpty) ...[
                  const SectionHeader(title: 'Series'),
                  ..._series.map(
                    (s) => ListTile(
                      title: Text(s.name),
                      subtitle: Text(s.year ?? 'Series'),
                      onTap: () => context.push('/series/${s.id}'),
                    ),
                  ),
                ],
                if (_sports.isNotEmpty) ...[
                  const SectionHeader(title: 'Sports'),
                  ..._sports.map(
                    (e) => ListTile(
                      title: Text(e.displayTitle),
                      subtitle: Text('${e.competition} · ${e.status}'),
                      trailing: SizedBox(
                        width: 110,
                        child: MatchCountdownLabel(
                          startTime: e.startTime,
                          status: e.status,
                          style: const TextStyle(fontSize: 11),
                        ),
                      ),
                      onTap: e.isPlayable
                          ? () => context.push('/sports/${e.id}')
                          : null,
                    ),
                  ),
                ],
                if (!_busy &&
                    _error == null &&
                    _movies.isEmpty &&
                    _series.isEmpty &&
                    _sports.isEmpty &&
                    _controller.text.trim().isNotEmpty)
                  const StateMessage(
                    title: 'No results',
                    message: 'Try another query or category.',
                    icon: Icons.search_off,
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
