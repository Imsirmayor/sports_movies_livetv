import 'package:dio/dio.dart';

import '../core/config.dart';
import '../core/errors.dart';
import 'ads.dart';
import 'models.dart';

class FrankensteinApi {
  FrankensteinApi(this.config) {
    _dio = Dio(
      BaseOptions(
        baseUrl: config.apiRoot.toString(),
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 30),
        headers: {
          'Accept': 'application/json',
          if (config.hasToken) 'Authorization': 'Bearer ${config.apiToken}',
        },
      ),
    );
  }

  final AppConfig config;
  late final Dio _dio;

  Map<String, String> get authHeaders => {
        if (config.hasToken) 'Authorization': 'Bearer ${config.apiToken}',
      };

  /// Absolute playlist URL including auth-required path.
  /// R2 / CDN returns a full `https://…` URL — leave it unchanged.
  String? absolutePlaylistUrl(String? playlistUrl) {
    if (playlistUrl == null || playlistUrl.isEmpty) return null;
    if (playlistUrl.startsWith('http://') || playlistUrl.startsWith('https://')) {
      return playlistUrl;
    }
    final base = config.apiBaseUrl.replaceAll(RegExp(r'/$'), '');
    if (playlistUrl.startsWith('/api/')) {
      return '$base$playlistUrl';
    }
    if (playlistUrl.startsWith('/')) {
      return '$base$playlistUrl';
    }
    return '$base/api/$playlistUrl';
  }

  /// Bearer only for API-hosted HLS. Public R2/CDN playlists must stay unauthenticated.
  Map<String, String> playlistHttpHeaders(String absoluteUrl) {
    final apiBase = config.apiBaseUrl.replaceAll(RegExp(r'/$'), '');
    final isApiHosted = absoluteUrl.startsWith(apiBase) ||
        absoluteUrl.contains('/api/playback/');
    if (isApiHosted) return authHeaders;
    return const {};
  }

  Future<T> _get<T>(
    String path, {
    Map<String, dynamic>? query,
    required T Function(dynamic data) parse,
    Duration? receiveTimeout,
  }) async {
    try {
      final res = await _dio.get(
        path,
        queryParameters: query,
        options: receiveTimeout == null
            ? null
            : Options(receiveTimeout: receiveTimeout),
      );
      return parse(res.data);
    } on DioException catch (e) {
      throw _mapDio(e);
    }
  }

  Future<T> _post<T>(
    String path, {
    Object? body,
    required T Function(dynamic data) parse,
    Duration? receiveTimeout,
  }) async {
    try {
      final res = await _dio.post(
        path,
        data: body,
        options: Options(
          contentType: 'application/json',
          receiveTimeout: receiveTimeout ?? const Duration(seconds: 120),
        ),
      );
      return parse(res.data);
    } on DioException catch (e) {
      throw _mapDio(e);
    }
  }

  Future<T> _delete<T>(
    String path, {
    required T Function(dynamic data) parse,
  }) async {
    try {
      final res = await _dio.delete(path);
      return parse(res.data);
    } on DioException catch (e) {
      throw _mapDio(e);
    }
  }

  ApiException _mapDio(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['error'] is Map) {
      final err = data['error'] as Map;
      return ApiException(
        message: err['message']?.toString() ?? e.message ?? 'Request failed',
        statusCode: e.response?.statusCode,
        code: err['code']?.toString(),
        details: err['details'],
      );
    }
    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout ||
        e.type == DioExceptionType.sendTimeout) {
      return ApiException(message: 'Request timed out');
    }
    if (e.type == DioExceptionType.connectionError) {
      return ApiException(
        message:
            'Cannot reach API at ${config.apiBaseUrl}. Is the server running?',
      );
    }
    return ApiException(
      message: e.message ?? 'Network request failed',
      statusCode: e.response?.statusCode,
    );
  }

  Future<HealthStatus> getHealth() => _get(
        '/health',
        parse: (d) => HealthStatus.fromJson(d as Map<String, dynamic>),
      );

  Future<SportsListResponse> listSports() => _get(
        '/sports',
        parse: (d) => SportsListResponse.fromJson(d as Map<String, dynamic>),
      );

  Future<SportEventsResponse> searchSportsEvents({
    String? q,
    String? team,
    String? sport,
    String? competition,
    String? status,
  }) {
    return _get(
      '/sports/events',
      query: {
        if (q != null && q.isNotEmpty) 'q': q,
        if (team != null && team.isNotEmpty) 'team': team,
        if (sport != null && sport.isNotEmpty) 'sport': sport,
        if (competition != null && competition.isNotEmpty)
          'competition': competition,
        if (status != null && status.isNotEmpty) 'status': status,
      },
      parse: (d) => SportEventsResponse.fromJson(d as Map<String, dynamic>),
    );
  }

  Future<SportEvent> getSportEvent(String id, {bool embed = false}) => _get(
        '/sports/events/${Uri.encodeComponent(id)}',
        query: embed ? {'embed': '1'} : null,
        receiveTimeout: embed ? const Duration(seconds: 60) : null,
        parse: (d) => SportEvent.fromJson(d as Map<String, dynamic>),
      );

  Future<PlaybackSession> startSportsPlayback(String eventId) => _post(
        '/sports/playback',
        body: {'eventId': eventId},
        receiveTimeout: const Duration(seconds: 180),
        parse: (d) => PlaybackSession.fromJson(d as Map<String, dynamic>),
      );

  Future<CatalogListResponse> listCatalogMovies() => _get(
        '/catalog/movies',
        parse: (d) => CatalogListResponse.fromJson(d as Map<String, dynamic>),
      );

  Future<CatalogSearchResponse> searchCatalogMovies(String query) => _get(
        '/catalog/movies/search',
        query: {'q': query},
        parse: (d) => CatalogSearchResponse.fromJson(d as Map<String, dynamic>),
      );

  Future<CatalogTitle> getCatalogMovie(String imdbId) => _get(
        '/catalog/movies/${Uri.encodeComponent(imdbId)}',
        parse: (d) => CatalogTitle.fromJson(d as Map<String, dynamic>),
      );

  Future<CatalogStreamsResponse> listCatalogMovieStreams(String imdbId) =>
      _get(
        '/catalog/movies/${Uri.encodeComponent(imdbId)}/streams',
        receiveTimeout: const Duration(seconds: 60),
        parse: (d) =>
            CatalogStreamsResponse.fromJson(d as Map<String, dynamic>),
      );

  Future<PlaybackSession> startCatalogMoviePlayback({
    required String imdbId,
    required int streamIndex,
    String? preferredAudioLang,
  }) =>
      _post(
        '/catalog/movies/playback',
        body: {
          'imdbId': imdbId,
          'streamIndex': streamIndex,
          if (preferredAudioLang != null && preferredAudioLang != 'any')
            'preferredAudioLang': preferredAudioLang,
        },
        receiveTimeout: const Duration(seconds: 120),
        parse: (d) => PlaybackSession.fromJson(d as Map<String, dynamic>),
      );

  Future<CatalogListResponse> listCatalogSeries() => _get(
        '/catalog/series',
        parse: (d) => CatalogListResponse.fromJson(d as Map<String, dynamic>),
      );

  Future<CatalogSearchResponse> searchCatalogSeries(String query) => _get(
        '/catalog/series/search',
        query: {'q': query},
        parse: (d) => CatalogSearchResponse.fromJson(d as Map<String, dynamic>),
      );

  Future<SeriesMeta> getCatalogSeries(String imdbId) => _get(
        '/catalog/series/${Uri.encodeComponent(imdbId)}',
        parse: (d) => SeriesMeta.fromJson(d as Map<String, dynamic>),
      );

  Future<CatalogStreamsResponse> listCatalogSeriesStreams({
    required String imdbId,
    required int season,
    required int episode,
  }) =>
      _get(
        '/catalog/series/${Uri.encodeComponent(imdbId)}/streams',
        query: {'season': season, 'episode': episode},
        receiveTimeout: const Duration(seconds: 60),
        parse: (d) =>
            CatalogStreamsResponse.fromJson(d as Map<String, dynamic>),
      );

  /// Best-effort RealDebrid / remux warm for a series episode.
  Future<void> warmCatalogSeries({
    required String imdbId,
    required int season,
    required int episode,
  }) async {
    try {
      await _dio.post(
        '/catalog/series/${Uri.encodeComponent(imdbId)}/warm',
        queryParameters: {'season': season, 'episode': episode},
        data: <String, dynamic>{},
        options: Options(
          receiveTimeout: const Duration(seconds: 15),
          validateStatus: (code) => code != null && code < 500,
        ),
      );
    } catch (_) {
      /* fire-and-forget */
    }
  }

  Future<PlaybackSession> startCatalogSeriesPlayback({
    required String imdbId,
    required int season,
    required int episode,
    required int streamIndex,
    String? preferredAudioLang,
  }) =>
      _post(
        '/catalog/series/playback',
        body: {
          'imdbId': imdbId,
          'season': season,
          'episode': episode,
          'streamIndex': streamIndex,
          if (preferredAudioLang != null && preferredAudioLang != 'any')
            'preferredAudioLang': preferredAudioLang,
        },
        receiveTimeout: const Duration(seconds: 120),
        parse: (d) => PlaybackSession.fromJson(d as Map<String, dynamic>),
      );

  Future<AdsConfig> getAdsConfig() => _get(
        '/ads/config',
        parse: (d) => AdsConfig.fromJson(d as Map<String, dynamic>),
      );

  Future<AdsPrerollDecision> requestPreroll({
    required String platform,
    String? contentType,
    String? contentId,
  }) =>
      _post(
        '/ads/preroll',
        body: {
          'platform': platform,
          if (contentType != null) 'contentType': contentType,
          if (contentId != null) 'contentId': contentId,
        },
        receiveTimeout: const Duration(seconds: 15),
        parse: (d) =>
            AdsPrerollDecision.fromJson(d as Map<String, dynamic>),
      );

  Future<void> trackAdEvent({
    required String decisionId,
    required String event,
    String? network,
    String? platform,
    String? message,
  }) async {
    try {
      await _dio.post(
        '/ads/events',
        data: {
          'decisionId': decisionId,
          'event': event,
          if (network != null) 'network': network,
          if (platform != null) 'platform': platform,
          if (message != null) 'message': message,
        },
        options: Options(
          receiveTimeout: const Duration(seconds: 10),
          validateStatus: (code) => code != null && code < 500,
        ),
      );
    } catch (_) {
      /* best-effort beacon */
    }
  }

  Future<PlaybackSession> getPlayback(String sessionId) => _get(
        '/playback/${Uri.encodeComponent(sessionId)}',
        parse: (d) => PlaybackSession.fromJson(d as Map<String, dynamic>),
      );

  Future<PlaybackSession> stopPlayback(String sessionId) => _delete(
        '/playback/${Uri.encodeComponent(sessionId)}',
        parse: (d) => PlaybackSession.fromJson(d as Map<String, dynamic>),
      );
}
