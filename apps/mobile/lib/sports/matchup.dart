/// Parse StreamEast-style slug matchups into "Home vs Away" titles.
class ParsedMatchup {
  const ParsedMatchup({required this.title, this.homeTeam, this.awayTeam});

  final String title;
  final String? homeTeam;
  final String? awayTeam;
}

const _rawTeamSlugs = <String>[
  'golden-state-warriors',
  'minnesota-timberwolves',
  'oklahoma-city-thunder',
  'portland-trail-blazers',
  'new-orleans-pelicans',
  'philadelphia-76ers',
  'los-angeles-clippers',
  'los-angeles-lakers',
  'san-antonio-spurs',
  'washington-wizards',
  'charlotte-hornets',
  'cleveland-cavaliers',
  'milwaukee-bucks',
  'indiana-pacers',
  'detroit-pistons',
  'atlanta-hawks',
  'toronto-raptors',
  'brooklyn-nets',
  'new-york-knicks',
  'boston-celtics',
  'miami-heat',
  'orlando-magic',
  'chicago-bulls',
  'memphis-grizzlies',
  'houston-rockets',
  'dallas-mavericks',
  'denver-nuggets',
  'utah-jazz',
  'phoenix-suns',
  'sacramento-kings',
  'vegas-golden-knights',
  'columbus-blue-jackets',
  'tampa-bay-lightning',
  'toronto-maple-leafs',
  'montreal-canadiens',
  'new-york-islanders',
  'new-york-rangers',
  'new-jersey-devils',
  'los-angeles-kings',
  'san-jose-sharks',
  'florida-panthers',
  'carolina-hurricanes',
  'washington-capitals',
  'pittsburgh-penguins',
  'philadelphia-flyers',
  'buffalo-sabres',
  'ottawa-senators',
  'detroit-red-wings',
  'nashville-predators',
  'winnipeg-jets',
  'minnesota-wild',
  'chicago-blackhawks',
  'st-louis-blues',
  'dallas-stars',
  'colorado-avalanche',
  'arizona-coyotes',
  'utah-hockey-club',
  'calgary-flames',
  'edmonton-oilers',
  'vancouver-canucks',
  'seattle-kraken',
  'anaheim-ducks',
  'boston-bruins',
  'kansas-city-chiefs',
  'los-angeles-chargers',
  'los-angeles-rams',
  'san-francisco-49ers',
  'tampa-bay-buccaneers',
  'new-england-patriots',
  'green-bay-packers',
  'new-orleans-saints',
  'jacksonville-jaguars',
  'indianapolis-colts',
  'tennessee-titans',
  'pittsburgh-steelers',
  'philadelphia-eagles',
  'washington-commanders',
  'new-york-giants',
  'new-york-jets',
  'arizona-cardinals',
  'seattle-seahawks',
  'denver-broncos',
  'las-vegas-raiders',
  'dallas-cowboys',
  'miami-dolphins',
  'buffalo-bills',
  'baltimore-ravens',
  'cincinnati-bengals',
  'cleveland-browns',
  'houston-texans',
  'chicago-bears',
  'detroit-lions',
  'minnesota-vikings',
  'atlanta-falcons',
  'carolina-panthers',
  'boston-red-sox',
  'chicago-white-sox',
  'chicago-cubs',
  'new-york-yankees',
  'new-york-mets',
  'los-angeles-dodgers',
  'los-angeles-angels',
  'san-francisco-giants',
  'tampa-bay-rays',
  'toronto-blue-jays',
  'kansas-city-royals',
  'minnesota-twins',
  'detroit-tigers',
  'cleveland-guardians',
  'baltimore-orioles',
  'houston-astros',
  'texas-rangers',
  'seattle-mariners',
  'oakland-athletics',
  'athletics',
  'arizona-diamondbacks',
  'colorado-rockies',
  'san-diego-padres',
  'milwaukee-brewers',
  'st-louis-cardinals',
  'cincinnati-reds',
  'pittsburgh-pirates',
  'philadelphia-phillies',
  'atlanta-braves',
  'miami-marlins',
  'washington-nationals',
  'manchester-united',
  'manchester-city',
  'nottingham-forest',
  'west-ham-united',
  'newcastle-united',
  'tottenham-hotspur',
  'crystal-palace',
  'aston-villa',
  'brighton-and-hove-albion',
  'wolverhampton-wanderers',
  'sheffield-united',
  'leicester-city',
  'leeds-united',
  'real-madrid',
  'atletico-madrid',
  'fc-barcelona',
  'barcelona',
  'athletic-bilbao',
  'real-sociedad',
  'real-betis',
  'celta-vigo',
  'rayo-vallecano',
  'bayern-munich',
  'borussia-dortmund',
  'rb-leipzig',
  'bayer-leverkusen',
  'eintracht-frankfurt',
  'inter-milan',
  'ac-milan',
  'as-roma',
  'napoli',
  'juventus',
  'lazio',
  'atalanta',
  'paris-saint-germain',
  'psg',
  'olympique-lyonnais',
  'olympique-marseille',
  'monaco',
  'porto',
  'benfica',
  'sporting-cp',
  'ajax',
  'psv',
  'feyenoord',
  'galatasaray',
  'fenerbahce',
  'besiktas',
  'al-hilal',
  'al-nassr',
  'inter-miami',
  'lafc',
  'la-galaxy',
  'arsenal',
  'chelsea',
  'liverpool',
  'everton',
  'fulham',
  'brentford',
  'bournemouth',
  'southampton',
  'sevilla',
  'osasuna',
  'valencia',
  'villarreal',
  'getafe',
  'girona',
  'mallorca',
  'alaves',
  'espanyol',
  'leganes',
  'valladolid',
];

