# Web Application

Next.js (App Router) client in `apps/web`, branded **Bowa** by default (`NEXT_PUBLIC_BRAND_NAME` overrides). Connects to the existing Phase Two / 2B REST API through a server-side BFF — the browser never receives `API_TOKEN`.

## Architecture

```
Browser  →  /api/backend/*  (Next.js BFF)
                 ↓  Authorization: Bearer $API_TOKEN
            $API_BASE_URL/api/*  (services/api)
```

- HLS played with `hls.js` (MSE) or native Safari HLS
- VOD: browser play/pause/seek on the `<video>` element
- Live: respects `capabilities.seek` / `capabilities.pause` from the session (`false` for sports live)
- Stop: `DELETE /api/playback/:sessionId` via BFF (also on watch-page unmount)

## Routes

| Route | Purpose | Backend |
|-------|---------|---------|
| `/` | Landing: categories + live/upcoming + local library | `GET /sports/events`, `GET /media`, `GET /health` |
| `/sports` | Sports discovery + filters | `GET /sports`, `GET /sports/events` |
| `/sports/:eventId` | Event details + watch when playable | `GET /sports/events/:id`, `POST /sports/playback` |
| `/movies` | Local library + Cinemeta catalog search | `GET /media*`, `GET /catalog/movies/search` |
| `/movies/:movieId` | Local media details + VOD | `GET /media/:id`, `POST /playback` |
| `/movies/catalog/:imdbId` | Torrentio stream picker + watch | `GET /catalog/movies/:id`, `/streams`, `POST .../playback` |
| `/series` | Series catalog search | `GET /catalog/series/search` |
| `/series/:imdbId` | Seasons / episodes / streams | `GET /catalog/series/:id`, `/streams`, `POST .../playback` |
| `/watch/:sessionId` | Shared player + session polling/cleanup | `GET/DELETE /playback/:id`, HLS via BFF |

## Start locally

```bash
nvm use 26   # or ≥ 22.4
# Terminal A — API
pnpm build:platform && pnpm start:api

# Terminal B — web (repo root .env must include API_TOKEN + API_BASE_URL)
pnpm build:web && pnpm start:web
# or: pnpm dev:web
```

Open `http://127.0.0.1:3000/`

## Environment

| Variable | Where | Purpose |
|----------|--------|---------|
| `API_TOKEN` | server / `.env` | Bearer token for the media API (BFF only) |
| `API_BASE_URL` | server / `.env` | Default `http://127.0.0.1:8787` |
| `NEXT_PUBLIC_BRAND_NAME` | optional | Brand label in UI (default `Bowa`) |
| `SPORTS_PROVIDER` | API `.env` | `fixture` \| `sportsurge` \| `none` |
| `STREMIO_ADDON_URL` | API `.env` | Same Torrentio+RD URL as the Discord bot (movie catalog) |
| `MAX_RESOLUTION` | API `.env` | Cap for ranked Torrentio streams (default 720) |

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev:web` | Next.js dev server on port 3000 |
| `pnpm build:web` | Production build |
| `pnpm start:web` | Serve production build |
| `pnpm test:web` | Vitest |
| `pnpm typecheck:web` | `tsc --noEmit` |

## Implemented features

- Landing with Sports / Movies / Series entry points
- Sports discovery from fixture (or configured) provider, filters, ambiguous-match notice
- Sports watch for `streamAvailability: fixture` (educational local HLS stand-in)
- Movies as **local MEDIA_ROOT library** (actual `/api/media` contract)
- Shared watch page with loading / error / stop / live capability gating
- Responsive header + mobile nav, Poppins typography

## Missing backend capabilities (UI is honest)

| Feature | Status |
|---------|--------|
| Commercial movie catalog (posters, year, synopsis) | Not in API — local files only |
| Series / seasons / episodes | No endpoint — `/series` explains the gap |
| Real third-party live sports video | Not configured — fixture playback only |
| Continue watching / progress | Not persisted |
| Auth / plans / community | Not wired |

## Playback limitations

- Clients must not invent stream URLs; only session `playlistUrl` from the API
- Live sessions advertise no seek and no pause — UI disables those controls
- Concurrent sessions limited by `MAX_CONCURRENT_JOBS`
- This is an educational private stack, not a public broadcast redistributor
