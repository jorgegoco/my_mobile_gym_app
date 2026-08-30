# Workout PWA

Vanilla JS (ES modules) + Vite. No frameworks, no runtime network calls, no CDN.
Offline-first, installed to an Android home screen and used in the gym.

`Chest_and_Arms_Workout_Guide.pdf` in the repo root is the **design reference** — the app is meant to
look like that document. `README.md` documents the `program.json` schema; `APP_PROJECT_PROMPT.md` is
the original spec, with the deviations below.

## Deviations from APP_PROJECT_PROMPT.md

The spec was written before the PDF was available. Where they disagree, this file wins:

- **§3.5 "dark theme by default" is void.** The app is light, matching the PDF. `program.theme.colors`
  is the PDF's own palette and is used verbatim — no derived values, no dark mode.
- **§3.2's Week screen is gone.** Sessions rotate with a roughly two-day gap, so a fixed weekday
  calendar is meaningless. `weeklySchedule` stays in `program.json` but nothing renders it, and
  nothing validates it.
- **§3.4's local media pipeline is void.** No `public/media/`, no ffmpeg, no `MEDIA.md`. Exercise
  video references are external YouTube links in `media.json`.
- **Cues are always visible**, as bullets, per the PDF — not collapsed behind a toggle.

## Data

- `program.json` is **read-only program data**. The app never writes to it. Program changes happen by
  editing the file and redeploying — never in-app.
- It is a **bundled import**, not a runtime fetch: no request on the critical path, nothing extra for
  a service worker to precache.
- `media.json` maps exercise code → video URL, kept separate from `program.json` so a future program
  version can be dropped in without losing the links. A6 and B6 share a URL by design — same exercise
  on both days. This is the only feature that needs signal; everything else works offline.
- User logs live in IndexedDB only (`workout-log` / `logs`), keyed `"<code>:<YYYY-MM-DD>"`.

## Hard rules

- Log entries are **FREE TEXT**. Never coerce to numbers, never rewrite user input. `parseTopWeight`
  may read it, never edit it, and returns `null` freely.
- **User text never goes through `innerHTML`** — `textContent` / `.value` only. Static program data
  may be interpolated into templates, but only via `esc()` from `src/dom.js`.
- **`flushPending()` must run before any `innerHTML` swap.** `render()` awaits it first. Without that,
  a tab switch inside the 500 ms autosave debounce silently loses the set just typed.
- **A late IndexedDB read must never overwrite live typing.** `hydrateLogFields` fills a box only when
  it is unfocused and `data-hydrated` is unset.
- Date keys are built from `getFullYear/getMonth/getDate` — **never `toISOString()`**. In CEST the UTC
  date is a day behind between midnight and 02:00, which would file a session under the wrong day.
  See `todayKey()` in `src/program.js`.
- Exercise codes `A1..B6` are the stable keys everywhere: logs, `media.json`, DOM ids (`ex-B5`),
  delegation attributes.
- Saves flush on `input` (debounced 500 ms), `blur`, `visibilitychange` and `pagehide` — Android kills
  backgrounded tabs and an unsaved set is a bug.
- Validation refuses to boot on an unknown `schemaVersion` major and shows a readable message.
  `validateProgram()` is called from `main.js`, not at module load, so the error is catchable.
- Tap targets ≥ 44 px (`--tap`).

## Conventions

- Views and components are pure functions returning HTML strings; `main.js` owns the single
  `innerHTML` assignment and all event delegation on `#app`. No per-node listeners.
- Routing is `location.hash` + a `render()` switch: `#/workout-a`, `#/workout-b`, `#/guide`.
  No router library.
- Scroll position is kept per tab in a module-level map.
- The last tab is persisted in `localStorage` — a deliberate exception to "UI state is not persisted",
  because a PWA cold-starts with no hash and should reopen where he left off. Every access is wrapped
  in try/catch; private mode just forgets.
- The Guide's 3-column protocol table stacks into labelled blocks under 700 px. Never let a table
  scroll sideways inside a phone page.
- Unit-test pure logic in `logs.js` only (`src/logs.test.js`, Vitest + fake-indexeddb). No e2e suite.

## Commands

    npm install
    npm run dev       # http://localhost:5173
    npm test          # vitest run
    npm run build     # budget: under 50 kB gzipped

## Still to do

Service worker, manifest and icons (nothing works offline yet — that is Phase 4); export/import UI
(the `logs.js` functions exist and are tested, the buttons do not); per-exercise history sheet;
wake lock. `program.json` states the athlete's age, so a private repo is the safer default when
GitHub Pages hosting comes up.