final List<String> knownTeamSlugs = () {
  final copy = List<String>.of(_rawTeamSlugs);
  copy.sort((a, b) => b.length.compareTo(a.length));
  return copy;
}();

final Set<String> _knownSet = knownTeamSlugs.toSet();

const _upperTokens = {
  'fc',
  'cf',
  'sc',
  'ac',
  'afc',
  'nk',
  'as',
  'ss',
  'us',
  'la',
  'ny',
  'nj',
  'psg',
  'lafc',
};

String humanizeSlug(String slug) {
  return slug
      .replaceAll(RegExp(r'-live-stream$', caseSensitive: false), '')
      .split('-')
      .where((w) => w.isNotEmpty)
      .map((w) => w[0].toUpperCase() + w.substring(1))
      .join(' ');
}

String _humanizeTokens(List<String> tokens) {
  return tokens
      .where((w) => w.isNotEmpty)
      .map((w) {
        final lower = w.toLowerCase();
        if (_upperTokens.contains(lower)) return lower.toUpperCase();
        return lower[0].toUpperCase() + lower.substring(1);
      })
      .join(' ');
}

ParsedMatchup _matchup(List<String> homeTokens, List<String> awayTokens) {
  final homeTeam = _humanizeTokens(homeTokens);
  final awayTeam = _humanizeTokens(awayTokens);
  return ParsedMatchup(
    title: '$homeTeam vs $awayTeam',
    homeTeam: homeTeam,
    awayTeam: awayTeam,
  );
}

/// Convert an event slug into a display title with home and away teams.
ParsedMatchup parseMatchupFromSlug(String slug) {
  final tokens = slug
      .toLowerCase()
      .split('-')
      .map((t) => t.trim())
      .where((t) => t.isNotEmpty)
      .toList();

  if (tokens.isEmpty) {
    return ParsedMatchup(title: slug);
  }

  final vsIdx = tokens.indexWhere((t) => t == 'vs' || t == 'v');
  if (vsIdx > 0 && vsIdx < tokens.length - 1) {
    return _matchup(tokens.sublist(0, vsIdx), tokens.sublist(vsIdx + 1));
  }

  final joined = tokens.join('-');

  for (final homeSlug in knownTeamSlugs) {
    if (!joined.startsWith('$homeSlug-')) continue;
    final rest = joined.substring(homeSlug.length + 1);
    if (rest.isEmpty) continue;
    if (_knownSet.contains(rest)) {
      return _matchup(homeSlug.split('-'), rest.split('-'));
    }
  }

  for (final homeSlug in knownTeamSlugs) {
    if (!joined.startsWith('$homeSlug-')) continue;
    final rest = joined.substring(homeSlug.length + 1);
    if (rest.isEmpty) continue;
    return _matchup(homeSlug.split('-'), rest.split('-'));
  }

  for (final awaySlug in knownTeamSlugs) {
    if (!joined.endsWith('-$awaySlug')) continue;
    final rest = joined.substring(0, joined.length - awaySlug.length - 1);
    if (rest.isEmpty) continue;
    return _matchup(rest.split('-'), awaySlug.split('-'));
  }

  if (tokens.length >= 2 && tokens.length.isEven) {
    final mid = tokens.length ~/ 2;
    return _matchup(tokens.sublist(0, mid), tokens.sublist(mid));
  }

  if (tokens.length == 2) {
    return _matchup([tokens[0]], [tokens[1]]);
  }

  if (tokens.length >= 3) {
    ParsedMatchup? fallback;
    final mid = tokens.length ~/ 2;
    final indexes = <int>[
      mid,
      mid + 1,
      mid - 1,
      for (var k = 1; k < tokens.length; k++) k,
    ];
    for (final i in indexes) {
      if (i < 1 || i >= tokens.length) continue;
      final left = tokens.sublist(0, i).join('-');
      final right = tokens.sublist(i).join('-');
      final bothKnown = _knownSet.contains(left) && _knownSet.contains(right);
      final oneKnown = _knownSet.contains(left) || _knownSet.contains(right);
      final parsed = _matchup(tokens.sublist(0, i), tokens.sublist(i));
      if (bothKnown) return parsed;
      if (oneKnown && fallback == null) fallback = parsed;
      if (fallback == null && i == mid) fallback = parsed;
    }
    if (fallback != null) return fallback;
  }

  return ParsedMatchup(title: _humanizeTokens(tokens));
}

/// Same match text across hosts: lowercase slug, without a trailing live-stream suffix.
String matchKeyFromSlug(String slug) {
  var key = slug.toLowerCase().trim();
  key = key.replaceAll(RegExp(r'-live-stream$'), '');
  key = key.replaceAll(RegExp(r'[^a-z0-9]+'), '-');
  key = key.replaceAll(RegExp(r'^-+|-+$'), '');
  return key;
}
