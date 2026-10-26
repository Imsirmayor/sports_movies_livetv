# API Reference

Private educational REST API for local authorized sample media, HLS playback sessions, and Phase 2B sports discovery / fixture live sessions.

Base URL (default): `http://127.0.0.1:8787`

Authentication: `Authorization: Bearer <API_TOKEN>` on all routes except `GET /api/health`.

Shared Zod contracts live in `@frankenstein/shared-types`. Sports details: [docs/sports.md](./sports.md).

**VOD:** After the HLS playlist is `ready`, clients may pause and seek locally in a browser HLS player. Server-side pause/resume/seek endpoints are not implemented.

**Live (`kind: "live"`):** `capabilities.seek` and `capabilities.pause` are `false`. Do not assume DVR.

---

## Error format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": {}
  }
}
```

| HTTP | code | meaning |
|------|------|---------|
| 400 | `VALIDATION_ERROR` | Bad body, query, or stream asset name |
| 401 | `UNAUTHORIZED` | Missing/invalid bearer token |
| 404 | `NOT_FOUND` | Media, event, or session missing |
| 409 | `STREAM_UNAVAILABLE` | Event has no playable stream in this config |
| 429 | `CAPACITY` | Concurrent job limit reached |
| 500 | `FFMPEG_FAILED` / `INTERNAL` | Processing or unexpected failure |
| 503 | `PROVIDER_UNAVAILABLE` / `MEDIA_UNAVAILABLE` | Sports provider off or fixture media missing |

---

## Endpoints

### `GET /api/health`

No auth. Reports process health, FFmpeg / media root availability, and `sportsProvider`.

### `GET /api/media`

Auth required. Lists video files in `MEDIA_ROOT` (flat directory). Allowed extensions: `.mp4`, `.mkv`, `.webm`, `.mov`, `.m4v`.

Response: `{ "items": [ MediaItem, ... ] }`

`MediaItem` fields: `id`, `title`, `filename`, `extension`, `sizeBytes`.  
Filesystem paths are **never** returned.

### `GET /api/media/search?q={query}`

Auth required. Case-insensitive filter on title/filename/id.

### `GET /api/media/{id}`

Auth required. Single media item or `404`.

### `POST /api/playback`

Auth required. Body:

```json
{ "mediaId": "<id from catalog>" }
```

Starts an FFmpeg HLS job for that local file only. Returns `201` + `PlaybackSession` with `kind: "vod"`.

`playlistUrl` example: `/api/playback/<sessionId>/stream/index.m3u8`

Clients must send the same bearer token when fetching playlist/segments.

### `GET /api/playback/{sessionId}`

Auth required. Current session status: `starting` | `ready` | `failed` | `stopped`.  
Includes `kind`, `eventId` (live only), and `capabilities`.

### `DELETE /api/playback/{sessionId}`

Auth required. Stops the session, terminates the tracked FFmpeg PID (SIGTERM → SIGKILL with verification), deletes temporary HLS files, returns the final session snapshot.

### `GET /api/playback/{sessionId}/stream/{name}`

Auth required. Serves HLS assets. `name` must match `index.m3u8` or `seg_NNN.ts` only.

### Sports (Phase 2B + Sportsurge port)

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/sports` | Sports + competitions for configured provider |
| `GET` | `/api/sports/events` | Filters: `q`, `team`, `sport`, `competition`, `status` |
| `GET` | `/api/sports/events/:id` | Single event |
| `POST` | `/api/sports/playback` | Body `{ "eventId" }` → live session (`fixture` local file or `sportsurge` remux) |

When team search is ambiguous, responses set `ambiguous: true` and return multiple events — **do not auto-play**.

`SPORTS_PROVIDER=fixture|sportsurge|none` — see [docs/sports.md](./sports.md).

### Movie catalog (Cinemeta + Torrentio port)

Requires `STREMIO_ADDON_URL` (same as Discord bot). Stream URLs are **never** returned to clients.

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/catalog/movies` | Popular Cinemeta movies |
| `GET` | `/api/catalog/movies/search?q=` | Cinemeta title search |
| `GET` | `/api/catalog/movies/:imdbId` | Title metadata |
| `GET` | `/api/catalog/movies/:imdbId/streams` | Ranked stream options (no URLs) |
| `POST` | `/api/catalog/movies/playback` | Body `{ imdbId, streamIndex }` → VOD HLS session |
| `GET` | `/api/catalog/series` | Popular Cinemeta series |
| `GET` | `/api/catalog/series/search?q=` | Cinemeta series search |
| `GET` | `/api/catalog/series/:imdbId` | Seasons + episodes |
| `GET` | `/api/catalog/series/:imdbId/streams?season=&episode=` | Episode stream options |
| `POST` | `/api/catalog/series/playback` | Body `{ imdbId, season, episode, streamIndex }` |

---

## Local sample workflow

```bash
# From repo root (Node ≥ 22.4, pnpm 10.33, ffmpeg on PATH)
cp .env.example .env
# Set API_TOKEN to a random secret. Discord vars are only needed for the bot.

pnpm sample:generate          # writes media/samples/sample.mp4
pnpm install
pnpm build:platform
pnpm --filter @frankenstein/api start
# or: pnpm dev:api

curl -s http://127.0.0.1:8787/api/health | jq
curl -s -H "Authorization: Bearer $API_TOKEN" \
  'http://127.0.0.1:8787/api/media/search?q=sample' | jq

MEDIA_ID=$(curl -s -H "Authorization: Bearer $API_TOKEN" \
  http://127.0.0.1:8787/api/media | jq -r '.items[0].id')

curl -s -X POST -H "Authorization: Bearer $API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"mediaId\":\"$MEDIA_ID\"}" \
  http://127.0.0.1:8787/api/playback | jq

# Sports discovery (fixture provider)
curl -s -H "Authorization: Bearer $API_TOKEN" http://127.0.0.1:8787/api/sports | jq
curl -s -H "Authorization: Bearer $API_TOKEN" \
  'http://127.0.0.1:8787/api/sports/events?team=arsenal' | jq

# Stop when finished (replace SESSION_ID):
curl -s -X DELETE -H "Authorization: Bearer $API_TOKEN" \
  http://127.0.0.1:8787/api/playback/SESSION_ID | jq
```

---

## Security notes

- Clients cannot pass filesystem paths or remote URLs for media resolution.
- Media is limited to files inside the configured `MEDIA_ROOT`.
- Symlink escapes outside the root are rejected.
- FFmpeg is spawned with argument arrays (`shell: false`), never a shell string.
- Only the session’s own FFmpeg PID is signaled — no global `pkill ffmpeg`.
- Concurrent jobs are capped (`MAX_CONCURRENT_JOBS`).
- Job runtime is capped (`JOB_TIMEOUT_MS`).
- Sports fixture live playback uses catalog media only — no arbitrary URL fetch / SSRF.
- Sportsurge scraping and Discord selfbot are **not** used by the sports service.
- Do not commit `.env` or real tokens.
- Bind defaults to `127.0.0.1` for local private testing.

---

## Deferred

- Authorized third-party live sports video providers (end-to-end tested)
- Server-side `pause` / `resume` / `seek`
- OpenAPI YAML export
- Torrentio / RealDebrid / Sportsurge re-enablement
- React sports UI / Flutter sports screens (contracts ready)
