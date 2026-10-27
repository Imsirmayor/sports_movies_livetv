# Pulse Stream — Flutter Android

Mobile client for the same API as `apps/web`.

Full stack setup (API env, web, deploy): **[root README](../../README.md)**.

---

## Quick local run

1. Start the API from the repo root (`pnpm start:api`) with `API_TOKEN` in `.env`.
2. Emulator:

```bash
cd apps/mobile
flutter pub get
flutter run \
  --dart-define=API_BASE_URL=http://10.0.2.2:8787 \
  --dart-define=API_TOKEN=your-api-token
```

3. Physical device: set `API_HOST=0.0.0.0` on the API, use your LAN IP instead of `10.0.2.2`.

Or paste Base URL + Token under in-app **Settings**.

---

## Streaming cache & Cloudflare R2

Playback HLS is decided **on the API**, not in Flutter. The app just plays whatever `playlistUrl` the session returns.

| Mode | When | What the phone plays |
|------|------|----------------------|
| **R2 CDN** | `R2_*` set in server `.env` and object exists | Public `https://…r2.dev/hls/…/index.m3u8` (no Bearer header) |
| **Local server cache** | R2 off, missing, or upload failed | `http(s)://your-api/api/playback/…/stream/index.m3u8` (Bearer required) |
| **Cold remux** | No cache yet | Same API stream URL while FFmpeg builds HLS |

### Configure on the **server** (repo root `.env`)

```env
# Always keep local disk cache as fallback
STREAM_CACHE_ROOT=.media-cache
STREAM_CACHE_MAX_ENTRIES=20

# Optional CDN — leave blank to use local cache only
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=https://pub-xxxx.r2.dev
R2_PREFIX=hls
```

1. Create an R2 bucket + public access (or custom domain) + S3 API token.  
2. Paste values into `.env` (see root README § R2).  
3. Restart API → `GET /api/health` should show `"r2Enabled": true` and `"streamDelivery": "r2_then_local"`.  
4. Without R2 keys: `"r2Enabled": false`, `"streamDelivery": "local"` — mobile still works via server cache.

**Fallback rule (API):** prefer R2 → if unavailable, serve `.media-cache` from the server → if neither, remux again.

No extra Flutter flags are required for R2. After a title has been remuxed once (and uploaded), the next play gets a public HTTPS playlist; the player omits the API token for those CDN URLs automatically.

### CORS

If the web app uses R2, allow your web origin on the bucket. Mobile native players usually do not need CORS; web does.

---

## AdMob (optional)

1. Set `ADMOB_ANDROID_APP_ID` (`…~…`) and unit IDs in server `.env`.  
2. Put the same App ID in `android/app/src/main/AndroidManifest.xml`.  
3. Rebuild/reinstall the app.

---

## Layout

```
lib/
  app/          theme, router, providers, shell
  core/         config, errors
  data/         Dio API client, models, local stores
  features/     home, sports, movies, series, player, library, search, account, ads
  shared/       reusable widgets
```

State: Riverpod · Routing: go_router · HTTP: Dio · Ads: `google_mobile_ads`
