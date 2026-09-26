> ## ⚠️ Historical record — not current documentation
>
> This is the **original brief**, written before the app existed and before the printed guide was
> available. It is kept because it explains *why* the app is shaped the way it is, but several of its
> decisions were reversed during the build. **Where this file and the app disagree, the app is right.**
>
> | This document says | What was actually built |
> | :-- | :-- |
> | Dark theme by default (§3.5) | **Light**, matching the printed guide, whose palette *is* `program.theme.colors` |
> | A Week screen driven by `weeklySchedule` (§3.2) | **Dropped.** Gym sessions rotate with a ~2-day gap, so a fixed weekday calendar was meaningless. Tabs instead: Swim, Day 1, Day 2, Day 3, Guide (as of v7.0) |
> | Local `public/media/*.mp4`, ffmpeg pipeline, `MEDIA.md` (§3.4) | **Dropped.** Exercise videos are external YouTube links in `media.json`. Linking avoids re-hosting other people's clips |
> | Cues collapsed behind a toggle (§3.2) | **Always visible**, as bullets, per the printed guide |
> | Wake lock "nice-to-have, after Phase 3" (§3.5) | **Built** |
> | Export/import in Phase 5 (§3.7) | **Built**, plus a per-exercise history view that was never specified |
>
> For what the app actually does, see the [README](../README.md). For the conventions that govern the
> code, see [CLAUDE.md](../CLAUDE.md). For the `program.json` contract, see [DATA.md](DATA.md).

---

# Kickoff prompt — Workout Trainer PWA

Drop `program.json`, `README.md` (the schema doc) and this file into an empty repo, open it in VS Code, start Claude Code and paste the **Kickoff prompt** below. Everything after it is the spec Claude Code should read from disk rather than from your message.

---

## 1. The prompt to paste

> Build me an offline-first workout PWA I can install on my Android phone and use in the gym.
>
> Read `program.json` (the training program, read-only source of truth), `README.md` (its schema) and `APP_PROJECT_PROMPT.md` (the full spec) before writing any code. Then propose a plan and wait for my approval — I want to review the data model and the screen breakdown before you start.
>
> Stack: **vanilla JS (ES modules) + Vite + a service worker**. No React, no UI framework, no runtime CDN. I'm a full-stack JS/React/Python dev, so write it the way you'd write it for yourself — small pure modules, no cleverness, no comments explaining obvious code.
>
> Only two things are interactive: a per-exercise **free-text log field** (weights *and* notes, not just a number) and a **video/image reference** per exercise. Everything else is static rendering of `program.json`.
>
> Storage is on-device (IndexedDB) with JSON export/import. No backend, no accounts, no network calls at runtime.
>
> Work in phases, commit after each, and keep `CLAUDE.md` updated with the conventions you settle on. Start with Phase 1 only.

---

## 2. Why this stack

| Decision | Choice | Reason |
| :---- | :---- | :---- |
| Framework | **Vanilla JS + Vite** | The app has exactly two interactive widgets. React would add a build/runtime layer that buys nothing here; vanilla keeps the bundle at a few kB so it opens instantly on a cold phone in a basement gym. You already know React — use it only if the app grows a real router and shared state. |
| Distribution | **PWA, installed from Chrome** ("Add to home screen") | No Play Store, no signing, no Capacitor/TWA wrapper. Reinstalling = reloading a URL. Serve from GitHub Pages (private repo + Pages, or public — no personal data is in the repo). |
| Offline | **Service worker, precache app shell + `program.json` + all media** | The gym has no signal. The whole media set is ~15 clips at 1–2 MB = 20–30 MB, small enough to precache in one go — no cache-on-demand complexity needed. |
| Storage | **IndexedDB** (via `idb-keyval`, ~1 kB) + manual JSON export/import | localStorage is synchronous and size-capped; IndexedDB is the correct primitive and `idb-keyval` removes the ceremony. Export/import means a browser-data wipe can't destroy your history. |
| Media | **Local files in `/public/media`**, named by exercise code | Fully offline, no third-party player, no embed policy to fight. |
| Tests | **Vitest** on pure logic only (log parsing, date keys, export/import round-trip) | Don't let Claude Code build a Playwright suite for a two-screen app. |

