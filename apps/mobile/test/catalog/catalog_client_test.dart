import 'package:flutter_test/flutter_test.dart';
import 'package:pulse_stream/data/cinemeta_client.dart';
import 'package:pulse_stream/data/debrid_ready.dart';
import 'package:pulse_stream/data/torrentio.dart';

void main() {
  test('titleFromCinemeta prefers the IMDb id and drops empty rows', () {
    final title = titleFromCinemeta({
      'id': 'local',
      'imdb_id': 'tt123',
      'name': 'Example',
      'year': 2024,
      'poster': 'https://img.example/p.jpg',
    }, 'movie');
    expect(title, isNotNull);
    expect(title!.id, 'tt123');
    expect(title.year, '2024');
    expect(title.poster, 'https://img.example/p.jpg');
    expect(title.type, 'movie');

    expect(
      titleFromCinemeta({'id': 'tt9'}, 'movie'),
      isNull,
    );
  });

  test('seriesMetaFromCinemeta skips season 0 and sorts episodes', () {
    final series = seriesMetaFromCinemeta({
      'imdb_id': 'tt999',
      'name': 'Show',
      'poster': '',
      'videos': [
        {'season': 1, 'episode': 2, 'name': 'Second'},
        {'season': 0, 'episode': 1, 'name': 'Special'},
        {'season': 1, 'episode': 1, 'name': 'Pilot', 'overview': 'Start'},
        {'season': 2, 'episode': 1, 'name': 'Return'},
      ],
    });
    expect(series, isNotNull);
    expect(series!.id, 'tt999');
    expect(series.poster, isNull);
    expect(series.seasons, [1, 2]);
    expect(
      series.episodes.map((e) => '${e.season}x${e.episode}').toList(),
      ['1x1', '1x2', '2x1'],
    );
    expect(series.episodes.first.overview, 'Start');
  });

  test('isDebridCachedHint detects RD+ and cached markers', () {
    expect(isDebridCachedHint('[RD+] 1080p'), isTrue);
    expect(isDebridCachedHint('Torrentio', '⚡ 720p BluRay'), isTrue);
    expect(isDebridCachedHint('RD download', 'Cached on Real-Debrid'), isTrue);
    expect(isDebridCachedHint('[RD] 1080p'), isFalse);
    expect(isDebridCachedHint('[RD download] 720p'), isFalse);
  });

  test('rankStreams prefers cached links and honors max resolution', () {
    final ranked = rankStreams([
      const RawTorrentioStream(
        name: '[RD download]',
        title: 'Movie\n1080p x264 👤 100 💾 2.0 GB',
        url: 'https://cdn.example/a',
      ),
      const RawTorrentioStream(
        name: '[RD+]',
        title: 'Movie\n720p x264 👤 10 💾 1.0 GB',
        url: 'https://cdn.example/b',
      ),
      const RawTorrentioStream(
        name: '[RD+] 4K',
        title: 'Movie\n2160p x265 👤 400 💾 20 GB',
        url: 'https://cdn.example/4k',
      ),
    ], 1080);

    expect(ranked.first.url, 'https://cdn.example/b');
    expect(ranked.first.cached, isTrue);
    expect(ranked.first.resolution, 720);
    expect(ranked.map((s) => s.resolution), isNot(contains(2160)));
    expect(ranked.first.label, contains('Cached'));
  });

  test('streamsFromTorrentioJson keeps only parsed stream objects', () {
    final streams = streamsFromTorrentioJson({
      'streams': [
        {
          'name': 'Torrentio',
          'title': '720p',
          'url': 'https://cdn.example/file',
          'behaviorHints': {'bingeGroup': '1080p'},
        },
        {'name': 'no-url'},
      ],
    });
    expect(streams, hasLength(2));
    expect(streams.first.bingeGroup, '1080p');
    expect(streams.last.url, isEmpty);
  });
}
