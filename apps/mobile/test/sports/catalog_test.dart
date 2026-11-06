import 'package:flutter_test/flutter_test.dart';
import 'package:pulse_stream/sports/catalog.dart';
import 'package:pulse_stream/sports/hls_proxy.dart';
import 'package:pulse_stream/sports/listing.dart';
import 'package:pulse_stream/sports/sites_config.dart';
import 'package:pulse_stream/sports/stream_resolver.dart';

void main() {
  const sitesJson = '''
{
  "version": 1,
  "sites": [
    {
      "id": "streameast",
      "name": "StreamEast",
      "enabled": true,
      "listUrls": ["https://streameast.cool/"],
      "eventHost": "streameast.cool",
      "embedHost": "https://gooz.aapmains.net",
      "embedPath": "/new-stream-embed/{id}",
      "referer": "https://streameast.cool/",
      "origin": "https://gooz.aapmains.net"
    },
    {
      "id": "mirror",
      "name": "Mirror",
      "enabled": true,
      "listUrls": ["https://mirror.example/soccer"],
      "eventHost": "mirror.example",
      "embedHost": "https://embeds.example",
      "embedPath": "/new-stream-embed/{id}",
      "referer": "https://mirror.example/",
      "origin": "https://embeds.example"
    },
    {
      "id": "off",
      "name": "Disabled",
      "enabled": false,
      "listUrls": ["https://off.example/"],
      "eventHost": "off.example",
      "embedHost": "https://embeds.example",
      "embedPath": "/new-stream-embed/{id}",
      "referer": "https://off.example/",
      "origin": "https://embeds.example"
    }
  ]
}
''';

  const eastHtml = '''
<ul>
  <li class="match-card">
    <a href="https://streameast.cool/laliga/real-madrid-fc-barcelona/46919168">
      <span class="MacBaslik"><span>Real Madrid vs Barcelona</span></span>
    </a>
    <span class="SaatZamanBilgisi btn-live" data-zaman="1640451600"><span>LIVE</span></span>
  </li>
  <li class="match-card">
    <a href="/nba/boston-celtics-miami-heat/12">Celtics</a>
    <span class="SaatZamanBilgisi"><span>2 hours from now</span></span>
  </li>
</ul>
''';

  const mirrorHtml = '''
<ul>
  <li class="match-card">
    <a href="https://mirror.example/laliga/real-madrid-fc-barcelona/999">Madrid</a>
    <span class="SaatZamanBilgisi btn-live"><span>LIVE</span></span>
  </li>
  <li class="match-card">
    <a href="https://mirror.example/nba/boston-celtics-miami-heat-live-stream/44">Heat</a>
    <span class="SaatZamanBilgisi"><span>2 hours from now</span></span>
  </li>
</ul>
''';

  test('built-in sites JSON includes StreamEast', () {
    final sites = parseSitesConfig(sportsSitesJson);
    expect(sites.where((site) => site.enabled), isNotEmpty);
    expect(sites.first.listUrls, ['https://streameast.cool/']);
  });

  test('parses site objects and keeps disabled entries', () {
    final sites = parseSitesConfig(sitesJson);
    expect(sites, hasLength(3));
    expect(sites[1].embedPath, '/new-stream-embed/{id}');
    expect(sites[2].enabled, isFalse);
  });

  test('groups the same slug across listing pages into one event', () {
    final sites = parseSitesConfig(sitesJson);
    final east = parseListingHtml(
      html: eastHtml,
      pageUrl: Uri.parse('https://streameast.cool/'),
      site: sites[0],
    );
    final mirror = parseListingHtml(
      html: mirrorHtml,
      pageUrl: Uri.parse('https://mirror.example/soccer'),
      site: sites[1],
    );

    final catalog = SportsCatalog.group([...east, ...mirror]);
    expect(catalog.events, hasLength(2));

    final madrid = catalog.events.firstWhere(
      (e) => e.id.contains('real-madrid'),
    );
    expect(madrid.sourceCount, 2);
    expect(madrid.isLive, isTrue);
    expect(madrid.displayTitle, 'Real Madrid vs FC Barcelona');
    expect(catalog.feedsFor(madrid.id).map((f) => f.siteName), [
      'StreamEast',
      'Mirror',
    ]);

    final celtics = catalog.events.firstWhere(
      (e) => e.id.contains('boston-celtics'),
    );
    expect(celtics.sourceCount, 2);
    expect(celtics.isLive, isFalse);
    expect(catalog.feedsFor(celtics.id).map((f) => f.eventUrl), [
      'https://streameast.cool/nba/boston-celtics-miami-heat/12',
      'https://mirror.example/nba/boston-celtics-miami-heat-live-stream/44',
    ]);
  });

  test('same event url on two pages counts once', () {
    final site = parseSitesConfig(sitesJson).first;
    final first = parseListingHtml(
      html: eastHtml,
      pageUrl: Uri.parse('https://streameast.cool/'),
      site: site,
    );
    final catalog = SportsCatalog.group([...first, ...first]);
    final madrid = catalog.events.firstWhere(
      (e) => e.id.contains('real-madrid'),
    );
    expect(madrid.sourceCount, 1);
  });

  test(
    'fetch reads the static sites JSON and scrapes its list pages',
    () async {
      final catalog = await fetchSportsCatalog(
        getText: (url, {headers}) async {
          if (url == 'https://streameast.cool/') return eastHtml;
          throw StateError('unexpected $url');
        },
      );

      expect(catalog.events, hasLength(2));
      expect(catalog.events.map((e) => e.sourceCount), everyElement(1));
    },
  );

  test('extracts embed id and playlist from event and embed html', () {
    const feed = SportFeed(
      siteId: 'streameast',
      siteName: 'StreamEast',
      eventUrl:
          'https://streameast.cool/laliga/real-madrid-fc-barcelona/46919168',
      listUrl: 'https://streameast.cool/',
      league: 'laliga',
      slug: 'real-madrid-fc-barcelona',
      status: 'live',
      startTime: null,
      embedHost: 'https://gooz.aapmains.net',
      embedPath: '/new-stream-embed/{id}',
      referer: 'https://streameast.cool/',
      origin: 'https://gooz.aapmains.net',
    );

    final id = extractEmbedId(
      '<iframe src="https://gooz.aapmains.net/new-stream-embed/321"></iframe>',
      feed,
    );
    expect(id, '321');
    expect(
      embedPageUrl(feed, id!),
      'https://gooz.aapmains.net/new-stream-embed/321',
    );
    expect(
      extractPlaylistUrl(
        'const source = "https://cdn.example/playlist/321/load-playlist";',
      ),
      'https://cdn.example/playlist/321/load-playlist',
    );
  });

  test('rewrites playlist media urls onto the local proxy', () {
    final rewritten = rewritePlaylist(
      '#EXTM3U\n'
      '#EXT-X-STREAM-INF:BANDWIDTH=1000\n'
      'https://cdn.example/seg/a.txt\n'
      'relative.ts\n',
      base: Uri.parse('https://cdn.example/playlist/1/load-playlist'),
      port: 9,
    );
    expect(
      rewritten,
      '#EXTM3U\n'
      '#EXT-X-STREAM-INF:BANDWIDTH=1000\n'
      'http://127.0.0.1:9/media?u=https%3A%2F%2Fcdn.example%2Fseg%2Fa.txt\n'
      'http://127.0.0.1:9/media?u=https%3A%2F%2Fcdn.example%2Fplaylist%2F1%2Frelative.ts\n',
    );
  });
}
