import '../data/models.dart';
import 'matchup.dart';
import 'sites_config.dart';
import 'timing.dart';

class ParsedEventLink {
  const ParsedEventLink({
    required this.league,
    required this.slug,
    required this.id,
    required this.kind,
    required this.url,
  });

  final String league;
  final String slug;
  final String id;
  final String kind;
  final String url;
}

class ListedEvent {
  const ListedEvent({
    required this.site,
    required this.listUrl,
    required this.link,
    required this.title,
    required this.homeTeam,
    required this.awayTeam,
    required this.startTime,
    required this.status,
    required this.matchKey,
  });

  final ScrapeSite site;
  final String listUrl;
  final ParsedEventLink link;
  final String title;
  final String? homeTeam;
  final String? awayTeam;
  final String? startTime;
  final String status;
  final String matchKey;
}

final _cardRe = RegExp(
  r'<li\b[^>]*class="[^"]*match-card[^"]*"[\s\S]*?</li>',
  caseSensitive: false,
);

final _hrefRe = RegExp('''href=["']([^"']+)["']''', caseSensitive: false);

final _saatRe = RegExp(
  r'<(?:span|div)\b([^>]*\bSaatZamanBilgisi\b[^>]*)>([\s\S]*?)</(?:span|div)>',
  caseSensitive: false,
);

final _macTitleRe = RegExp(
  r'MacBaslik[\s\S]*?<span[^>]*>([\s\S]*?)</span>',
  caseSensitive: false,
);

ParsedEventLink? parseEventUrl(Uri uri, String eventHost) {
  if (normalizeHost(uri.host) != normalizeHost(eventHost)) return null;
  final parts = uri.pathSegments.where((s) => s.isNotEmpty).toList();
  if (parts.length == 3 && parts[0].toLowerCase() == 'stream') {
    final slug = parts[2];
    return ParsedEventLink(
      kind: 'stream',
      league: parts[1],
      slug: slug,
      id: 'stream-$slug',
      url: _cleanUrl(uri),
    );
  }
  if (parts.length == 3 && RegExp(r'^\d+$').hasMatch(parts[2])) {
    return ParsedEventLink(
      kind: 'match',
      league: parts[0],
      slug: parts[1],
      id: parts[2],
      url: _cleanUrl(uri),
    );
  }
  return null;
}

String _cleanUrl(Uri uri) {
  return Uri(
    scheme: uri.scheme,
    userInfo: uri.userInfo.isEmpty ? null : uri.userInfo,
    host: uri.host,
    port: uri.hasPort ? uri.port : null,
    path: uri.path,
  ).toString();
}

Uri? resolveHref(String href, Uri page) {
  final trimmed = href.trim();
  if (trimmed.isEmpty ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('javascript:')) {
    return null;
  }
  if (trimmed.startsWith('//')) return Uri.tryParse('https:$trimmed');
  return page.resolve(trimmed);
}

List<ListedEvent> parseListingHtml({
  required String html,
  required Uri pageUrl,
  required ScrapeSite site,
}) {
  final events = <ListedEvent>[];
  final seen = <String>{};
  final cards = _cardRe.allMatches(html).map((m) => m.group(0)!).toList();
  final chunks = cards.isEmpty ? [html] : cards;

  for (final card in chunks) {
    final event = _eventFromChunk(card, pageUrl, site);
    if (event == null) continue;
    _push(events, seen, event);
  }

  for (final match in _saatRe.allMatches(html)) {
    final attrs = match.group(1) ?? '';
    final labelHtml = match.group(2) ?? '';
    final classMatch = RegExp(
      'class="([^"]*)"',
      caseSensitive: false,
    ).firstMatch(attrs);
    final classes = classMatch?.group(1) ?? attrs;
    if (!isSaatZamanLive(classes, labelHtml)) continue;

    final idx = match.start;
    final before = html.substring(idx < 2500 ? 0 : idx - 2500, idx);
    final hrefs = _hrefRe.allMatches(before).map((m) => m.group(1)!).toList();
    ParsedEventLink? link;
    for (final href in hrefs.reversed) {
      final resolved = resolveHref(href, pageUrl);
      if (resolved == null) continue;
      link = parseEventUrl(resolved, site.eventHost);
      if (link != null) break;
    }
    if (link == null) continue;
    final listed = _listedFromLink(
      site: site,
      listUrl: pageUrl.toString(),
      link: link,
      cardHtml: before + match.group(0)!,
      liveOverride: true,
    );
    _push(events, seen, listed);
  }

  return events;
}

