# UI Template Inspection — Phase One

**Date:** 2026-10-25  
**Artifact inspected:** Conversation attachment  
`Screenshot_2026-10-25_at_17.38.50-….jpg`  
(also mirrored under Cursor project assets)

---

## 1. Classification

| Question | Finding |
|----------|---------|
| Standalone application source? | **No** |
| Component library / design system package? | **No** |
| Collection of reusable assets (SVG, fonts, tokens)? | **No** |
| Design reference (screenshot / mock)? | **Yes — this is the only template artifact** |

**Update (2026-10-25):** Primary visual branding for the web app is now **Bowa** (bow-tie logo) with a dark Cinemos-style dashboard + player chrome from later attached references. The original FeelReels screenshot remains historical context.

**Verdict:** The original “UI template” was a **high-fidelity screenshot** (FeelReels), not an importable React codebase. Newer references (Cinemos / oni / player / health dashboard) guide the Bowa redesign.

**Implication:** There are no template files to “reuse directly.” The web app must be **implemented to match** this layout, palette, and interaction patterns in Next.js + TypeScript. Original screenshot must **not** be overwritten or treated as code.

---

## 2. What Was Available vs Missing

### Available

- One desktop viewport screenshot of the **playback / watch** screen.
- Observable layout, chrome, typography character, color accents, and control placement.
- Visible copy (titles, nav labels, PWA prompt text).

### Missing (must not invent as if they existed)

- No `package.json`, React/Vue/Svelte sources, Storybook, Figma export, or CSS tokens file.
- No font files or confirmed font family names (UI appears system / clean sans-serif).
- No icon set package (icons resemble Lucide / Heroicons-style strokes).
- No mobile / tablet layouts.
- No separate screens for Home grid, Search results, Settings, Auth, or Wallet beyond what appears as chrome on this page.
- No confirmed framework (Netlify badge only implies prior hosting of that product, not our stack).

If additional template archives (zip, repo, Figma) exist, they should be attached before claiming component reuse.

---

## 3. Observed Application Shell

### Top navigation

- Brand: play-badge mark + wordmark **feelreels** (left).
- Center: pill search — placeholder *“Search series, genres, studios...”*.
- Right: **Download App**, coin balance (**50** + add), **Sign in**.

### Left sidebar

- Primary: **Home** (active, red home icon), Trending, New releases, Top rated.
- Library: Continue watching, My List, Top up.
- Continue-watching mini-list: thumbnail + title + “N episodes left”.
- Bottom: blue **Download App** CTA.

### Center (primary)

- Large 16:9 player (dark stage).
- Player overlays: series title, episode title.
- Floating vertical actions on player right: Like, Save, Share (+ count).
- Transport: play/pause, −10s / +10s, next, volume, time `0:01 / 2:13`, red progress, settings, quality (HD), PiP, fullscreen.
- Below player: title · Episode N, relative date, star rating, **Add to My List**.
- Creator row: avatar, name (Demo Admin), episode count.
- Engagement: Like / Comment / Share.
- Description paragraph.

### Right sidebar

- **Up next** queue: thumbnail, episode badge, title, genre, creator, relative date; one item highlighted.
- Floating **Install FeelReels** PWA card (Install / Not now).
- “Powered by Netlify” badge (reference product only — **do not** require Netlify for our app).

---

## 4. Design Tokens (observed, approximate)

Extracted visually from the screenshot; to be formalized as CSS variables in `apps/web` later.

| Token | Approx value | Usage |
|-------|--------------|-------|
| `--bg-page` | `#FFFFFF` | App background |
| `--bg-subtle` | light gray | Search field, chips |
| `--border` | light gray | Sidebar / column rules |
| `--text-primary` | near-black | Titles, nav |
| `--text-muted` | medium gray | Meta, dates |
| `--accent-danger` / brand red | ~`#E50914` / soft red | Active Home, progress, like accents |
| `--accent-cta` | medium blue | Download App buttons |
| `--player-bg` | `#000000` | Video stage |
| `--radius-control` | large pill / rounded | Search, buttons |
| `--radius-card` | moderate | Queue rows, PWA card |
| Font | Clean sans-serif | Unspecified; choose a purposeful non-default stack at implementation (avoid Inter/Roboto/Arial/system as the sole identity) |

Spacing: generous white space; three-column desktop dashboard; player is the visual hero of this screen.

---

## 5. Page Hierarchy Mapping (template → our app)

Map FeelReels chrome to the educational media product. Rename brand in implementation unless the user directs otherwise (recommend **configurable product name**; do not claim to be FeelReels).

