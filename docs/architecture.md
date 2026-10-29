# Architecture Audit — Phase One

**Date:** 2026-10-25  
**Branch:** `feature/web-android-platform` @ `f7b69d8`  
**Working tree at audit start:** clean  
**Working tree after baseline install:** `pnpm-lock.yaml` modified (3 lines; preserve — do not discard)

Phase One was an audit only. **Phase Two (2026-10-25)** added a parallel pnpm workspace (`packages/shared-types`, `services/media-worker`, `services/api`) for local sample HLS playback. **Phase 2B** adds an independent sports discovery + fixture live-session API (`services/api/src/sports/**`) — no Sportsurge scrape, no Discord selfbot. See `docs/api.md` and `docs/sports.md`. The Discord bot under `src/**` remains unchanged.

---

## 1. Current Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         DiscordFrankenstein (today)                        │
│                                                                            │
│  src/index.ts                                                              │
│    ├─ config validation (BOT_TOKEN, USER_TOKEN, STREMIO_ADDON_URL)         │
│    ├─ encoder.autoTune()  ──► FFmpeg benchmarks                            │
│    ├─ streamer/client     ──► discord.js-selfbot-v13 + Streamer            │
│    └─ bot/client          ──► discord.js v14 slash commands                │
│                                                                            │
│  User ──slash──► bot/interactions ──► commands/*                           │
│                      │                                                     │
│                      ├─ movie/series ──► cinemeta (+ optional tmdb)        │
│                      │                 ──► torrentio (RealDebrid URLs)     │
│                      │                 ──► opensubtitles (optional)        │
│                      ├─ live ──► sportsurge + livematch                    │
│                      └─ pause/play/skip/seek/stop/np/next/autoplay         │
│                                      │                                     │
│                                      ▼                                     │
│                         streamer/stream.ts (in-memory state + mutex)       │
│                                      │                                     │
│                    ffprobe ──► encoder.buildStreamOptions                  │
│                                      │                                     │
│                         @dank074/discord-video-stream (patched)            │
│                                      │                                     │
│                         FFmpeg ──► NUT pipe ──► Discord Go Live (RTP)      │
└──────────────────────────────────────────────────────────────────────────┘
```

**Transport:** Discord voice / Go Live only. There is **no HTTP API**, **no web UI**, **no Flutter app**, and **no shared OpenAPI contracts**.

---

## 2. Dependency and Runtime Requirements

| Component | Required / Observed | Notes |
|-----------|---------------------|-------|
| Node.js | ≥ 22.4.0 (README) | Shell default was Node 16; Node **22.23.2** used for baseline |
| pnpm | 10.33.0 (`packageManager`) | Corepack downloaded matching version |
| TypeScript | 6.0.2 | `strict`, ESM (`NodeNext`) |
| FFmpeg / FFprobe | ≥ 7.1 (README); host has **9.0.2** | Also pulled via `node-av` postinstall under pnpm |
| Flutter | Not used by current project | Local: Flutter **3.44.8**, Dart **3.12.2** |
| Android SDK | N/A for bot | Present (36.1.0-rc1); **Android licenses not fully accepted** |
| Database / Redis | None | In-memory module state only |

### Runtime dependencies (`package.json`)

- `@dank074/discord-video-stream@6.0.0` (patched)
- `discord.js@^14.25.1`
- `discord.js-selfbot-v13@^3.7.1` (**deprecated**; ToS-sensitive)
- `dotenv@^17.3.1`

### Dev dependencies

- `typescript`, `tsx`, `@types/node`, `@types/fluent-ffmpeg`

### Missing from repo vs README

- **`LICENSE` file is absent locally** (README links to MIT / upstream LICENSE URL). Must restore or fetch from upstream before distribution claims.
- **No automated test scripts** (`test` / `lint` not defined).
- **No web or mobile packages.**

---

## 3. Existing Features and Source Files

| Feature | Primary files |
|---------|----------------|
| Boot / shutdown | `src/index.ts` |
| Env config | `src/utils/config.ts`, `.env.example` |
| Logging | `src/utils/logger.ts` |
| Bot client + command registration | `src/bot/client.ts`, `src/bot/commands/register.ts` |
| Interaction routing | `src/bot/interactions.ts` |
| `/movie`, `/series`, `/live`, `/link` | `src/bot/commands/{movie,series,live,link}.ts` |
| Playback controls | `src/bot/commands/playback.ts`, `stop.ts` |
| Discord pickers | `src/bot/commands/{picker,options}.ts` |
| Voice resolution | `src/bot/commands/voice.ts` |
| Selfbot + Streamer | `src/streamer/client.ts` |
| Stream lifecycle / mutex / watchdog | `src/streamer/stream.ts` (~629 lines) |
| Encoder auto-tune + Discord encode options | `src/streamer/encoder.ts` |
| A/V sync monitor | `src/utils/sync.ts` |
| Metadata search | `src/services/cinemeta.ts`, `tmdb.ts` |
| Stream URL fetch / rank | `src/services/torrentio.ts` |
| Subtitles | `src/services/opensubtitles.ts` |
| Live sports scrape | `src/services/sportsurge.ts`, `livematch.ts` |
| Probe | `src/services/ffprobe.ts` |
| AMP hosting config | `amp/*` |
| Library patch | `patches/@dank074__discord-video-stream.patch` |
| Interactive setup | `scripts/setup.ts` |

---

## 4. Discord-Specific Modules

**Tightly coupled to Discord (replace / isolate for web+Flutter):**

- Entire `src/bot/**`
- `src/streamer/client.ts` (selfbot + `Streamer`)
- Most of `src/streamer/stream.ts` (`joinVoice`, `playStream`, guild/channel IDs)
- `src/streamer/encoder.ts` → returns `@dank074/...` `PrepareStreamOptions` / `Encoders.*`
- Patch file for Discord video stream library
- `.env` tokens: `BOT_TOKEN`, `USER_TOKEN`
- AMP configs describing Discord tokens

**Reusable with adaptation (logic ideas, not drop-in for browser):**

- Mutex + pause/seek/stop lifecycle patterns in `stream.ts`
- FFmpeg kill verification / watchdog concepts (must be scoped to **owned PIDs**, not global `pkill ffmpeg`)
- `ffprobe.ts` probe parsing
- Encoder auto-tune benchmarking approach (`execFile` + argument arrays)
- Logger pattern
- Config parsing helpers

---

## 5. Media Source Integrations

| Source | Role | File | Educational-project note |
|--------|------|------|--------------------------|
| Cinemeta | Title → IMDB / episode meta | `cinemeta.ts` | Third-party Stremio catalog |
| TMDB | Fallback search | `tmdb.ts` | Needs `TMDB_API_KEY` |
| Torrentio + RealDebrid | Stream URLs | `torrentio.ts` | Requires configured addon URL; copyright / ToS apply |
| OpenSubtitles (Stremio) | Subtitles | `opensubtitles.ts` | External download to temp |
| Sportsurge | Live sports scrape + HLS | `sportsurge.ts` | Scraping / embed decode; fragile + policy-sensitive |

**Phase Two decision:** validate the new API with a **local authorized sample file** only. Do **not** wire Torrentio / Sportsurge / RealDebrid into the first REST vertical slice.

---

## 6. FFmpeg Pipeline and Process Lifecycle

### Current pipeline

1. Resolve media URL (external or live HLS).
2. `probeStream(url, headers?)` via `ffprobe` (`execFile`, timeout 30s).
3. `autoTune()` / `buildStreamOptions()` for Discord-targeted H.264 Baseline + Opus.
4. `@dank074/discord-video-stream` `prepareStream` + `playStream` spawn FFmpeg → NUT → Discord RTP.
5. Watchdog: no frames for 15s → teardown.
6. Teardown: abort → stop library stream → kill FFmpeg (command + **global OS kill**) → settle → optional leave voice.

### Lifecycle operations (in-memory)

- Start, pause (save elapsed + leave voice), resume (seek with `-ss`), skip/seek (atomic restart), stop, stream-end → optional autoplay.

### Limitations for web / Flutter reuse

- Output is **Discord RTP / NUT**, not HLS / DASH / progressive MP4 for browsers or `video_player`.
- Encoder settings are Discord-profile specific.
- Global `pkill -9 ffmpeg` / `taskkill` is unsafe on a shared machine and must not carry into a media-worker API.
- Single concurrent stream assumption (selfbot / one Go Live).

---

## 7. State-Management Approach

All playback state lives as **module-level variables** in `src/streamer/stream.ts`, guarded by a **promise-chain mutex** (`streamLock`).

| State | Purpose |
|-------|---------|
| `activeStream` | Live job: abort controller, URL, seek offset, FFmpeg handle, watchdog |
| `pausedState` | Resume context |
| `autoplayEnabled` / callback | Series autoplay |
| `lastKnownGuildId` / `channelId` | Discord voice rejoin |

**No persistence across process restart.** Suitable pattern for a first local API (in-memory sessions), but sessions must become keyed by `sessionId` + authorized user, not Discord guild/channel.

---

## 8. Security and Configuration Risks

| Risk | Severity | Detail |
|------|----------|--------|
| Discord user token / selfbot | High (policy) | Violates Discord ToS; keep out of new educational clients |
| Secrets in `.env` | High if leaked | Tokens + RealDebrid-bearing addon URL; never commit |
| Arbitrary URL → FFmpeg/ffprobe | High (SSRF) | External stream URLs passed to probe/encode; new API must allowlist local media roots / protocols |
| Global FFmpeg kill | High (host impact) | Kills **all** FFmpeg processes on the machine |
| Shell injection | Lower (current) | Uses `execFile` + arg arrays (good); preserve this pattern |
| No auth on bot beyond Discord | N/A for Discord; Critical for HTTP | New REST API needs private-test auth |
| Scraping / unlicensed sources | Legal / ethical | Out of scope for first authorized local-media slice |
| Missing LICENSE file locally | Compliance | README claims MIT; file missing in checkout |
| Client-side secrets | Future web risk | Do not put server tokens in Next.js public env |

---

## 9. Build and Test Baseline (executed)

Commands run on 2026-10-25 (Node 22.23.2):

| Check | Result |
|-------|--------|
| `pnpm install` | **Succeeded** (warning: ignored build scripts for `@seydx/node-av-darwin-arm64`; `node-av` postinstall completed) |
| `pnpm build` (`tsc`) | **Succeeded** (exit 0) |
| `npx tsc --noEmit` | **Succeeded** (exit 0) |
| Unit / integration tests | **Not present** — no test runner configured |
| Lint | **Not configured** |
| `pnpm start` / Discord login | **Not run** (would require secrets; out of scope for audit) |
| Flutter `flutter doctor` | Flutter OK; Android licenses incomplete; no Android emulator listed among connected devices |
| FFmpeg/FFprobe on PATH | **9.0.2** available |

---

## 10. Git and Upstream Strategy (current)

| Item | Value |
|------|-------|
| Branch | `feature/web-android-platform` (same commit as `master` / `origin/master`) |
| `origin` | `https://github.com/holuedarey/DiscordFrankenstein.git` |
| `upstream` | **Not configured** |
| Original project | `https://github.com/Green-LED99/DiscordFrankenstein` |

**Recommendation (do not auto-apply):**

```bash
git remote add upstream https://github.com/Green-LED99/DiscordFrankenstein.git
git fetch upstream
# Inspect only; do not merge into default/production without review
git log --oneline HEAD..upstream/master
```

Preserve original bot under a clear path (see proposed structure) so upstream merges stay localized. Full sync workflow will live in `docs/upstream-updates.md` (Phase Eight); outline:

1. Fetch upstream on a throwaway/sync branch.
2. Merge or rebase onto a dedicated `upstream-sync/*` branch — never force-push `master`.
3. Resolve conflicts preferentially in original Discord paths; keep `apps/` and `services/api` changes intact.
4. Run baseline `pnpm build` + new API/web tests before merging to the working feature branch.

---

## 11. Reusable vs Replace Modules

| Keep / adapt | Replace for new platform | Defer / optional |
|--------------|--------------------------|------------------|
| `logger.ts` patterns | Discord bot + selfbot clients | Cinemeta / TMDB as optional catalog later |
| `ffprobe.ts` (with URL allowlisting) | `@dank074` + patch for web/Flutter output | Torrentio / Sportsurge |
| Auto-tune ideas in `encoder.ts` | Discord-specific `buildStreamOptions` | OpenSubtitles |
| Lifecycle concepts (mutex, pause/seek/stop) | Global FFmpeg OS kill | AMP Discord config |
| `config` validation style | Token-required boot for HTTP-only mode | — |

---

## 12. Proposed Target Directory Structure

Adapt preferred layout **without** blindly moving Discord sources on day one. Keep the bot runnable for upstream continuity:

```
DiscordFrankenstein/                 # repo root (keep name for fork continuity)
├── apps/
│   ├── web/                         # Next.js + TypeScript (FeelReels-inspired UI)
│   └── mobile/                      # Flutter Android (outside pnpm workspace packages)
├── services/
│   ├── api/                         # Express (or Fastify) REST + auth + playback sessions
│   └── media-worker/                # FFmpeg jobs → web-compatible output (e.g. HLS)
├── packages/
│   └── shared-types/                # Zod schemas + OpenAPI source of truth
├── legacy-discord/                  # OPTIONAL later move of current src/
│   └── (current bot — or leave src/ in place initially)
├── src/                             # Phase 2+: leave Discord bot here initially
├── docs/
│   ├── architecture.md              # this file
│   ├── ui-template.md
│   ├── setup.md                     # later
│   ├── api.md                       # later
│   ├── testing.md                   # later
│   └── upstream-updates.md          # later
├── media/samples/                   # authorized local sample video(s) (gitignored binaries OK)
├── .env.example                     # extend for API/web without removing Discord vars
├── package.json                     # evolve to pnpm workspace root
├── pnpm-workspace.yaml              # apps/web, services/*, packages/* (not Flutter)
└── README.md
```

**Rationale:** Leaving `src/` in place initially minimizes upstream merge pain. Relocate to `legacy-discord/` only after a deliberate, documented move.

**Flutter:** create with `flutter create` under `apps/mobile`; do **not** add it as a pnpm workspace package.

---

## 13. Migration Risks and Acceptance Criteria

### Risks

1. Over-coupling new API to Discord stream library → unusable in browser/Flutter.
2. Accidental inclusion of unlicensed remote stream providers in “hello world”.
3. Breaking Discord bot when introducing workspaces / shared tsconfig.
4. Upstream conflict explosion if files are mass-moved early.
5. SSRF / path traversal if media API accepts unchecked URLs or paths.
6. Orphaned FFmpeg children if PID tracking is weaker than current teardown.
7. UI drift: template is a **screenshot**, not source — visual fidelity needs explicit comparison.
8. Node version mismatch (developers on Node 16).

### Phase One acceptance (this phase)

- [x] Repository and Git state inspected without discarding work
- [x] Dependencies and structure documented
- [x] Discord vs reusable boundaries identified
- [x] Baseline `pnpm build` / `tsc --noEmit` recorded
- [x] UI template classified (`docs/ui-template.md`)
- [x] Target structure proposed
- [ ] No full migration started (met by design)

### Next-phase acceptance (preview)

Phase Two is complete when:

1. API serves `GET /api/health`.
2. Local sample media is searchable / fetchable by id.
3. Playback session can start/pause/resume/seek/stop with validated schemas.
4. Auth gates mutating routes.
5. FFmpeg child PIDs are tracked and cleaned without global `pkill`.
6. Automated tests cover success and failure paths for those routes.

---

## 14. Exact Files Intended for Phase Two (preview)

No Phase Two edits in this commit set unless explicitly approved after this audit. Planned **first** touch list:

| Action | Path |
|--------|------|
| Create | `pnpm-workspace.yaml` |
| Update | root `package.json` (workspaces, scripts; keep Discord scripts) |
| Create | `packages/shared-types/**` (Zod: MediaItem, PlaybackSession, ApiError, HealthStatus) |
| Create | `services/api/package.json`, `tsconfig.json`, `src/index.ts`, routes, auth middleware |
| Create | `services/media-worker/**` (thin FFmpeg job wrapper; local file only) |
| Create | `media/samples/.gitkeep` (+ document how to add a sample file) |
| Update | `.env.example` (API port, auth token, `MEDIA_ROOT`, retain Discord vars) |
| Create | `docs/api.md` (draft OpenAPI / contract notes) |
| Update | `.gitignore` (`media/samples/*` binaries, API artifacts) |
| Preserve | entire existing `src/**` Discord bot unchanged in Phase Two |

**Explicitly deferred:** `apps/web`, `apps/mobile`, upstream remote add, LICENSE restore (recommend early but separate), remote stream providers.

---

## 15. Summary Verdict

The repository is a **mature Discord dual-client streaming bot** with solid FFmpeg lifecycle thinking, **zero HTTP surface**, and **strong Discord transport coupling**. The educational multi-client media app should be built as a **parallel monorepo slice** that reuses probe/logging/lifecycle ideas while replacing Discord Go Live with a web-compatible media-worker output and shared REST contracts. The attached UI is a **visual design reference screenshot** (FeelReels-like), not an implementable codebase—see `docs/ui-template.md`.
