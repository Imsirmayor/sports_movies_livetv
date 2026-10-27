import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/account/settings_screen.dart';
import '../features/home/home_screen.dart';
import '../features/library/library_screen.dart';
import '../features/movies/movie_detail_screen.dart';
import '../features/movies/movies_screen.dart';
import '../features/player/player_screen.dart';
import '../features/search/search_screen.dart';
import '../features/series/series_detail_screen.dart';
import '../features/series/series_screen.dart';
import '../features/sports/sport_event_detail_screen.dart';
import '../features/sports/sports_screen.dart';
import 'shell.dart';

final _rootKey = GlobalKey<NavigatorState>();

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    navigatorKey: _rootKey,
    initialLocation: '/',
    routes: [
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return AppShell(navigationShell: navigationShell);
        },
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/',
                builder: (context, state) => const HomeScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/sports',
                builder: (context, state) => const SportsScreen(),
                routes: [
                  GoRoute(
                    path: ':eventId',
                    builder: (context, state) => SportEventDetailScreen(
                      eventId: state.pathParameters['eventId']!,
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/movies',
                builder: (context, state) => const MoviesScreen(),
                routes: [
                  GoRoute(
                    path: ':imdbId',
                    builder: (context, state) => MovieDetailScreen(
                      imdbId: state.pathParameters['imdbId']!,
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/series',
                builder: (context, state) => const SeriesScreen(),
                routes: [
                  GoRoute(
                    path: ':imdbId',
                    builder: (context, state) => SeriesDetailScreen(
                      imdbId: state.pathParameters['imdbId']!,
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/library',
                builder: (context, state) => const LibraryScreen(),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        parentNavigatorKey: _rootKey,
        path: '/search',
        builder: (context, state) => SearchScreen(
          initialTab: state.uri.queryParameters['tab'] ?? 'all',
        ),
      ),
      GoRoute(
        parentNavigatorKey: _rootKey,
        path: '/settings',
        builder: (context, state) => const SettingsScreen(),
      ),
      GoRoute(
        parentNavigatorKey: _rootKey,
        path: '/player',
        builder: (context, state) {
          final args = state.extra;
          if (args is! PlayerArgs) {
            return const Scaffold(
              body: Center(child: Text('Missing player session')),
            );
          }
          return PlayerScreen(args: args);
        },
      ),
    ],
  );
});
