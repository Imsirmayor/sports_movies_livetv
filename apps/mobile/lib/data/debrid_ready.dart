import 'dart:convert';

import 'package:dio/dio.dart';

import '../core/errors.dart';

/// RealDebrid / Torrentio links often serve a short "downloading…" stub
/// until the torrent is cached. Probe before handing the URL to the player.
const kMediaUserAgent = 'FrankensteinMedia/1.0';

const _stubMarkers = [
  'Torrent is being downloaded to debrid',
  'Access denied',
  'valid debrid subscription',
  'Infringing file',
  'not cached on Real-Debrid',
];

/// Placeholder status videos from RealDebrid are short. Real movies are larger.
const stubMaxBytes = 25 * 1024 * 1024;

class DebridProbeResult {
  const DebridProbeResult(this.status, [this.reason = '']);

  final String status;
  final String reason;

  bool get isReady => status == 'ready';
  bool get isDenied => status == 'denied';
  bool get isError => status == 'error';
}

bool isDebridCachedHint(String name, [String title = '']) {
  final combined = '$name\n$title';
  if (RegExp(r'\[RD\+\]', caseSensitive: false).hasMatch(combined)) return true;
  if (combined.contains('⚡')) return true;
  if (RegExp(r'\bcached\b', caseSensitive: false).hasMatch(combined)) {
    return true;
  }
  return false;
}

int _fullSizeFromHeaders(Headers headers) {
  final range = headers.value('content-range');
  if (range != null) {
    final match = RegExp(r'/(\d+)\s*$').firstMatch(range);
    if (match != null) return int.tryParse(match.group(1)!) ?? 0;
  }
  final length = headers.value('content-length');
  if (length != null) return int.tryParse(length) ?? 0;
  return 0;
}

Future<DebridProbeResult> probeRemoteMediaUrl(
  String url, {
  Dio? dio,
}) async {
  final client = dio ?? Dio();
  Response<List<int>> res;
  try {
    res = await client.get<List<int>>(
      url,
      options: Options(
        headers: const {
          'Range': 'bytes=0-65535',
          'User-Agent': kMediaUserAgent,
        },
        responseType: ResponseType.bytes,
        receiveTimeout: const Duration(seconds: 20),
        sendTimeout: const Duration(seconds: 20),
        followRedirects: true,
        validateStatus: (code) => code != null && code < 500,
      ),
    );
  } catch (err) {
    final reason = err is DioException
        ? (err.message ?? 'Probe request failed')
        : 'Probe request failed';
    return DebridProbeResult('error', reason);
  }

  final code = res.statusCode ?? 0;
  if (code == 401 || code == 403) {
    return DebridProbeResult('denied', 'Remote source returned HTTP $code');
  }
  if (code != 200 && code != 206) {
    return DebridProbeResult('pending', 'Remote source not ready (HTTP $code)');
  }

  final bytes = res.data ?? const <int>[];
  final text = utf8.decode(bytes, allowMalformed: true);
  final lower = text.toLowerCase();
  final contentType = (res.headers.value('content-type') ?? '').toLowerCase();
  final size = _fullSizeFromHeaders(res.headers);

  if (_stubMarkers.any((marker) => lower.contains(marker.toLowerCase()))) {
    if (RegExp(r'access denied|subscription|infringing', caseSensitive: false)
        .hasMatch(text)) {
      return const DebridProbeResult('denied', 'RealDebrid denied this stream');
    }
    return const DebridProbeResult(
      'pending',
      'RealDebrid is still downloading the torrent',
    );
  }

  if (contentType.contains('text/html') ||
      contentType.contains('application/json')) {
    return const DebridProbeResult(
      'pending',
      'Remote source returned a non-media response',
    );
  }

  if (size > 0 && size < stubMaxBytes) {
    return DebridProbeResult(
      'pending',
      'Remote media still looks like a stub (${(size / 1024).round()} KB)',
    );
  }

  if (contentType.contains('video/') ||
      contentType.contains('audio/') ||
      contentType.contains('mpegurl') ||
      contentType.contains('octet-stream') ||
      contentType.contains('mp2t') ||
      size >= stubMaxBytes) {
    return const DebridProbeResult('ready');
  }

  return DebridProbeResult(
    'pending',
    'Unexpected content-type: ${contentType.isEmpty ? 'unknown' : contentType}',
  );
}

/// Poll until the URL looks like real media, or fail with a clear error.
Future<void> waitForPlayableRemoteUrl(
  String url, {
  Dio? dio,
  Duration timeout = const Duration(seconds: 90),
  Duration interval = const Duration(seconds: 3),
  void Function(String reason, int attempt)? onPending,
}) async {
  final started = DateTime.now();
  var attempt = 0;

  while (DateTime.now().difference(started) < timeout) {
    attempt += 1;
    final result = await probeRemoteMediaUrl(url, dio: dio);
    if (result.isReady) return;
    if (result.isDenied) {
      throw ApiException(message: result.reason, code: 'STREAM_UNAVAILABLE');
    }
    if (result.isError &&
        attempt >= 3 &&
        DateTime.now().difference(started) > const Duration(seconds: 15)) {
      throw ApiException(message: result.reason, code: 'STREAM_UNAVAILABLE');
    }
    onPending?.call(
      result.reason.isEmpty ? 'waiting' : result.reason,
      attempt,
    );
    await Future<void>.delayed(interval);
  }

  throw ApiException(
    message:
        'RealDebrid is still preparing this torrent. Pick a Cached (RD+) source or try again in a minute.',
    code: 'STREAM_UNAVAILABLE',
  );
}