| Template surface | Our screen / route (planned) | Notes |
|------------------|------------------------------|-------|
| Home (nav) | Dashboard / browse | Need design extension — not shown as a grid in screenshot |
| Search bar | Media discovery + results | Wire to `GET /api/media/search` |
| Player + metadata | Playback + details | Vertical slice priority |
| Up next | Queue / related local samples | Local catalog only at first |
| Continue watching | Session / recent playback | Backend session status |
| My List | Optional later | Stub nav OK if non-destructive |
| Trending / New / Top rated | Optional filters | Can map to sorted local catalog |
| Top up / coins | **Out of scope** for educational player | Hide or disable; do not fake payments |
| Sign in | Private-test auth | API token / simple login — not Discord OAuth required |
| Download App / PWA | Optional PWA later | Document; do not block vertical slice |
| Settings (player cog) | Quality + **API connection status** | Expose health, not server paths |
| Comments | Defer | Non-essential |

---

## 6. Component Inventory (to implement)

No reusable imports exist. Planned React components (names indicative):

**Shell**

- `AppShell`, `TopNav`, `SideNav`, `RightRail`

**Discovery**

- `SearchField`, `MediaCard`, `ContinueWatchingList`, `UpNextList`

**Playback**

- `VideoStage`, `PlayerControls`, `ProgressBar`, `PlayerActionRail`
- `MediaHeader`, `CreatorRow`, `DescriptionBlock`

**Status / system**

- `ConnectionStatus`, `ErrorState`, `EmptyState`, `LoadingState`
- `PwaInstallPrompt` (optional)

**Player tech note:** Prefer a browser-native or HLS-capable player (e.g. native `<video>` for progressive MP4 / HLS.js for HLS) driven by **API playback URLs**, not Discord NUT/RTP.

---

## 7. Framework Compatibility

| Preferred stack | Compatible with screenshot? |
|-----------------|------------------------------|
| React + Next.js + TypeScript | **Yes** — layout is a standard app shell; no template constraint against Next.js |
| Flutter | Separate Android client; share API contracts, not this DOM layout |

**Smallest adaptation:** Implement a Next.js App Router app that recreates the three-column shell and playback page. No need for a different React meta-framework based on the screenshot alone.

**Incompatibility:** None technical. The gap is **assets and code**, not framework mismatch.

---

## 8. Responsive Behavior

Screenshot is **desktop-wide** (~ three columns). Inferred responsive strategy (to validate during implementation):

- **lg+:** Left nav + center player + right “Up next”.
- **md:** Collapse right rail under player or into a tab.
- **sm:** Bottom nav or hamburger; player full width; hide coin/top-up chrome.

No mobile screenshot was provided — mobile web layout will be an informed adaptation, not pixel-matched.

---

## 9. Interaction Requirements (non-decorative)

Per master prompt: controls must work.

| Control | Required behavior (Phase Four+) |
|---------|----------------------------------|
| Search | Query API; show results / empty / error |
| Home / nav links | Real routes |
| Play / pause / seek / stop | Call playback API; reflect session status |
| Like / Save / Share / Comments / Top up | Defer or no-op with clear disabled state — **do not** fake success |
| Add to My List | Optional local preference later |
| Install / Not now | Dismissible local state if PWA unsupported |
| Sign in | Real private-test auth flow |

---

## 10. Pixel-Perfect Claim Policy

**Do not claim pixel-perfect parity** until a side-by-side comparison against this screenshot is performed after implementation (spacing, type scale, control geometry, colors). Phase One only records the reference.

Screenshot path for later comparison:

- Conversation asset: Cursor project `assets/Screenshot_2026-10-25_at_17.38.50-….jpg`

Recommend copying a **read-only** reference into `docs/references/ui-feelreels-playback.png` in a later docs pass (with user permission) so the repo carries the visual target.

---

## 11. Implementation Mapping Summary

1. Treat FeelReels screenshot as **visual / UX reference** for `apps/web`.
2. Build components from scratch in Next.js; extract CSS variables from Section 4.
3. Prioritize shell + playback vertical slice over marketing chrome (coins, comments, Netlify).
4. Ask before adding any third-party FeelReels assets or overwriting the reference image.
5. Proceed to backend foundation first so the player has a real API to bind to.

---

## 12. Acceptance for This Document

- [x] Template classified as design reference screenshot  
- [x] Layout, tokens, and screen mapping documented  
- [x] Missing source files explicitly listed  
- [x] No template files overwritten  
- [x] No claim of existing reusable component code  
