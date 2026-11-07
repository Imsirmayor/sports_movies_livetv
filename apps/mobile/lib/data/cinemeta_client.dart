import 'package:dio/dio.dart';

import '../core/errors.dart';
import 'models.dart';

/// Cinemeta catalogs — search, top lists, and title detail.
/// Same public Stremio metadata the API used, called directly from the app.
const cinemetaSearchBase = 'https://v3-cinemeta.strem.io';
const cinemetaTopBase = 'https://cinemeta-catalogs.strem.io/top/catalog';

CatalogTitle? titleFromCinemeta(
  Map<String, dynamic> meta,
  String fallbackType,
) {
  final id = (meta['imdb_id'] as String?)?.trim().isNotEmpty == true
      ? meta['imdb_id'] as String
      : meta['id'] as String?;
  final name = meta['name'] as String?;
  if (id == null || id.isEmpty || name == null || name.isEmpty) return null;
  final rawType = meta['type'] as String?;
  final type =
      rawType == 'series' || rawType == 'movie' ? rawType! : fallbackType;
  final yearValue = meta['year'] ?? meta['releaseInfo'];
  final poster = meta['poster'];
  return CatalogTitle(
    id: id,
    name: name,
    type: type,
    year: yearValue?.toString(),
    poster: poster is String && poster.isNotEmpty ? poster : null,
  );
}

SeriesMeta? seriesMetaFromCinemeta(Map<String, dynamic> meta) {
  final base = titleFromCinemeta({...meta, 'type': 'series'}, 'series');
  if (base == null) return null;

  final videos = meta['videos'];
  final episodes = <SeriesEpisode>[];
  if (videos is List) {
    for (final raw in videos) {
      if (raw is! Map) continue;
      final video = Map<String, dynamic>.from(raw);
      final season = (video['season'] as num?)?.toInt() ?? 0;
      final episode = (video['episode'] as num?)?.toInt() ?? 0;
      if (season <= 0) continue;
      final overview = video['overview'];
      final released = video['released'];
      episodes.add(
        SeriesEpisode(
          season: season,
          episode: episode,
          name: video['name'] as String? ?? 'Episode $episode',
          overview: overview is String ? overview : null,
          released: released is String ? released : null,
        ),
      );
    }
  }
  episodes.sort((a, b) {
    final bySeason = a.season.compareTo(b.season);
    if (bySeason != 0) return bySeason;
    return a.episode.compareTo(b.episode);
  });
  final seasons = episodes.map((e) => e.season).toSet().toList()..sort();
  return SeriesMeta(
    id: base.id,
    name: base.name,
    type: base.type,
    year: base.year,
    poster: base.poster,
    episodes: episodes,
    seasons: seasons,
  );
}

class CinemetaClient {
  CinemetaClient({Dio? dio}) : _dio = dio ?? Dio();

  final Dio _dio;

  Future<List<CatalogTitle>> topMovies({int limit = 40}) {
    return _list('$cinemetaTopBase/movie/top.json', 'movie', limit);
  }

  Future<List<CatalogTitle>> topSeries({int limit = 40}) {
    return _list('$cinemetaTopBase/series/top.json', 'series', limit);
  }

  Future<List<CatalogTitle>> searchMovies(String query) {
    return _search(query, 'movie');
  }

  Future<List<CatalogTitle>> searchSeries(String query) {
    return _search(query, 'series');
  }

  Future<CatalogTitle> getMovie(String imdbId) async {
    final data = await _fetchJson(
      '$cinemetaSearchBase/meta/movie/${Uri.encodeComponent(imdbId)}.json',
    );
    final meta = data?['meta'];
    if (meta is! Map) {
      throw ApiException(message: 'Movie not found', statusCode: 404);
    }
    final title = titleFromCinemeta(
      {...Map<String, dynamic>.from(meta), 'type': 'movie'},
      'movie',
    );
    if (title == null) {
      throw ApiException(message: 'Movie not found', statusCode: 404);
    }
    return title;
  }

  Future<SeriesMeta> getSeries(String imdbId) async {
    final data = await _fetchJson(
      '$cinemetaSearchBase/meta/series/${Uri.encodeComponent(imdbId)}.json',
    );
    final meta = data?['meta'];
    if (meta is! Map) {
      throw ApiException(message: 'Series not found', statusCode: 404);
    }
    final series = seriesMetaFromCinemeta(Map<String, dynamic>.from(meta));
    if (series == null) {
      throw ApiException(message: 'Series not found', statusCode: 404);
    }
    return series;
  }

  Future<List<CatalogTitle>> _search(String query, String type) async {
    final encoded = Uri.encodeComponent(query.trim());
    if (encoded.isEmpty) return const [];
    return _list(
      '$cinemetaSearchBase/catalog/$type/top/search=$encoded.json',
      type,
      80,
    );
  }

  Future<List<CatalogTitle>> _list(
    String url,
    String type,
    int limit,
  ) async {
    final data = await _fetchJson(url);
    final metas = data?['metas'];
    if (metas is! List) return const [];
    final titles = <CatalogTitle>[];
    for (final raw in metas) {
      if (raw is! Map) continue;
      final title = titleFromCinemeta(Map<String, dynamic>.from(raw), type);
      if (title != null) titles.add(title);
      if (titles.length >= limit) break;
    }
    return titles;
  }

  Future<Map<String, dynamic>?> _fetchJson(String url) async {
    Object? lastError;
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        final res = await _dio.get<dynamic>(
          url,
          options: Options(
            headers: const {'Accept': 'application/json'},
            receiveTimeout: const Duration(seconds: 20),
            sendTimeout: const Duration(seconds: 20),
            validateStatus: (code) => code != null && code < 500,
          ),
        );
        final code = res.statusCode ?? 0;
        if (code == 404) return null;
        if (code == 504 || code == 502 || code == 429) {
          lastError = ApiException(message: 'Cinemeta error: $code');
          await Future<void>.delayed(Duration(milliseconds: 400 * (attempt + 1)));
          continue;
        }
        if (code < 200 || code >= 300) {
          throw ApiException(message: 'Cinemeta error: $code', statusCode: code);
        }
        final body = res.data;
        if (body is Map<String, dynamic>) return body;
        if (body is Map) return Map<String, dynamic>.from(body);
        throw ApiException(message: 'Cinemeta returned an unexpected response');
      } on ApiException {
        rethrow;
      } catch (err) {
        lastError = err;
        if (attempt < 2) {
          await Future<void>.delayed(Duration(milliseconds: 400 * (attempt + 1)));
        }
      }
    }
    throw _asCatalogError(lastError, 'Cinemeta request failed');
  }
}

ApiException _asCatalogError(Object? err, String fallback) {
  if (err is ApiException) return err;
  if (err is DioException) {
    if (err.type == DioExceptionType.connectionTimeout ||
        err.type == DioExceptionType.receiveTimeout ||
        err.type == DioExceptionType.sendTimeout) {
      return ApiException(message: 'Cinemeta request timed out');
    }
    if (err.type == DioExceptionType.connectionError) {
      return ApiException(
        message: 'Cannot reach Cinemeta. Check your internet connection.',
      );
    }
  }
  return ApiException(message: fallback);
}
