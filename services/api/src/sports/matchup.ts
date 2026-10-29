/**
 * Parse StreamEast-style slug matchups into "Home vs Away" titles.
 *
 * Slugs are usually team1-team2 with no delimiter, e.g.
 *   washington-wizards-charlotte-hornets → Washington Wizards vs Charlotte Hornets
 *   sevilla-osasuna → Sevilla vs Osasuna
 *   new-york-rangers-los-angeles-kings → New York Rangers vs Los Angeles Kings
 */

/** Multi-word / common club slugs, longest first for greedy matching. */
export const KNOWN_TEAM_SLUGS: readonly string[] = [
  // NBA
  "golden-state-warriors",
  "minnesota-timberwolves",
  "oklahoma-city-thunder",
  "portland-trail-blazers",
  "new-orleans-pelicans",
  "philadelphia-76ers",
  "los-angeles-clippers",
  "los-angeles-lakers",
  "san-antonio-spurs",
  "washington-wizards",
  "charlotte-hornets",
  "cleveland-cavaliers",
  "milwaukee-bucks",
  "indiana-pacers",
  "detroit-pistons",
  "atlanta-hawks",
  "toronto-raptors",
  "brooklyn-nets",
  "new-york-knicks",
  "boston-celtics",
  "miami-heat",
  "orlando-magic",
  "chicago-bulls",
  "memphis-grizzlies",
  "houston-rockets",
  "dallas-mavericks",
  "denver-nuggets",
  "utah-jazz",
  "phoenix-suns",
  "sacramento-kings",
  // NHL
  "vegas-golden-knights",
  "columbus-blue-jackets",
  "tampa-bay-lightning",
  "toronto-maple-leafs",
  "montreal-canadiens",
  "new-york-islanders",
  "new-york-rangers",
  "new-jersey-devils",
  "los-angeles-kings",
  "san-jose-sharks",
  "florida-panthers",
  "carolina-hurricanes",
  "washington-capitals",
  "pittsburgh-penguins",
  "philadelphia-flyers",
  "buffalo-sabres",
  "ottawa-senators",
  "detroit-red-wings",
  "nashville-predators",
  "winnipeg-jets",
  "minnesota-wild",
  "chicago-blackhawks",
  "st-louis-blues",
  "dallas-stars",
  "colorado-avalanche",
  "arizona-coyotes",
  "utah-hockey-club",
  "calgary-flames",
  "edmonton-oilers",
  "vancouver-canucks",
  "seattle-kraken",
  "anaheim-ducks",
  "boston-bruins",
  // NFL
  "kansas-city-chiefs",
  "los-angeles-chargers",
  "los-angeles-rams",
  "san-francisco-49ers",
  "tampa-bay-buccaneers",
  "new-england-patriots",
  "green-bay-packers",
  "new-orleans-saints",
  "jacksonville-jaguars",
  "indianapolis-colts",
  "tennessee-titans",
  "pittsburgh-steelers",
  "philadelphia-eagles",
  "washington-commanders",
  "new-york-giants",
  "new-york-jets",
  "arizona-cardinals",
  "seattle-seahawks",
  "denver-broncos",
  "las-vegas-raiders",
  "dallas-cowboys",
  "miami-dolphins",
  "buffalo-bills",
  "baltimore-ravens",
  "cincinnati-bengals",
  "cleveland-browns",
  "houston-texans",
  "chicago-bears",
  "detroit-lions",
  "minnesota-vikings",
  "atlanta-falcons",
  "carolina-panthers",
  // MLB
  "boston-red-sox",
  "chicago-white-sox",
  "chicago-cubs",
  "new-york-yankees",
  "new-york-mets",
  "los-angeles-dodgers",
  "los-angeles-angels",
  "san-francisco-giants",
  "tampa-bay-rays",
  "toronto-blue-jays",
  "kansas-city-royals",
  "minnesota-twins",
  "detroit-tigers",
  "cleveland-guardians",
  "baltimore-orioles",
  "houston-astros",
  "texas-rangers",
  "seattle-mariners",
  "oakland-athletics",
  "athletics",
  "arizona-diamondbacks",
  "colorado-rockies",
  "san-diego-padres",
  "milwaukee-brewers",
  "st-louis-cardinals",
  "cincinnati-reds",
  "pittsburgh-pirates",
  "philadelphia-phillies",
  "atlanta-braves",
  "miami-marlins",
  "washington-nationals",
  // Soccer (common StreamEast clubs)
  "manchester-united",
  "manchester-city",
  "nottingham-forest",
  "west-ham-united",
  "newcastle-united",
  "tottenham-hotspur",
  "crystal-palace",
  "aston-villa",
  "brighton-and-hove-albion",
  "wolverhampton-wanderers",
  "sheffield-united",
  "leicester-city",
  "leeds-united",
  "real-madrid",
  "atletico-madrid",
  "fc-barcelona",
  "barcelona",
  "athletic-bilbao",
  "real-sociedad",
  "real-betis",
  "celta-vigo",
  "rayo-vallecano",
  "bayern-munich",
  "borussia-dortmund",
  "rb-leipzig",
  "bayer-leverkusen",
  "eintracht-frankfurt",
  "inter-milan",
  "ac-milan",
  "as-roma",
  "napoli",
  "juventus",
  "lazio",
  "atalanta",
  "paris-saint-germain",
  "psg",
  "olympique-lyonnais",
  "olympique-marseille",
  "monaco",
  "porto",
  "benfica",
  "sporting-cp",
  "ajax",
  "psv",
  "feyenoord",
  "galatasaray",
  "fenerbahce",
  "besiktas",
  "al-hilal",
  "al-nassr",
  "inter-miami",
  "lafc",
  "la-galaxy",
  "arsenal",
  "chelsea",
  "liverpool",
  "everton",
  "fulham",
  "brentford",
  "bournemouth",
  "southampton",
  "sevilla",
  "osasuna",
  "valencia",
  "villarreal",
  "getafe",
  "girona",
  "mallorca",
  "alaves",
  "espanyol",
  "leganes",
  "valladolid",
].slice().sort((a, b) => b.length - a.length);

