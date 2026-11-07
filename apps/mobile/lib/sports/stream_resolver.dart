import '../core/errors.dart';
import 'html_client.dart';
import 'listing.dart';

class ResolvedSportStream {
  const ResolvedSportStream({required this.streamUrl, required this.headers});

  final String streamUrl;
  final Map<String, String> headers;
}

final _playlistRe = RegExp(
  r'''https?:\/\/[^\s'"]+\/playlist\/\d+\/load-playlist''',
);

String embedPageUrl(SportFeed feed, String embedId) {
  return '${feed.embedHost}${feed.embedPath.replaceAll('{id}', embedId)}';
}

String? extractEmbedId(String html, SportFeed feed) {
  final host = Uri.parse(feed.embedHost).host;
  final pieces = feed.embedPath.split('{id}');
  final pattern =
      RegExp.escape(host) + pieces.map(RegExp.escape).join(r'(\d+)');
  final match = RegExp(pattern, caseSensitive: false).firstMatch(html);
  return match?.group(1);
}

String? extractPlaylistUrl(String html) {
  return _playlistRe.firstMatch(html)?.group(0);
}

Future<ResolvedSportStream> resolveSportFeed(
  SportFeed feed,
  HtmlGet getText,
) async {
  final eventHtml = await getText(
    feed.eventUrl,
    headers: {'Referer': feed.referer},
  );
  final embedId = extractEmbedId(eventHtml, feed);
  if (embedId == null || embedId.isEmpty) {
    throw SportsScrapeException('No stream embed found on ${feed.siteName}.');
  }

  final embedUrl = embedPageUrl(feed, embedId);
  final embedHtml = await getText(embedUrl, headers: {'Referer': feed.referer});
  final playlist = extractPlaylistUrl(embedHtml);
  if (playlist == null || playlist.isEmpty) {
    throw SportsScrapeException('No playlist found for ${feed.siteName}.');
  }

  final embedOrigin = feed.origin.endsWith('/')
      ? feed.origin.substring(0, feed.origin.length - 1)
      : feed.origin;
  return ResolvedSportStream(
    streamUrl: playlist,
    headers: {
      'User-Agent': sportsUserAgent,
      'Referer': '$embedOrigin/',
      'Origin': embedOrigin,
    },
  );
}