---

## 3. Spec

### 3.1 Data

- `program.json` is **read-only**. The app never writes to it. Bump `schemaVersion` if the shape ever changes; the app should refuse to boot on an unknown major version with a clear message.

- User data lives in one IndexedDB store, `logs`, keyed `"<exerciseCode>:<YYYY-MM-DD>"`:

  ```js
  { key: "B5:2026-08-29", code: "B5", date: "2026-08-29", text: "22kg x10,10,9 — long-head stretch felt good", updatedAt: 1756... }
  ```

- Free text is deliberate: `"60kg x8 / 62.5 x6 — last set grindy, keep 60 next week"` must be storable verbatim. **Do not** force a numeric schema.

- A tiny optional helper `parseTopWeight(text)` may extract the first `\d+([.,]\d+)?\s?kg` for a sparkline. It must never block saving, never rewrite the user's text, and return `null` freely.

- Export = one JSON file `workout-log-YYYY-MM-DD.json` containing every entry + `schemaVersion`. Import = merge by key, newest `updatedAt` wins, and always show a "N entries imported, M updated" confirmation.

### 3.2 Screens

1. **Week** (home) — the 7 rows of `weeklySchedule`. Gym days are tappable and visually distinct; today's row is highlighted. Header shows program title + version from `program.program`.
2. **Workout** (`#/workout/workout-b`) — the exercise list for that session. Each exercise renders as a card matching the PDF's information hierarchy:
   - code chip (`B5`), name, badges from `tags` (`key-compound` = blue, `updated` = amber)
   - sets/reps pill (`prescription`)
   - meta line: `tempo` if present, else `benefit`, else `grip`
   - cues collapsed behind a "Cues" toggle — expanded state is per-card, remembered in session
   - **media button** and **log field** (below)
3. **Reference sheets** (a secondary tab or a link at the bottom of Week) — `rules`, `warmUp`, `coolDown`, `swappingMatrix`, `summaryStrategy`. Pure static rendering; low priority, do it last.

No router library: `location.hash` + a `render()` switch is enough.

### 3.3 The log field

The one thing that must feel good with sweaty hands:

- A `<textarea>` per exercise, auto-growing, ~2 rows collapsed.
- **Prefilled with today's entry if one exists**; otherwise empty with the *last* session's entry shown above it as dimmed reference text (`Last (Aug 22): 60kg x8,8,7`). Tapping that reference copies it into the field — that single interaction is 90% of gym logging.
- Autosave on `input`, debounced 500 ms, plus a flush on `blur` and on `visibilitychange` (Android kills backgrounded tabs — an unsaved set is a bug).
- A subtle saved indicator; never a modal, never a toast that steals focus.
- A per-exercise history sheet: reverse-chronological list of past entries, editable.

### 3.4 The media reference

- **Budget: ~15 clips, 1–2 MB each, 20–30 MB total. Ship them in the repo — that is a non-issue on any Android phone and well inside GitHub Pages limits. Do not build a streaming or download-on-demand path for this size.**
- Files live at `public/media/<code>.mp4` and `public/media/<code>.jpg` (poster), lowercase code: `b5.mp4`, `b5.jpg`. A `MEDIA.md` should list which codes still lack a clip.
- Normalize every clip before committing — 720p, H.264, no audio track, trimmed to 2–3 clean reps (10–20 s is a better reference than 2 minutes, and drops each file to a few hundred kB): `ffmpeg -i in.mp4 -t 20 -vf "scale=-2:720,fps=30" -c:v libx264 -crf 28 -preset slow -an -movflags +faststart b5.mp4` and `ffmpeg -i b5.mp4 -ss 1 -frames:v 1 -q:v 4 b5.jpg` for the poster.
- The card shows the poster as a small thumbnail with a play affordance. Tapping expands an inline `<video controls muted loop playsinline preload="none">` — `playsinline` is mandatory or Android Chrome hijacks it fullscreen.
- Graceful absence: if the poster 404s, render a neutral placeholder with the exercise name — a missing clip must never break the card.
- Service worker: precache the shell, `program.json` and `/media/*` on install; serve media `CacheFirst`. No cache size cap, no LRU eviction — the whole set is ~30 MB. Show install progress the first time so a 30 MB fetch on mobile data isn't silent.