const KNOWN_SET = new Set(KNOWN_TEAM_SLUGS);

export type ParsedMatchup = {
  title: string;
  homeTeam: string | null;
  awayTeam: string | null;
};

function humanizeTokens(tokens: string[]): string {
  return tokens
    .filter(Boolean)
    .map((w) => {
      const lower = w.toLowerCase();
      if (["fc", "cf", "sc", "ac", "afc", "nk", "as", "ss", "us"].includes(lower)) {
        return lower.toUpperCase();
      }
      if (["la", "ny", "nj", "psg", "lafc"].includes(lower)) {
        return lower.toUpperCase();
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function matchup(homeTokens: string[], awayTokens: string[]): ParsedMatchup {
  const homeTeam = humanizeTokens(homeTokens);
  const awayTeam = humanizeTokens(awayTokens);
  return {
    title: `${homeTeam} vs ${awayTeam}`,
    homeTeam,
    awayTeam,
  };
}

/**
 * Convert a StreamEast event slug into a display title with home/away teams.
 */
export function parseMatchupFromSlug(slug: string): ParsedMatchup {
  const tokens = slug
    .toLowerCase()
    .split("-")
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return { title: slug, homeTeam: null, awayTeam: null };
  }

  // Explicit "vs" / "v" delimiter in the slug
  const vsIdx = tokens.findIndex((t) => t === "vs" || t === "v");
  if (vsIdx > 0 && vsIdx < tokens.length - 1) {
    return matchup(tokens.slice(0, vsIdx), tokens.slice(vsIdx + 1));
  }

  const joined = tokens.join("-");

  // Both sides known teams (prefer longest home prefix)
  for (const homeSlug of KNOWN_TEAM_SLUGS) {
    if (!joined.startsWith(`${homeSlug}-`)) continue;
    const rest = joined.slice(homeSlug.length + 1);
    if (!rest) continue;
    if (KNOWN_SET.has(rest)) {
      return matchup(homeSlug.split("-"), rest.split("-"));
    }
  }

  // Known home prefix, unknown away (still insert vs)
  for (const homeSlug of KNOWN_TEAM_SLUGS) {
    if (!joined.startsWith(`${homeSlug}-`)) continue;
    const rest = joined.slice(homeSlug.length + 1);
    if (!rest) continue;
    return matchup(homeSlug.split("-"), rest.split("-"));
  }

  // Known away suffix, unknown home
  for (const awaySlug of KNOWN_TEAM_SLUGS) {
    if (!joined.endsWith(`-${awaySlug}`)) continue;
    const rest = joined.slice(0, joined.length - awaySlug.length - 1);
    if (!rest) continue;
    return matchup(rest.split("-"), awaySlug.split("-"));
  }

  // Even token count → split down the middle
  if (tokens.length >= 2 && tokens.length % 2 === 0) {
    const mid = tokens.length / 2;
    return matchup(tokens.slice(0, mid), tokens.slice(mid));
  }

  // Two single-word clubs
  if (tokens.length === 2) {
    return matchup([tokens[0]!], [tokens[1]!]);
  }

  // Odd length ≥ 3: try every split; prefer known sides, else mid-ish split
  if (tokens.length >= 3) {
    let fallback: ParsedMatchup | null = null;
    const mid = Math.floor(tokens.length / 2);
    for (const i of [mid, mid + 1, mid - 1, ...Array.from({ length: tokens.length - 1 }, (_, k) => k + 1)]) {
      if (i < 1 || i >= tokens.length) continue;
      const left = tokens.slice(0, i).join("-");
      const right = tokens.slice(i).join("-");
      const bothKnown = KNOWN_SET.has(left) && KNOWN_SET.has(right);
      const oneKnown = KNOWN_SET.has(left) || KNOWN_SET.has(right);
      const parsed = matchup(tokens.slice(0, i), tokens.slice(i));
      if (bothKnown) return parsed;
      if (oneKnown && !fallback) fallback = parsed;
      if (!fallback && i === mid) fallback = parsed;
    }
    if (fallback) return fallback;
  }

  return {
    title: humanizeTokens(tokens),
    homeTeam: null,
    awayTeam: null,
  };
}

/** Ensure a free-text title shows "vs" when home/away are known. */
export function formatMatchupTitle(
  title: string,
  homeTeam?: string | null,
  awayTeam?: string | null
): string {
  if (homeTeam && awayTeam) {
    return `${homeTeam} vs ${awayTeam}`;
  }
  if (/\bvs\.?\b/i.test(title) || /\sv\s/i.test(title)) {
    return title;
  }
  return title;
}
