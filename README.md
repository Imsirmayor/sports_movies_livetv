# Pulse Stream

Web + Android client for **sports**, **movies**, and **TV series**, backed by a Node.js HLS remux API (Torrentio / RealDebrid + optional live sports scrape).

```text
Browser / Flutter  →  Next.js BFF (:3000) or direct API  →  API (:8787)  →  FFmpeg HLS
                                                                    ↓
                                                          .media-cache / Cloudflare R2
```

| Package | Path | Role |
|---------|------|------|
| API | `services/api` | Auth, catalog, sports, playback, ads |
| Media worker | `services/media-worker` | FFmpeg HLS remux jobs |
| Shared types | `packages/shared-types` | Zod schemas / DTOs |
| Web | `apps/web` | Next.js UI + BFF (`/api/backend/*`) |
| Mobile | `apps/mobile` | Flutter Android app |

---

## Table of contents

1. [Prerequisites](#1-prerequisites)
2. [Clone & install](#2-clone--install)
3. [Environment (`.env`)](#3-environment-env)
4. [Local setup — Backend API](#4-local-setup--backend-api)
5. [Local setup — Web frontend](#5-local-setup--web-frontend)
6. [Local setup — Mobile (Android)](#6-local-setup--mobile-android)
7. [Production deploy — Backend](#7-production-deploy--backend)
8. [Production deploy — Web](#8-production-deploy--web)
9. [Production deploy — Mobile](#9-production-deploy--mobile)
10. [Disk, cache & speed](#10-disk-cache--speed)
11. [Ads (optional)](#11-ads-optional)
12. [Useful commands](#12-useful-commands)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| **Node.js** | ≥ 22.4 (26 OK) | API + Next.js |
| **pnpm** | ≥ 10.33 | Workspace installs |
| **FFmpeg** + **ffprobe** | ≥ 6 (7.1+ ideal) | HLS remux |
| **Flutter** | stable (3.22+) | Android app only |
| **Android Studio / SDK** | recent | Emulator or device |

```bash
node --version
pnpm --version
ffmpeg -version
ffprobe -version
flutter doctor   # mobile only
```

**Accounts (for real movies/series):**

1. [RealDebrid](https://real-debrid.com/) API key  
2. Configure [Torrentio](https://torrentio.strem.fun/configure) with that key → copy the full addon URL → `STREMIO_ADDON_URL`

---

## 2. Clone & install

```bash
git clone <your-repo-url> DiscordFrankenstein
cd DiscordFrankenstein

# Use a modern Node (example with nvm)
nvm use 26   # or 22+

pnpm install
pnpm build:platform
```

Optional local sample file for fixture sports / media list:

```bash
mkdir -p media/samples
pnpm sample:generate
```

---

## 3. Environment (`.env`)

All server config lives in the **repo root** `.env` (gitignored).

```bash
cp .env.example .env
```

Generate a strong API token:

```bash
# macOS / Linux
openssl rand -hex 32
```

Paste it into `.env` as `API_TOKEN=...`.

### Required for API + web

| Variable | Example | Notes |
|----------|---------|--------|
| `API_TOKEN` | long random hex | Shared secret. **Same value** on API, web BFF, and mobile. |
| `API_HOST` | `127.0.0.1` local / `0.0.0.0` server | Bind address |
| `API_PORT` | `8787` | API port |
| `API_BASE_URL` | `http://127.0.0.1:8787` | What the **web BFF** calls (not the browser) |
| `MEDIA_ROOT` | `media/samples` | Must exist |
| `MEDIA_WORK_ROOT` | `.media-work` | Temp remux dirs (auto-purged on boot / stop) |
| `FFMPEG_BINARY` | `ffmpeg` | Or absolute path |

### Strongly recommended

| Variable | Example | Notes |
|----------|---------|--------|
| `STREMIO_ADDON_URL` | `https://torrentio.strem.fun/...\|realdebrid=KEY/` | Movies & series streams |
| `SPORTS_PROVIDER` | `fixture` or `sportsurge` | Live sports source |
| `MAX_RESOLUTION` | `720` | Cap stream quality / remux load |

### Capacity & disk (tune for VPS)

| Variable | Small VPS | Powerful host |
|----------|-----------|---------------|
| `MAX_CONCURRENT_JOBS` | `2` | `4`–`8` |
| `MAX_EDGE_SESSIONS` | `24` | `100`+ |
| `STREAM_CACHE_MAX_ENTRIES` | `10`–`20` | `40`+ |
| `CATALOG_WARM_FULL_REMUX` | `false` | `true` if disk/CPU allow |

### Optional CDN (production speed)

| Variable | Purpose |
|----------|---------|
| `R2_ACCOUNT_ID` | Cloudflare account |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | R2 API token |
| `R2_BUCKET` | Bucket name |
| `R2_PUBLIC_BASE_URL` | `https://pub-….r2.dev` or custom domain |
| `R2_PREFIX` | Object prefix (default `hls`) |

**Fallback:** leave `R2_*` empty → API uses local `.media-cache` only.  
With R2 set → warm plays prefer CDN; if R2 is down/missing, API falls back to local cache automatically.  
Check `GET /api/health` → `r2Enabled` / `streamDelivery` (`r2_then_local` | `local` | `off`).

Full list: [`.env.example`](./.env.example). Mobile notes: [`apps/mobile/README.md`](./apps/mobile/README.md).

> **Never commit `.env`.** Only `.env.example` is tracked.

---

## 4. Local setup — Backend API

### Steps

1. Ensure `.env` exists with at least `API_TOKEN`, `MEDIA_ROOT`, `API_HOST`, `API_PORT`.
2. Ensure `MEDIA_ROOT` exists (`media/samples`).
3. Build & start:

```bash
# from repo root
pnpm build:platform
pnpm start:api
```

Dev (hot reload):

```bash
pnpm dev:api
```

### Verify

```bash
curl -s http://127.0.0.1:8787/api/health \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

You should see JSON with health / config flags.

### Notes

- Default bind is **loopback only** (`API_HOST=127.0.0.1`) — fine for web on the same machine.
- For a **phone on Wi‑Fi**, set `API_HOST=0.0.0.0` and use your LAN IP in the app.
- Orphan remux folders under `.media-work` are deleted when the API starts.

---

## 5. Local setup — Web frontend

The browser never gets `API_TOKEN`. Next.js proxies `/api/backend/*` → `$API_BASE_URL/api/*` with the Bearer header.

### Steps

1. Same root `.env` must include:

```env
API_TOKEN=your-token
API_BASE_URL=http://127.0.0.1:8787
```

2. Start API (section 4), then in another terminal:

```bash
# Dev (recommended while iterating)
pnpm dev:web

# Or production-like build
pnpm build:web
pnpm start:web
```

3. Open [http://127.0.0.1:3000](http://127.0.0.1:3000)

### Optional web-only overrides

Create `apps/web/.env.local` if you need different values than the root `.env`:

```env
API_TOKEN=your-token
API_BASE_URL=http://127.0.0.1:8787
NEXT_PUBLIC_BRAND_NAME=Pulse Stream
```

### Checklist

- [ ] API returns 200 on `/api/health` with Bearer token  
- [ ] Web loads home without “Unable to reach the media API”  
- [ ] Movies search works only if `STREMIO_ADDON_URL` is set  

---

## 6. Local setup — Mobile (Android)

App package: `apps/mobile` (Flutter). It talks to the API with `Authorization: Bearer <API_TOKEN>`.

### A. Emulator (easiest)

On Android emulator, host `localhost` is **`10.0.2.2`**.

1. API running with `API_HOST=127.0.0.1` (default) is enough.  
2. Run:

```bash
cd apps/mobile
flutter pub get
flutter run \
  --dart-define=API_BASE_URL=http://10.0.2.2:8787 \
  --dart-define=API_TOKEN=YOUR_API_TOKEN
```

Or open **Settings** in the app and paste Base URL + Token (saved on device).

### B. Physical phone (same Wi‑Fi)

1. In root `.env`:

```env
API_HOST=0.0.0.0
API_PORT=8787
```

2. Restart API. Find your computer’s LAN IP:

```bash
# macOS
ipconfig getifaddr en0
# Linux
hostname -I
```

3. Run:

```bash
cd apps/mobile
flutter run \
  --dart-define=API_BASE_URL=http://192.168.x.x:8787 \
  --dart-define=API_TOKEN=YOUR_API_TOKEN
```

4. Allow the phone through any OS firewall for port `8787`.

Cleartext HTTP is enabled for local debug (`usesCleartextTraffic`). Use **HTTPS** in production builds.

### AdMob (optional on device)

1. Set `ADMOB_ANDROID_APP_ID` (`ca-app-pub-…~…`) in `.env` for the API decisioning.  
2. Put the **same App ID** in  
   `apps/mobile/android/app/src/main/AndroidManifest.xml` →  
   `com.google.android.gms.ads.APPLICATION_ID`.  
3. Set rewarded/interstitial unit IDs in `.env` (`ADMOB_REWARDED_ANDROID`, etc.).  
4. Rebuild/reinstall the APK after changing the manifest.

More detail: [`apps/mobile/README.md`](./apps/mobile/README.md).

---

## 7. Production deploy — Backend

Target: a Linux VPS (e.g. 4GB+) with Node, pnpm, FFmpeg.

### 7.1 Server prep

```bash
# Example Ubuntu
sudo apt update
sudo apt install -y ffmpeg

# Node 22+ via nvm or nodesource
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

### 7.2 App directory

```bash
sudo mkdir -p /opt/pulse-stream
sudo chown $USER:$USER /opt/pulse-stream
cd /opt/pulse-stream
git clone <your-repo-url> .
pnpm install --frozen-lockfile
pnpm build:platform
```

### 7.3 Production `.env`

```bash
cp .env.example .env
nano .env
```

**Minimum production values:**

```env
API_TOKEN=<openssl rand -hex 32>
API_HOST=127.0.0.1
API_PORT=8787
API_BASE_URL=http://127.0.0.1:8787

MEDIA_ROOT=media/samples
MEDIA_WORK_ROOT=.media-work
FFMPEG_BINARY=ffmpeg

STREMIO_ADDON_URL=https://torrentio.strem.fun/...|realdebrid=YOUR_KEY/
SPORTS_PROVIDER=sportsurge
MAX_RESOLUTION=720

# Protect a small disk
MAX_CONCURRENT_JOBS=2
MAX_EDGE_SESSIONS=24
STREAM_CACHE_ROOT=.media-cache
STREAM_CACHE_MAX_ENTRIES=15
CATALOG_WARM_INTERVAL_MS=1800000
CATALOG_WARM_COUNT=3
CATALOG_WARM_FULL_REMUX=false

ADS_PREROLL_ENABLED=false
```

Create dirs:

```bash
mkdir -p media/samples .media-work .media-cache
pnpm sample:generate   # optional
```

### 7.4 Run under a process manager

**systemd example** (`/etc/systemd/system/pulse-api.service`):

```ini
[Unit]
Description=Pulse Stream API
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/pulse-stream
Environment=NODE_ENV=production
ExecStart=/home/YOUR_USER/.local/share/pnpm/pnpm --filter @frankenstein/api start
Restart=on-failure
RestartSec=5
User=YOUR_USER

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now pulse-api
sudo systemctl status pulse-api
```

Keep the API on **localhost** and put **Caddy / nginx / Cloudflare Tunnel** in front of the **web** app (recommended). Only expose the API publicly if you understand that every client needs `API_TOKEN`.

### 7.5 Disk hygiene

```bash
# Safe: wipe in-flight remux junk (API also does this on boot)
rm -rf /opt/pulse-stream/.media-work/*

# Optional: reclaim cache (slower first plays until rewarmed)
# rm -rf /opt/pulse-stream/.media-cache/*
```

Do **not** commit or sync `.media-work` / `.media-cache` to git.

---

## 8. Production deploy — Web

Build on the same host (or a CI machine) with production env available at **build/start** time for the BFF.

### Same VPS as API

```env
# in /opt/pulse-stream/.env
API_TOKEN=<same as API>
API_BASE_URL=http://127.0.0.1:8787
NEXT_PUBLIC_BRAND_NAME=Pulse Stream
```

```bash
cd /opt/pulse-stream
pnpm build:web
pnpm start:web    # listens on :3000
```

**systemd** (`pulse-web.service`):

```ini
[Unit]
Description=Pulse Stream Web
After=network.target pulse-api.service

[Service]
Type=simple
WorkingDirectory=/opt/pulse-stream/apps/web
Environment=NODE_ENV=production
# Root .env is loaded by next.config; ensure API_* are in the environment or root .env
ExecStart=/home/YOUR_USER/.local/share/pnpm/pnpm start
Restart=on-failure
User=YOUR_USER

[Install]
WantedBy=multi-user.target
```

### Reverse proxy (Caddy example)

```caddy
stream.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

Users hit HTTPS → Next.js → BFF → local API. The token never reaches the browser.

### Split hosting (Vercel / separate Node)

If web runs on another host, set:

```env
API_BASE_URL=https://api.internal.example.com
API_TOKEN=<same secret>
```

The API must be reachable from that host (private network / tunnel). Prefer **not** exposing the raw API to the public internet without extra controls.

---

## 9. Production deploy — Mobile

### Release build

1. Point the app at your **public HTTPS API or BFF**.  
   - Prefer a dedicated HTTPS API gateway, **or**  
   - A small BFF that injects the token (do **not** ship a long-lived production `API_TOKEN` in a public APK if you can avoid it).  
2. For a private / family build, compile-time defines are OK:

```bash
cd apps/mobile
flutter build apk --release \
  --dart-define=API_BASE_URL=https://stream.example.com/api-upstream \
  --dart-define=API_TOKEN=YOUR_PRODUCTION_TOKEN
```

> If the app talks to the raw API, `API_BASE_URL` should be the API origin (no `/api` suffix); the client appends `/api`.

3. Replace the **test** AdMob App ID in `AndroidManifest.xml` with your production `ca-app-pub-…~…` before Play Store release.  
4. Disable cleartext for production when you only use HTTPS (remove or set `usesCleartextTraffic` to `false`).  
5. Distribute the APK / AAB via Play Console or internal testing.

### Settings screen

Users can still override Base URL + Token in-app (useful for staging). Secure storage holds the token on device.

---

## 10. Disk, cache & speed

| Layer | Path / service | Behavior |
|-------|----------------|----------|
| Work | `.media-work` | Per-session remux; deleted on stop; orphans purged on API boot |
| Cache | `.media-cache` | LRU trimmed by `STREAM_CACHE_MAX_ENTRIES` |
| CDN | Cloudflare R2 | Upload after successful remux; warm plays skip FFmpeg |

**To go faster in production:**

1. Set RealDebrid + Torrentio correctly (cached `RD+` links remux quickly).  
2. Enable **R2** so repeat plays are CDN hits.  
3. Keep `CATALOG_WARM_FULL_REMUX=false` on small VPS; use RD warm only.  
4. Prefer 720p (`MAX_RESOLUTION=720`) to cut CPU and disk.

See also [`docs/streaming-cache.md`](./docs/streaming-cache.md).

---

## 11. Ads (optional)

| Platform | Network | Config |
|----------|---------|--------|
| Web | VAST / Google IMA, or house card | `ADS_VAST_TAG_URL`, house `ADS_HOUSE_*` |
| Android | AdMob rewarded / interstitial | `ADMOB_*` + manifest App ID |

```env
ADS_ENABLED=true
ADS_PREROLL_ENABLED=false   # set true when keys are ready
ADS_SKIP_AFTER_SEC=5
```

AdMob **does not** run in the browser. Web uses VAST or house fallback.

---

## 12. Useful commands

| Command | Purpose |
|---------|---------|
| `pnpm install` | Install workspace deps |
| `pnpm build:platform` | Build types + media-worker + API |
| `pnpm build:web` | Build Next.js |
| `pnpm build:all` | Platform + web |
| `pnpm start:api` / `pnpm dev:api` | Run API |
| `pnpm start:web` / `pnpm dev:web` | Run web |
| `pnpm test:platform` | API + media-worker tests |
| `pnpm sample:generate` | Tiny sample MP4 under `media/samples` |

---

## 13. Troubleshooting

| Symptom | Likely fix |
|---------|------------|
| Web: “Unable to reach the media API” | Start API; check `API_BASE_URL` / firewall |
| Web / mobile: 401 | `API_TOKEN` mismatch between client and API |
| Movies empty / no streams | Set valid `STREMIO_ADDON_URL` with RealDebrid |
| “Too many concurrent playback sessions” | Raise `MAX_CONCURRENT_JOBS` / `MAX_EDGE_SESSIONS`, or wait for remux slots |
| Disk filling | Lower `STREAM_CACHE_MAX_ENTRIES`, `CATALOG_WARM_FULL_REMUX=false`, wipe `.media-work`, enable R2 |
| Movie dies ~1 hour in | Ensure you run a build that allows `seg_1000+.ts` (fixed in current API) |
| Phone can’t connect | `API_HOST=0.0.0.0`, same Wi‑Fi, use LAN IP, check firewall |
| Emulator can’t connect | Use `http://10.0.2.2:8787`, not `localhost` |
| AdMob never shows | App ID `~` in manifest must match publisher; unit ID `/` alone is not enough; web never uses AdMob |

---

## License

MIT — see repository license file if present.