void _push(List<ListedEvent> events, Set<String> seen, ListedEvent event) {
  if (!seen.add(event.link.url)) return;
  events.add(event);
}

ListedEvent? _eventFromChunk(String cardHtml, Uri pageUrl, ScrapeSite site) {
  ParsedEventLink? link;
  for (final match in _hrefRe.allMatches(cardHtml)) {
    final resolved = resolveHref(match.group(1)!, pageUrl);
    if (resolved == null) continue;
    link = parseEventUrl(resolved, site.eventHost);
    if (link != null) break;
  }
  if (link == null) return null;
  return _listedFromLink(
    site: site,
    listUrl: _cleanUrl(pageUrl),
    link: link,
    cardHtml: cardHtml,
  );
}

ListedEvent _listedFromLink({
  required ScrapeSite site,
  required String listUrl,
  required ParsedEventLink link,
  required String cardHtml,
  bool liveOverride = false,
}) {
  final zaman = _saatRe.firstMatch(cardHtml);
  final attrs = zaman?.group(1) ?? '';
  final classMatch = RegExp(
    'class="([^"]*)"',
    caseSensitive: false,
  ).firstMatch(attrs);
  final classes = classMatch?.group(1) ?? attrs;
  final zamanAttr = RegExp(
    'data-zaman="(\\d+)"',
    caseSensitive: false,
  ).firstMatch(attrs);
  final dataZaman = zamanAttr != null
      ? int.tryParse(zamanAttr.group(1)!)
      : null;
  final labelHtml = zaman?.group(2) ?? '';
  final live = liveOverride || isSaatZamanLive(classes, labelHtml);
  final timing = resolveMatchTiming(
    dataZaman: dataZaman,
    label: labelHtml,
    btnLive: live,
  );

  final slug = link.slug.replaceAll(
    RegExp(r'-live-stream$', caseSensitive: false),
    '',
  );
  final matchup = link.kind == 'match'
      ? parseMatchupFromSlug(slug)
      : ParsedMatchup(title: _titleFromCard(cardHtml, slug));
  final cardTitle = _titleFromCard(cardHtml, slug);
  final title = matchup.homeTeam != null && matchup.awayTeam != null
      ? matchup.title
      : (cardTitle.isNotEmpty ? cardTitle : matchup.title);

  return ListedEvent(
    site: site,
    listUrl: listUrl,
    link: link,
    title: title,
    homeTeam: matchup.homeTeam,
    awayTeam: matchup.awayTeam,
    startTime: timing.startTime,
    status: live ? 'live' : timing.status,
    matchKey: matchKeyFromSlug(link.slug),
  );
}

String _titleFromCard(String cardHtml, String slug) {
  final mac = _macTitleRe.firstMatch(cardHtml);
  if (mac != null) {
    final text = stripHtml(mac.group(1) ?? '');
    if (text.isNotEmpty) return text;
  }
  return humanizeSlug(slug);
}

class SportFeed {
  const SportFeed({
    required this.siteId,
    required this.siteName,
    required this.eventUrl,
    required this.listUrl,
    required this.league,
    required this.slug,
    required this.status,
    required this.startTime,
    required this.embedHost,
    required this.embedPath,
    required this.referer,
    required this.origin,
  });

