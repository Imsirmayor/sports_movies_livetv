import 'package:dio/dio.dart';

import '../core/errors.dart';

const sportsUserAgent =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

typedef HtmlGet =
    Future<String> Function(String url, {Map<String, String>? headers});

class HtmlClient {
  HtmlClient({Dio? dio})
    : _dio =
          dio ??
          Dio(
            BaseOptions(
              connectTimeout: const Duration(seconds: 10),
              receiveTimeout: const Duration(seconds: 10),
              responseType: ResponseType.plain,
              followRedirects: true,
              validateStatus: (code) =>
                  code != null && code >= 200 && code < 400,
            ),
          );

  final Dio _dio;

  Future<String> getText(String url, {Map<String, String>? headers}) async {
    try {
      final response = await _dio.get<String>(
        url,
        options: Options(
          responseType: ResponseType.plain,
          headers: {
            'User-Agent': sportsUserAgent,
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            ...?headers,
          },
        ),
      );
      final body = response.data;
      if (body == null || body.isEmpty) {
        throw SportsScrapeException('Empty response from $url');
      }
      return body;
    } on SportsScrapeException {
      rethrow;
    } on DioException catch (e) {
      final code = e.response?.statusCode;
      if (code != null) {
        throw SportsScrapeException('HTTP $code fetching $url');
      }
      throw SportsScrapeException('Could not fetch $url');
    }
  }
}
