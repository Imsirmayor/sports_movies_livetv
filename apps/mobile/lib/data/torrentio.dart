import 'package:dio/dio.dart';

import '../core/errors.dart';
import 'debrid_ready.dart';
import 'models.dart';

class RawTorrentioStream {
  const RawTorrentioStream({
    required this.name,
    required this.title,
    required this.url,
    this.bingeGroup,
  });

  final String name;
  final String title;
  final String url;
  final String? bingeGroup;
}

class _ParsedStream {
  const _ParsedStream({
    required this.stream,
    required this.resolution,
    required this.codec,
    required this.sizeBytes,
    required this.seeders,
    required this.language,
  });

  final RawTorrentioStream stream;
  final int resolution;
  final String codec;
  final num sizeBytes;
  final int seeders;
  final String language;
}

int parseResolution(String title, [String? bingeGroup]) {
  final combined = '$title ${bingeGroup ?? ''}';
  if (RegExp(r'2160p|4k', caseSensitive: false).hasMatch(combined)) return 2160;
  if (RegExp(r'1080p', caseSensitive: false).hasMatch(combined)) return 1080;
  if (RegExp(r'720p', caseSensitive: false).hasMatch(combined)) return 720;
  if (RegExp(r'480p', caseSensitive: false).hasMatch(combined)) return 480;
  if (RegExp(r'360p', caseSensitive: false).hasMatch(combined)) return 360;
  return 0;
}

String parseCodec(String title, [String? bingeGroup]) {
  final combined = '$title ${bingeGroup ?? ''}';
  if (RegExp(r'x265|h\.?265|hevc', caseSensitive: false).hasMatch(combined)) {
    return 'h265';
  }
  if (RegExp(r'x264|h\.?264|avc', caseSensitive: false).hasMatch(combined)) {
    return 'h264';
  }
  if (RegExp(r'av1', caseSensitive: false).hasMatch(combined)) return 'av1';
  return 'unknown';
}

num parseSizeBytes(String title) {
  final match = RegExp(
    r'💾\s*([\d.]+)\s*(GB|MB|TB)',
    caseSensitive: false,
  ).firstMatch(title);
  if (match == null) return 0;
  final value = double.tryParse(match.group(1)!) ?? 0;
  final unit = match.group(2)!.toUpperCase();
  if (unit == 'TB') return value * 1024 * 1024 * 1024 * 1024;
  if (unit == 'GB') return value * 1024 * 1024 * 1024;
  return value * 1024 * 1024;
}

int parseSeeders(String title) {
  final match = RegExp(r'👤\s*(\d+)').firstMatch(title);
  if (match == null) return 0;
  return int.tryParse(match.group(1)!) ?? 0;
}

String parseLanguage(String title) {
  final flagMatch = RegExp(
    r'[\u{1F1E6}-\u{1F1FF}]{2}(?:\s*/\s*[\u{1F1E6}-\u{1F1FF}]{2})*',
    unicode: true,
  ).firstMatch(title);
  if (flagMatch != null) return flagMatch.group(0)!;
  final langMatch = RegExp(
    r'\b(Multi|Dual|ENG|SPA|FRE|GER|ITA|JPN|KOR|RUS|POR|ARA|HIN|CHI)\b',
    caseSensitive: false,
  ).firstMatch(title);
  return langMatch == null ? '' : langMatch.group(1)!.toUpperCase();
}

String _formatSize(num bytes) {
  if (bytes >= 1024 * 1024 * 1024) {
    return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(1)} GB';
  }
  if (bytes >= 1024 * 1024) {
    return '${(bytes / (1024 * 1024)).toStringAsFixed(0)} MB';
  }
  return '? MB';
}

List<RawTorrentioStream> streamsFromTorrentioJson(Object? body) {
  if (body is! Map) return const [];
  final raw = body['streams'];
  if (raw is! List) return const [];
  final streams = <RawTorrentioStream>[];
  for (final item in raw) {
    if (item is! Map) continue;
    final hints = item['behaviorHints'];
    final binge = hints is Map ? hints['bingeGroup'] as String? : null;
    streams.add(
      RawTorrentioStream(
        name: item['name'] as String? ?? '',
        title: item['title'] as String? ?? '',
        url: item['url'] as String? ?? '',
        bingeGroup: binge,
      ),
    );
  }
  return streams;
}

