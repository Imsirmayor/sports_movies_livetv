# Warm edge cache (CDN-style UX)

Commercial apps feel instant because HLS segments already sit on a CDN. Bowa approximates that with:

1. **RealDebrid warm** — background poke so torrents become `RD+` / Cached  
2. **Local HLS edge** — finished remuxes stored under `STREAM_CACHE_ROOT` (default `.media-cache`)  
3. **Optional Cloudflare R2** — same remux uploaded to object storage; browser loads the public playlist  
4. **Detail-page warm** — opening a movie/episode queues warm while the user picks a source  

Repeat plays of the same stream index hit disk or R2 and skip RD wait + FFmpeg.

## Capacity (why “Too many concurrent playback sessions”)

Two pools:

| Pool | Env | Counts |
|------|-----|--------|
| **Heavy** | `MAX_CONCURRENT_JOBS` (default 2) | Live FFmpeg remux / first-time encode |
| **Edge** | `MAX_EDGE_SESSIONS` (default 24) | Local `.media-cache` or R2 CDN play (no FFmpeg) |

Cached and R2 plays no longer burn a heavy slot. Warm remux also leaves one heavy slot free for you.

If you still see `CAPACITY` on a cold title, raise `MAX_CONCURRENT_JOBS` (CPU-bound) or stop other remuxes / wait for warm to finish.

## Enable (API `.env`)

```bash
STREAM_CACHE_ROOT=.media-cache
STREAM_CACHE_MAX_ENTRIES=40
CATALOG_WARM_INTERVAL_MS=1800000   # 30m; 0 = disable popular timer
CATALOG_WARM_COUNT=5
CATALOG_WARM_FULL_REMUX=true       # remux into .media-cache when idle
MAX_CONCURRENT_JOBS=2              # FFmpeg remux slots
MAX_EDGE_SESSIONS=24               # cached / R2 plays
```

Persist `.media-cache` across restarts (bind mount / volume). Wipe it to reclaim disk.

## How to host

### A. Single VPS / home server (recommended start)

Your API **is** the edge:

```text
Browser → Next.js (:3000) → API (:8787) → .media-cache HLS
```

- Run API + web on one machine with a **persistent volume** for `.media-cache` and `.media-work`
- Put Caddy/nginx or Cloudflare Tunnel in front of `:3000`
- Keep `API_TOKEN` server-only (BFF already proxies `/api/backend/*`)

### B. Docker / cloud VM

Mount a named volume:

```yaml
volumes:
  - bowa-cache:/app/.media-cache
  - bowa-work:/app/.media-work
```

Same env as above. Scale **vertically** first (CPU for remux, disk for cache).

### C. Cloudflare R2 (true CDN)

After each successful remux, the API uploads `index.m3u8` + `.ts` segments to R2. On the next play it returns the **public HTTPS playlist** to the player (edge session — no FFmpeg).

```bash
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=bowa-hls
R2_PUBLIC_BASE_URL=https://pub-xxxx.r2.dev   # or https://cdn.yourdomain.com
R2_PREFIX=hls
```

Setup checklist:

1. Create an R2 bucket + API token (Object Read & Write)  
2. Enable **public access** (r2.dev subdomain) **or** attach a custom domain  
3. CORS on the bucket (or custom domain) must allow your web origin, e.g. `GET` / `HEAD` for `*.m3u8` and `*.ts`  
4. Restart the API — `/api/health` shows `r2Enabled: true` when configured  

Flow:

```text
Cold play:  Browser → API → FFmpeg remux → .media-cache → upload R2
Warm play:  Browser → https://cdn…/hls/<key>/index.m3u8  (direct)
```

Without R2 credentials the local `.media-cache` path still works.

## UI signals

Stream list shows:

- **Ready on server** — `locallyCached` (instant play from `.media-cache` or R2)  
- **Cached** — RealDebrid already has the file (`RD+`)  
- Warming runs automatically on detail open + popular timer  

## Limits

- First play of a cold title can still wait (RD + remux)  
- Full remux warm skips when heavy slots are nearly full  
- Cache is keyed by `imdbId` + stream index; changing Torrentio ranking may miss cache  
