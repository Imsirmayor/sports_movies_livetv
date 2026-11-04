import 'dart:convert';

import '../core/errors.dart';

/// Sites the app scrapes. Values match the StreamEast client in
/// services/api/src/sports/sportsurge.ts. Add another object to `sites` to
/// scrape an extra listing page.
const sportsSitesJson = '''
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
    }
  ]
}
''';

/// One site entry in [sportsSitesJson].
class ScrapeSite {
  const ScrapeSite({
    required this.id,
    required this.name,
    required this.enabled,
    required this.listUrls,
    required this.eventHost,
    required this.embedHost,
    required this.embedPath,
    required this.referer,
    required this.origin,
  });

  final String id;
  final String name;
  final bool enabled;
  final List<String> listUrls;
  final String eventHost;
  final String embedHost;
  final String embedPath;
  final String referer;
  final String origin;

  String get eventHostNormalized => normalizeHost(eventHost);
}

String normalizeHost(String raw) {
  final trimmed = raw.trim();
  if (trimmed.contains('://')) {
    return Uri.parse(
      trimmed,
    ).host.toLowerCase().replaceFirst(RegExp(r'^www\.'), '');
  }
  return trimmed.toLowerCase().replaceFirst(RegExp(r'^www\.'), '');
}

/// Remote document:
/// `{ "version": 1, "sites": [ { ...site } ] }`
List<ScrapeSite> parseSitesConfig(String raw) {
  Object? decoded;
  try {
    decoded = jsonDecode(raw);
  } catch (_) {
    throw SportsScrapeException('Sports sites JSON is invalid.');
  }
  if (decoded is! Map) {
    throw SportsScrapeException(
      'Sports sites JSON must be an object with a sites list.',
    );
  }
  final sitesRaw = decoded['sites'];
  if (sitesRaw is! List) {
    throw SportsScrapeException('Sports sites JSON is missing a sites list.');
  }

  final sites = <ScrapeSite>[];
  for (var i = 0; i < sitesRaw.length; i++) {
    final item = sitesRaw[i];
    if (item is! Map) {
      throw SportsScrapeException('Site entry ${i + 1} must be an object.');
    }
    sites.add(_siteFromMap(item, i));
  }
  return sites;
}

ScrapeSite _siteFromMap(Map<dynamic, dynamic> json, int index) {
  final id = (json['id'] as String?)?.trim() ?? '';
  final label = id.isEmpty ? 'Site ${index + 1}' : id;
  final name = (json['name'] as String?)?.trim() ?? '';
  final listRaw = json['listUrls'];
  final listUrls = listRaw is List
      ? listRaw
            .map((e) => e.toString().trim())
            .where((e) => e.isNotEmpty)
            .toList()
      : const <String>[];
  final eventHost = (json['eventHost'] as String?)?.trim() ?? '';
  final embedHost = (json['embedHost'] as String?)?.trim() ?? '';
  final embedPath = (json['embedPath'] as String?)?.trim() ?? '';
  final referer = (json['referer'] as String?)?.trim() ?? '';
  final origin = (json['origin'] as String?)?.trim() ?? '';

  final missing = <String>[
    if (id.isEmpty) 'id',
    if (name.isEmpty) 'name',
    if (listUrls.isEmpty) 'listUrls',
    if (eventHost.isEmpty) 'eventHost',
    if (embedHost.isEmpty) 'embedHost',
    if (embedPath.isEmpty || !embedPath.contains('{id}')) 'embedPath',
    if (referer.isEmpty) 'referer',
    if (origin.isEmpty) 'origin',
  ];
  if (missing.isNotEmpty) {
    throw SportsScrapeException('$label is missing ${missing.join(', ')}.');
  }

  return ScrapeSite(
    id: id,
    name: name,
    enabled: json['enabled'] as bool? ?? true,
    listUrls: listUrls,
    eventHost: eventHost,
    embedHost: embedHost.endsWith('/')
        ? embedHost.substring(0, embedHost.length - 1)
        : embedHost,
    embedPath: embedPath.startsWith('/') ? embedPath : '/$embedPath',
    referer: referer,
    origin: origin,
  );
}