/// Rank playable HTTP links. Cached RealDebrid sources come first.
List<CatalogStreamOption> rankStreams(
  List<RawTorrentioStream> streams,
  int maxResolution, {
  int count = 8,
}) {
  final parsed = streams
      .map(
        (stream) => _ParsedStream(
          stream: stream,
          resolution: parseResolution(stream.title, stream.bingeGroup),
          codec: parseCodec(stream.title, stream.bingeGroup),
          sizeBytes: parseSizeBytes(stream.title),
          seeders: parseSeeders(stream.title),
          language: parseLanguage(stream.title),
        ),
      )
      .toList();

  final eligible = parsed
      .where((s) => s.resolution > 0 && s.resolution <= maxResolution)
      .toList();
  final withResolution = parsed.where((s) => s.resolution > 0).toList();
  final List<_ParsedStream> list;
  if (eligible.isNotEmpty) {
    list = eligible;
  } else if (withResolution.isNotEmpty) {
    list = withResolution;
  } else {
    list = parsed.take(count).toList();
  }

  int codecScore(String codec) => codec == 'h264' ? 1 : 0;

  list.sort((a, b) {
    final aCached = isDebridCachedHint(a.stream.name, a.stream.title) ? 1 : 0;
    final bCached = isDebridCachedHint(b.stream.name, b.stream.title) ? 1 : 0;
    if (aCached != bCached) return bCached - aCached;
    if (a.seeders != b.seeders) return b.seeders - a.seeders;
    if (a.resolution != b.resolution) return b.resolution - a.resolution;
    if (codecScore(a.codec) != codecScore(b.codec)) {
      return codecScore(b.codec) - codecScore(a.codec);
    }
    return b.sizeBytes.compareTo(a.sizeBytes);
  });

  return list.take(count).toList().asMap().entries.map((entry) {
    final index = entry.key;
    final item = entry.value;
    final cached = isDebridCachedHint(item.stream.name, item.stream.title);
    final resolutionLabel = item.resolution == 0 ? '?' : '${item.resolution}';
    final language = item.language.isEmpty ? '' : ' | ${item.language}';
    return CatalogStreamOption(
      index: index,
      name: item.stream.name,
      url: item.stream.url,
      resolution: item.resolution,
      codec: item.codec,
      sizeBytes: item.sizeBytes,
      seeders: item.seeders,
      language: item.language,
      cached: cached,
      label:
          '${index + 1}. ${cached ? 'Cached · ' : ''}${resolutionLabel}p ${item.codec.toUpperCase()} | ${_formatSize(item.sizeBytes)} | ${item.seeders} seeds$language',
    );
  }).toList();
}

Future<List<RawTorrentioStream>> fetchTorrentioStreams(
  Dio dio,
  String addonUrl,
  String path,
) async {
  final base = addonUrl.trim().replaceAll(RegExp(r'/+$'), '');
  if (base.isEmpty) {
    throw ApiException(
      message: 'Paste your Torrentio addon URL in Settings to load streams.',
    );
  }
  try {
    final res = await dio.get<dynamic>(
      '$base$path',
      options: Options(
        headers: const {'Accept': 'application/json'},
        receiveTimeout: const Duration(seconds: 30),
        sendTimeout: const Duration(seconds: 20),
        validateStatus: (code) => code != null && code < 500,
      ),
    );
    final code = res.statusCode ?? 0;
    if (code < 200 || code >= 300) {
      throw ApiException(
        message: 'Torrentio error: $code',
        statusCode: code,
        code: 'STREAM_UNAVAILABLE',
      );
    }
    return streamsFromTorrentioJson(res.data);
  } on ApiException {
    rethrow;
  } on DioException catch (err) {
    if (err.type == DioExceptionType.connectionTimeout ||
        err.type == DioExceptionType.receiveTimeout ||
        err.type == DioExceptionType.sendTimeout) {
      throw ApiException(message: 'Torrentio request timed out');
    }
    if (err.type == DioExceptionType.connectionError) {
      throw ApiException(
        message: 'Cannot reach the Torrentio addon. Check the URL in Settings.',
      );
    }
    throw ApiException(message: err.message ?? 'Failed to list streams');
  }
}
