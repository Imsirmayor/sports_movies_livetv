# Sports API — Phase 2B

Live sports support for Frankenstein Media / Bowa clients (React + Flutter).

## Provider policy

| Mode | Env | Behavior |
|------|-----|----------|
| `fixture` | `SPORTS_PROVIDER=fixture` | Deterministic educational schedule grouped by league (EPL, La Liga, World Cup, etc.). Discovery only — streams are `unavailable` (no local-file stand-in). |
| `sportsurge` | `SPORTS_PROVIDER=sportsurge` | Same code path as Discord `/live`. **Currently unusable:** `sportsurge.ws` returns a law-enforcement seizure page (expired TLS / no event list). |
| `none` | `SPORTS_PROVIDER=none` | Discovery returns `PROVIDER_UNAVAILABLE`. |

**Notes**

- Prefer `fixture` until a lawful sports data/stream provider is configured.
- Do not bypass DRM / paywalls or seized-domain blocks.
- Claiming redistribution rights is on you / your deployment policy.

An event in search results does **not** imply a playable stream (`streamAvailability` may be `unavailable` or `provider_required`).

Original Discord modules remain under `src/**` unchanged. Matching logic was **adapted** into `services/api/src/sports/matching.ts` without importing Discord code.

## Shared models

See `@frankenstein/shared-types`:

- `SportEvent` — id, sport, competition, teams, `startTime` (ISO-8601 UTC or null), `status`, optional verified `score`, `provider`, `streamAvailability`
- `SportCompetition`
- `CreateLivePlaybackRequest` — `{ eventId }`
- `PlaybackSession` — includes `kind: "vod" | "live"`, `eventId`, `capabilities: { seek, pause }`

### Status semantics

| status | Meaning |
|--------|---------|
| `live` | Fixture/provider marks the event as in progress |
| `upcoming` | Scheduled start in the future (when `startTime` known) |
| `finished` | Completed |
| `unknown` | Status not verified |

Timestamps are ISO-8601 **UTC** when present. Time zones are not localized by the API.

### Stream availability

| value | Meaning |
|-------|---------|
| `fixture` | Reserved for optional local educational playback via `SPORTS_FIXTURE_MEDIA_ID` (not used by the default catalog) |
| `unavailable` | No stream in this build |
| `provider_required` | Needs a future authorized provider config |
| `available` | Reserved for a future authorized provider that has confirmed a URL |

## Endpoints

All require `Authorization: Bearer <API_TOKEN>` except notes below.

### `GET /api/sports`

Lists sports + competitions + provider flags.

### `GET /api/sports/events`

Query params (all optional):

| Param | Description |
|-------|-------------|
| `q` | Free-text / team fuzzy search |
| `team` | Team-focused fuzzy search (alias-aware) |
| `sport` | Exact sport slug (`soccer`, `nba` sport field values in fixtures) |
| `competition` | Competition name or id |
| `status` | `live` \| `upcoming` \| `finished` \| `unknown` |

Response includes `events`, optional `matchScores`, and `ambiguous: true` when multiple strong team matches exist. **Clients must not auto-select** when `ambiguous` is true.

### `GET /api/sports/events/:id`

Single event or `404`.

### `POST /api/sports/playback`

Body: `{ "eventId": "..." }`

Starts a live playback session when `streamAvailability` is `fixture` (local educational media) or `available` (authorized remote). Default fixture events return `STREAM_UNAVAILABLE`.

Returns `PlaybackSession` with:

- `kind: "live"`
- `capabilities: { seek: false, pause: false }`
- `playlistUrl` pointing at `/api/playback/:sessionId/stream/index.m3u8`

Status / stop / HLS segment routes reuse existing:

- `GET /api/playback/:sessionId`
- `DELETE /api/playback/:sessionId`
- `GET /api/playback/:sessionId/stream/:name`

### Errors

| HTTP | code |
|------|------|
| 400 | `VALIDATION_ERROR` |
| 404 | `NOT_FOUND` |
| 409 | `STREAM_UNAVAILABLE` |
| 429 | `CAPACITY` |
| 503 | `PROVIDER_UNAVAILABLE` |

## Live capabilities (honest)

For fixture live sessions:

- Playlist is produced by the same local HLS worker as VOD (educational stand-in).
- API advertises **no seek** and **no pause** for `kind: "live"`.
- Clients should not offer DVR UI for live sessions.
- This is **not** a verified third-party live broadcast.

Real authorized live HLS providers are out of scope until configured and tested end to end.

## Config

```env
SPORTS_PROVIDER=fixture
# Optional; defaults to the first file in MEDIA_ROOT when unset
SPORTS_FIXTURE_MEDIA_ID=
```

## UI notes (not implemented in 2B)

Sports UI references (icon rail, LIVE badges, league chips, match lists, glass HUD) are design targets for a later frontend phase. Contract above is what React/Flutter should consume.

## Team matching

Adapted fuzzy scorer with NHL/NBA/NFL/MLB/soccer aliases. Returns all scored matches; ambiguity detection when top scores are close.
