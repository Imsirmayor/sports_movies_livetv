import 'dart:convert';
import 'dart:io';

/// Serves a live playlist on localhost so ExoPlayer receives `.m3u8` / `.ts`
/// responses. Upstream segments are often `.txt` with `Content-Type: text/plain`,
/// which the Android player rejects.
class LocalHlsProxy {
  LocalHlsProxy({required this.upstream, required this.headers});

  final String upstream;
  final Map<String, String> headers;

  HttpServer? _server;
  final HttpClient _client = HttpClient()
    ..connectionTimeout = const Duration(seconds: 15);

  Future<String> start() async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    _server = server;
    server.listen(_handle, onError: (_) {});
    return 'http://127.0.0.1:${server.port}/master.m3u8';
  }

  Future<void> close() async {
    _client.close(force: true);
    await _server?.close(force: true);
    _server = null;
  }

  Future<void> _handle(HttpRequest request) async {
    final port = _server?.port;
    if (port == null) {
      request.response.statusCode = HttpStatus.serviceUnavailable;
      await request.response.close();
      return;
    }

    try {
      final target = request.uri.path == '/master.m3u8'
          ? upstream
          : request.uri.queryParameters['u'];
      if (target == null || target.isEmpty) {
        request.response.statusCode = HttpStatus.badRequest;
        await request.response.close();
        return;
      }

      final fetched = await _get(Uri.parse(target));
      if (fetched.statusCode < 200 || fetched.statusCode >= 300) {
        request.response.statusCode = fetched.statusCode;
        return;
      }

      final text = _asPlaylist(fetched.body);
      if (text != null) {
        request.response.headers.set(
          HttpHeaders.contentTypeHeader,
          'application/vnd.apple.mpegurl',
        );
        request.response.write(
          rewritePlaylist(
            text,
            base: Uri.parse(target),
            port: port,
          ),
        );
      } else {
        request.response.headers.set(
          HttpHeaders.contentTypeHeader,
          'video/mp2t',
        );
        request.response.add(fetched.body);
      }
    } catch (_) {
      request.response.statusCode = HttpStatus.badGateway;
    } finally {
      await request.response.close();
    }
  }

  Future<({int statusCode, List<int> body})> _get(Uri uri) async {
    final req = await _client.getUrl(uri);
    headers.forEach((name, value) {
      if (value.isEmpty) return;
      req.headers.set(name, value);
    });
    final res = await req.close();
    final bytes = await res.fold<List<int>>(<int>[], (prev, chunk) {
      prev.addAll(chunk);
      return prev;
    });
    return (statusCode: res.statusCode, body: bytes);
  }
}

String? _asPlaylist(List<int> body) {
  if (body.isEmpty || body.first != 0x23) return null;
  final text = utf8.decode(body, allowMalformed: true);
  if (text.trimLeft().startsWith('#EXTM3U')) return text;
  return null;
}

/// Rewrite media URLs in an HLS playlist onto this proxy.
String rewritePlaylist(
  String playlist, {
  required Uri base,
  required int port,
}) {
  final lines = playlist.split(RegExp(r'\r?\n'));
  final rewritten = lines.map((line) {
    final trimmed = line.trim();
    if (trimmed.isEmpty || trimmed.startsWith('#')) return line;
    final absolute = base.resolve(trimmed).toString();
    return 'http://127.0.0.1:$port/media?u=${Uri.encodeQueryComponent(absolute)}';
  });
  return rewritten.join('\n');
}
