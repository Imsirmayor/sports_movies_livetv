import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';
import '../../core/errors.dart';
import '../../data/models.dart';
import '../../shared/widgets.dart';

final _moviesProvider = FutureProvider.autoDispose<CatalogListResponse>((ref) {
  return ref.watch(apiClientProvider).listCatalogMovies();
});

class MoviesScreen extends ConsumerStatefulWidget {
  const MoviesScreen({super.key});

  @override
  ConsumerState<MoviesScreen> createState() => _MoviesScreenState();
}

class _MoviesScreenState extends ConsumerState<MoviesScreen> {
  final _controller = TextEditingController();
  List<CatalogTitle>? _searchResults;
  bool _searching = false;
  String? _searchError;
  int _genre = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _search(String q) async {
    final query = q.trim();
    if (query.isEmpty) {
      setState(() {
        _searchResults = null;
        _searchError = null;
      });
      return;
    }
    setState(() {
      _searching = true;
      _searchError = null;
    });
    try {
      final res =
          await ref.read(apiClientProvider).searchCatalogMovies(query);
      if (!mounted) return;
      setState(() {
        _searchResults = res.items;
        _searching = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _searchError = userFacingError(e);
        _searching = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final listAsync = ref.watch(_moviesProvider);
    final items = _searchResults ?? listAsync.asData?.value.items ?? const [];
    final hero = items.isNotEmpty ? items.first : null;

    return Scaffold(
      appBar: PulseAppBar(onSearch: () => context.push('/search?tab=movies')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: Row(
              children: [
                Text(
                  'Movies',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                ),
                const SizedBox(width: 8),
                SoftBadge(
                  label: '${items.length} TITLES',
                  color: AppColors.bgElevated,
                ),
                const Spacer(),
                SoftBadge(
                  label: 'Popular ▾',
                  color: AppColors.bgElevated,
                ),
              ],
            ),
          ),
          PulsePillBar(
            labels: const ['All', 'Action', 'Sci-Fi', 'Thriller', 'Drama'],
            selectedIndex: _genre,
            onSelected: (i) => setState(() => _genre = i),
          ),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextField(
              controller: _controller,
              textInputAction: TextInputAction.search,
              onSubmitted: _search,
              decoration: InputDecoration(
                hintText: 'Search movies',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _controller.text.isEmpty
                    ? null
                    : IconButton(
                        onPressed: () {
                          _controller.clear();
                          setState(() => _searchResults = null);
                        },
                        icon: const Icon(Icons.clear),
                      ),
              ),
            ),
          ),
          if (_searching) const LinearProgressIndicator(color: AppColors.accent),
          if (_searchError != null)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(_searchError!,
                  style: const TextStyle(color: AppColors.danger)),
            ),
          Expanded(
            child: RefreshIndicator(
              color: AppColors.accent,
              onRefresh: () async => ref.invalidate(_moviesProvider),
              child: listAsync.when(
                loading: () => items.isEmpty
                    ? const Center(child: CircularProgressIndicator())
                    : _body(items, hero),
                error: (e, _) => items.isNotEmpty
                    ? _body(items, hero)
                    : ListView(
                        children: [
                          StateMessage(
                            title: 'Movies unavailable',
                            message: userFacingError(e),
                            tone: StateTone.error,
                            action: FilledButton(
                              onPressed: () =>
                                  ref.invalidate(_moviesProvider),
                              child: const Text('Retry'),
                            ),
                          ),
                        ],
                      ),
                data: (res) {
                  if (!res.providerConfigured && items.isEmpty) {
                    return ListView(
                      children: const [
                        StateMessage(
                          title: 'Catalog not configured',
                          message:
                              'Set STREMIO_ADDON_URL on the API to enable movies.',
                          tone: StateTone.warn,
                          icon: Icons.cloud_off,
                        ),
                      ],
                    );
                  }
                  if (items.isEmpty) {
                    return ListView(
                      children: const [
                        StateMessage(
                          title: 'No movies found',
                          message: 'Try a different search.',
                          icon: Icons.movie_filter_outlined,
                        ),
                      ],
                    );
                  }
                  return _body(items, hero);
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _body(List<CatalogTitle> items, CatalogTitle? hero) {
    final rest = items.length > 1 ? items.sublist(1) : items;
    return ListView(
      padding: const EdgeInsets.only(bottom: 32),
      children: [
        if (hero != null) _MovieHero(title: hero),
        if (rest.isNotEmpty) ...[
          const SectionHeader(
            title: 'Explore Catalogue',
            subtitle: 'Curated cinematic picks',
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: rest.length,
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 14,
                crossAxisSpacing: 12,
                childAspectRatio: 0.55,
              ),
              itemBuilder: (context, i) {
                final m = rest[i];
                return PosterCard(
                  title: m.name,
                  subtitle: m.year,
                  posterUrl: m.poster,
                  width: double.infinity,
                  height: 210,
                  showBookmark: true,
                  onBookmark: () {
                    ref.read(myListProvider.notifier).toggle(
                          id: m.id,
                          title: m.name,
                          type: 'movie',
                          poster: m.poster,
                          route: '/movies/${m.id}',
                        );
                  },
                  onTap: () => context.push('/movies/${m.id}'),
                );
              },
            ),
          ),
        ],
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
          child: Text(
            'Displaying ${items.length} cinematic titles',
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
          ),
        ),
      ],
    );
  }
}

class _MovieHero extends StatelessWidget {
  const _MovieHero({required this.title});

  final CatalogTitle title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadii.card),
        child: SizedBox(
          height: 300,
          child: Stack(
            fit: StackFit.expand,
            children: [
              title.poster == null
                  ? Container(color: AppColors.bgElevated)
                  : CachedNetworkImage(
                      imageUrl: title.poster!,
                      fit: BoxFit.cover,
                    ),
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
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Wrap(
                      spacing: 8,
                      children: [
                        SoftBadge(label: 'FEATURED', color: AppColors.accent),
                        SoftBadge(label: '4K READY'),
                      ],
                    ),
                    const Spacer(),
                    Text(
                      title.name,
                      style:
                          Theme.of(context).textTheme.headlineSmall?.copyWith(
                                fontWeight: FontWeight.w900,
                              ),
                    ),
                    if (title.year != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        title.year!,
                        style: const TextStyle(color: AppColors.textMuted),
                      ),
                    ],
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        Expanded(
                          child: PulsePrimaryButton(
                            label: 'Watch Now',
                            onPressed: () =>
                                context.push('/movies/${title.id}'),
                          ),
                        ),
                        const SizedBox(width: 10),
                        PulseGhostButton(
                          label: 'Details',
                          icon: Icons.info_outline,
                          onPressed: () => context.push('/movies/${title.id}'),
                        ),
                      ],
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