  final String siteId;
  final String siteName;
  final String eventUrl;
  final String listUrl;
  final String league;
  final String slug;
  final String status;
  final String? startTime;
  final String embedHost;
  final String embedPath;
  final String referer;
  final String origin;

  String get hostLabel {
    final host = Uri.tryParse(eventUrl)?.host;
    if (host == null || host.isEmpty) return siteName;
    return host;
  }
}

class SportsCatalog {
  const SportsCatalog({
    required this.events,
    required this.feedsById,
  });

  final List<SportEvent> events;
  final Map<String, List<SportFeed>> feedsById;

  List<SportEvent> get live => events.where((e) => e.isLive).toList();

  List<SportEvent> get upcoming => events.where((e) => !e.isLive).toList();

  List<String> get sports {
    final seen = <String>{};
    final out = <String>[];
    for (final event in events) {
      final sport = event.sport.trim();
      if (sport.isEmpty) continue;
      final key = sport.toLowerCase();
      if (seen.add(key)) out.add(sport);
    }
    return out;
  }

  SportEvent? find(String id) {
    for (final event in events) {
      if (event.id == id) return event;
    }
    return null;
  }

  List<SportFeed> feedsFor(String id) => feedsById[id] ?? const [];

  static SportsCatalog group(List<ListedEvent> rows) {
    final groups = <String, List<ListedEvent>>{};
    for (final row in rows) {
      if (row.matchKey.isEmpty) continue;
      groups.putIfAbsent(row.matchKey, () => []).add(row);
    }

    final events = <SportEvent>[];
    final feedsById = <String, List<SportFeed>>{};

    for (final entry in groups.entries) {
      final unique = <String, ListedEvent>{};
      for (final row in entry.value) {
        unique.putIfAbsent(row.link.url, () => row);
      }
      final feeds = unique.values.toList();
      if (feeds.isEmpty) continue;

      ListedEvent? liveRow;
      String? start;
      for (final row in feeds) {
        if (liveRow == null && row.status == 'live') liveRow = row;
        if (start == null &&
            row.startTime != null &&
            row.startTime!.isNotEmpty) {
          start = row.startTime;
        }
      }
      final primary = liveRow ?? feeds.first;
      if (liveRow?.startTime != null) start = liveRow!.startTime;

      final leagueCounts = <String, int>{};
      for (final row in feeds) {
        leagueCounts[row.link.league] =
            (leagueCounts[row.link.league] ?? 0) + 1;
      }
      final league = leagueCounts.entries
          .reduce((a, b) => a.value >= b.value ? a : b)
          .key;
      final id = 'ss-${entry.key}';
      final isLive = liveRow != null;

      events.add(
        SportEvent(
          id: id,
          sport: league,
          competition: league.replaceAll('-', ' ').toUpperCase(),
          competitionId: 'ss-comp-$league',
          title: primary.title,
          homeTeam: primary.homeTeam,
          awayTeam: primary.awayTeam,
          startTime: start,
          status: isLive ? 'live' : primary.status,
          provider: 'sportsurge',
          streamAvailability: isLive ? 'available' : 'unavailable',
          sourceCount: feeds.length,
        ),
      );
      feedsById[id] = [
        for (final row in feeds)
          SportFeed(
            siteId: row.site.id,
            siteName: row.site.name,
            eventUrl: row.link.url,
            listUrl: row.listUrl,
            league: row.link.league,
            slug: row.link.slug,
            status: row.status,
            startTime: row.startTime,
            embedHost: row.site.embedHost,
            embedPath: row.site.embedPath,
            referer: row.site.referer,
            origin: row.site.origin,
          ),
      ];
    }

    events.sort((a, b) {
      if (a.isLive != b.isLive) return a.isLive ? -1 : 1;
      final at = a.startTime ?? '';
      final bt = b.startTime ?? '';
      final byTime = at.compareTo(bt);
      if (byTime != 0) return byTime;
      return a.displayTitle.compareTo(b.displayTitle);
    });

    return SportsCatalog(events: events, feedsById: feedsById);
  }
}