### 3.5 Non-functional

- Dark theme by default, palette from `program.theme.colors`; large type; tap targets ≥ 44 px; one-thumb reachable primary actions.
- Time-to-interactive under a second on a mid-range phone, offline, from a cold start.
- Keep scroll position when returning from a workout to the week view.
- Nice-to-have, only after Phase 3: `navigator.wakeLock` while a workout screen is open.
- No analytics, no fonts from a CDN, no external requests of any kind at runtime.

### 3.6 Repo shape

```
├── index.html
├── vite.config.js
├── CLAUDE.md
├── MEDIA.md
├── program.json
├── public/
│   ├── manifest.webmanifest
│   ├── icons/
│   └── media/            b5.mp4, b5.jpg, ...
└── src/
    ├── main.js           boot, hash router
    ├── db.js             IndexedDB wrapper (idb-keyval)
    ├── logs.js           get/save/history/export/import  ← unit-tested
    ├── program.js        load + validate program.json
    ├── views/            week.js, workout.js, reference.js
    ├── components/       exercise-card.js, log-field.js, media.js
    └── styles.css
```

### 3.7 Phases

1. **Phase 1** — Vite scaffold, load and validate `program.json`, Week + Workout views rendering read-only cards. No storage, no media yet. Verify against the PDF that nothing is missing.
2. **Phase 2** — IndexedDB, log field with autosave, last-session reference, per-exercise history. Vitest for `logs.js`.
3. **Phase 3** — Media thumbnails + inline video, `MEDIA.md` inventory.
4. **Phase 4** — Manifest, icons, service worker, install prompt; verify offline on the phone.
5. **Phase 5** — Export/import, reference sheets, wake lock.

### 3.8 Definition of done

- [ ] Installs to the Android home screen and launches standalone (no browser chrome).
- [ ] Fully usable in airplane mode after one online visit, including previously played clips.
- [ ] Every exercise in `program.json` renders with correct sets/reps, tempo/benefit, badges and cues.
- [ ] A logged entry survives: app close, phone restart, and a Vite rebuild/redeploy.
- [ ] Export → clear site data → import restores every entry byte-for-byte.
- [ ] A missing `.mp4`/`.jpg` degrades to a placeholder, never an error.
- [ ] Lighthouse PWA "installable" passes; bundle (excluding media) under 50 kB gzipped.

### 3.9 Out of scope — say no to these

Accounts, cloud sync, a Python backend, timers, plate calculators, charts beyond a single optional sparkline, notifications, Capacitor/TWA packaging, a component library, TypeScript (unless you decide otherwise — the app is ~600 lines), and editing the program itself in-app. Program changes happen by editing `program.json` in the repo and redeploying.

---

## 4. Add this to `CLAUDE.md`

```markdown
# Workout PWA

Vanilla JS + Vite PWA. No frameworks, no runtime network calls.

- `program.json` is read-only program data; user logs live in IndexedDB only.
- Log entries are FREE TEXT. Never coerce them to numbers, never rewrite user input.
- Exercise codes (A1..B6) are the stable keys everywhere: logs, media filenames, DOM ids.
- Every save path must survive `visibilitychange` — Android kills backgrounded tabs.
- Video tags always need `playsinline muted preload="none"`.
- Missing media degrades to a placeholder; it is never an error state.
- Unit-test pure logic in `logs.js` only. No e2e suite.
```
