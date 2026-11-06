import 'package:dio/dio.dart';

import '../core/errors.dart';
import 'cinemeta_client.dart';
import 'debrid_ready.dart';
import 'models.dart';
import 'torrentio.dart';

class _CachedStreams {
  _CachedStreams(this.at, this.streams);

  final DateTime at;
  final List<CatalogStreamOption> streams;
}

/// Movies and series on the device: Cinemeta for titles, Torrentio for files.
class CatalogClient {
  CatalogClient({
    required String stremioAddonUrl,
    this.maxResolution = 720,
    Dio? dio,
    CinemetaClient? cinemeta,
  })  : _addonUrl = stremioAddonUrl,
        _dio = dio ?? Dio(),
        _cinemeta = cinemeta ?? CinemetaClient(dio: dio);

  final String _addonUrl;
  final int maxResolution;
  final Dio _dio;
  final CinemetaClient _cinemeta;
  final Map<String, _CachedStreams> _streamCache = {};

  static const playbackHeaders = {'User-Agent': kMediaUserAgent};
  static const _cacheTtl = Duration(seconds: 120);

  bool get isConfigured => _addonUrl.trim().isNotEmpty;

  Future<List<CatalogTitle>> topMovies() => _cinemeta.topMovies();

  Future<List<CatalogTitle>> topSeries() => _cinemeta.topSeries();

  Future<List<CatalogTitle>> searchMovies(String query) =>
      _cinemeta.searchMovies(query);

  Future<List<CatalogTitle>> searchSeries(String query) =>
      _cinemeta.searchSeries(query);

  Future<CatalogTitle> getMovie(String imdbId) => _cinemeta.getMovie(imdbId);

  Future<SeriesMeta> getSeries(String imdbId) => _cinemeta.getSeries(imdbId);

  Future<CatalogStreamsResponse> listMovieStreams(String imdbId) async {
    final raw = await fetchTorrentioStreams(
      _dio,
      _requireAddon(),
      '/stream/movie/${Uri.encodeComponent(imdbId)}.json',
    );
    final ranked = _rankPlayable(raw);
    _streamCache['movie:$imdbId'] = _CachedStreams(DateTime.now(), ranked);
    return CatalogStreamsResponse(
      imdbId: imdbId,
      provider: 'torrentio',
      streams: ranked,
    );
  }

  Future<CatalogStreamsResponse> listSeriesStreams({
    required String imdbId,
    required int season,
    required int episode,
  }) async {
    final raw = await fetchTorrentioStreams(
      _dio,
      _requireAddon(),
      '/stream/series/${Uri.encodeComponent(imdbId)}:$season:$episode.json',
    );
    final ranked = _rankPlayable(raw);
    _streamCache['series:$imdbId:$season:$episode'] =
        _CachedStreams(DateTime.now(), ranked);
    return CatalogStreamsResponse(
      imdbId: imdbId,
      provider: 'torrentio',
      streams: ranked,
    );
  }

  Future<String> resolveMovieStreamUrl(String imdbId, int streamIndex) async {
    return _resolve('movie:$imdbId', streamIndex, () => listMovieStreams(imdbId));
  }

  Future<String> resolveSeriesStreamUrl({
    required String imdbId,
    required int season,
    required int episode,
    required int streamIndex,
  }) {
    return _resolve(
      'series:$imdbId:$season:$episode',
      streamIndex,
      () => listSeriesStreams(
        imdbId: imdbId,
        season: season,
        episode: episode,
      ),
    );
  }

  Future<void> waitForPlayable(
    String url, {
    void Function(String reason, int attempt)? onPending,
  }) {
    return waitForPlayableRemoteUrl(url, dio: _dio, onPending: onPending);
  }

  String _requireAddon() {
    final addon = _addonUrl.trim();
    if (addon.isEmpty) {
      throw ApiException(
        message: 'Paste your Torrentio addon URL in Settings to load streams.',
      );
    }
    return addon;
  }

  List<CatalogStreamOption> _rankPlayable(List<RawTorrentioStream> raw) {
    final playable = raw.where((stream) => stream.url.isNotEmpty).toList();
    if (raw.isNotEmpty && playable.isEmpty) {
      throw ApiException(
        message:
            'Torrentio returned no direct links. Use an addon URL configured with RealDebrid.',
        code: 'STREAM_UNAVAILABLE',
      );
    }
    return rankStreams(playable, maxResolution);
  }

  Future<String> _resolve(
    String key,
    int streamIndex,
    Future<CatalogStreamsResponse> Function() refresh,
  ) async {
    var cached = _streamCache[key];
    if (cached == null || DateTime.now().difference(cached.at) > _cacheTtl) {
      await refresh();
      cached = _streamCache[key];
    }
    for (final stream in cached?.streams ?? const <CatalogStreamOption>[]) {
      if (stream.index == streamIndex && stream.url.isNotEmpty) {
        return stream.url;
      }
    }
    throw ApiException(
      message: 'Stream option not found. Refresh the stream list and try again.',
    );
  }
}
