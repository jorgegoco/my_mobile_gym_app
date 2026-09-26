# Swim & Lift — Workout PWA

Vanilla JS (ES modules) + Vite. No frameworks, no runtime network calls, no CDN.
Offline-first, installed to an Android home screen and used in the gym.

The app's own Guide tab is the **design reference** — see `docs/screenshots/` for how it should look.
A v5.1 PDF (`Chest_and_Arms_Workout_Guide.pdf`) held that role until v6.1; it was deleted once its
content went a major version stale, and it is recoverable from git history if the visual language is
ever needed again.

| Document | What it is |
| :-- | :-- |
| `README.md` | The public landing page: what the app is, how to run and deploy it |
| `docs/PROGRAM.md` | The whole programme in readable form. **Generated** by `tools/make-program-doc.py` from `program.json` — never hand-edit it, edit the JSON and re-run |
| `docs/DATA.md` | The `program.json` contract |
| `docs/ORIGINAL-SPEC.md` | The original brief. **Historical** — several decisions were reversed; see the banner at its top |
| `CLAUDE.md` | This file: conventions, and the reasoning behind the sharp edges |
| `LICENSE` | MIT |

The deviations from the original spec are below; where that spec and this file disagree, this wins.

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
- `media.json` maps exercise code → video URL, or to a list of `{ label, url }` when a card needs two
  (A5's Plan B rope, C1's choice of machines), kept separate from `program.json` so a future program
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
- Exercise codes `A1..C1` are the stable keys everywhere: logs, `media.json`, DOM ids (`ex-B5`),
  delegation attributes. v6.0 redistributed them across three days **without renumbering**, because they
  key the IndexedDB log — so the letter no longer indicates a day, and `A2` is retired (its logs survive
  in an export but are unreachable in the UI).
- **B6 logs as A6.** Same movement on Day 1 and Day 3, so one log: B6 declares `"logAs": "A6"` and every
  log read and write goes through `logCodeFor()`. The card, DOM id and `#/history/B6` route keep `B6`;
  only `data-log` and the storage key say `A6`. `migrateSharedLogs()` moves old `B6:*` entries at boot
  and `importAll` remaps them from old backups. It never overwrites a different same-day `A6` entry —
  that `B6` entry stays put and still exports.
- Saves flush on `input` (debounced 500 ms), `blur`, `visibilitychange` and `pagehide` — Android kills
  backgrounded tabs and an unsaved set is a bug.
- Validation refuses to boot on an unknown `schemaVersion` major and shows a readable message.
  `validateProgram()` is called from `main.js`, not at module load, so the error is catchable.
- Tap targets ≥ 44 px (`--tap`).

## Conventions

- Views and components are pure functions returning HTML strings; `main.js` owns the single
  `innerHTML` assignment and all event delegation on `#app`. No per-node listeners.
- Routing is `location.hash` + a `render()` switch: `#/day-1`, `#/day-2`, `#/day-3`, `#/guide`.
  No router library. A non-guide tab hash **is** a workout id, which is what lets `viewFor()` resolve it
  with a plain `getWorkout(hash.slice(2))`; `TABS` is derived from `program.workouts`, so adding a fourth
  day to `program.json` is enough to get a fourth tab.
- Scroll position is kept per tab in a module-level map.
- The last tab is persisted in `localStorage` — a deliberate exception to "UI state is not persisted",
  because a PWA cold-starts with no hash and should reopen on the last tab used. Every access is wrapped
  in try/catch; private mode just forgets.
- The Guide's 3-column protocol table stacks into labelled blocks under 700 px. Never let a table
  scroll sideways inside a phone page.
- Unit-test pure logic in `logs.js` only (`src/logs.test.js`, Vitest + fake-indexeddb). No e2e suite.

## Offline and installability

- **Service worker is hand-rolled, no Workbox.** A plugin in `vite.config.js` emits `sw.js` at build
  time with the hashed asset URLs inlined, plus a version hash of that list — which is what makes the
  browser treat the file as new and refetch the shell after a redeploy.
- **Public assets are listed explicitly** in `PUBLIC_ASSETS` in `vite.config.js`. They are copied
  verbatim from `public/` and never enter the bundle graph, so the plugin cannot discover them. Add an
  icon, add it to that list or it will not be cached.
- `index.html` is *not* in the precache list — Vite emits it after `generateBundle`. `./` is cached
  instead, and the navigate handler always serves it, which is what makes a cold start on a deep hash
  route (`#/guide`) work offline.
- **The fetch handler ignores cross-origin requests entirely.** YouTube must pass straight through.
- **No `skipWaiting()`.** A new version activates on the next cold start, never swapping assets
  mid-session. Redeploys land the next time the app is opened.
- Registration is `import.meta.env.PROD`-only, so the dev server is never shadowed by a stale cache.
- Icons come from `tools/make-icons.py` (Pillow), committed with their output so they are
  reproducible. The maskable icon keeps the glyph inside the central 80% safe zone because Android
  crops to a circle or squircle.
- Video links are external and offline-aware: `document.documentElement.dataset.offline` drives the
  greyed "needs signal" state, and `main.js` also `preventDefault`s the click. Chrome DevTools
  offline emulation does **not** flip `navigator.onLine`, so test that path by dispatching the
  `offline` event, not by throttling the network.

## Commands

    npm install
    npm run dev       # http://localhost:5173
    npm test          # vitest run
    npm run build     # budget: under 50 kB gzipped

## One pending queue, keyed by entry

`src/components/log-field.js` keys its debounce and flush maps by **storage key** (`"B5:2026-08-30"`),
not by exercise code. History rows are editable and carry their own date, so a code-keyed queue would
collide. The date comes from `wrap.dataset.date || todayKey()` - today's field resolves at save time
so an app left open past midnight still files correctly.

**Never add a second write queue.** `render()` awaits `flushPending()` before replacing
`#app.innerHTML`; anything outside that queue loses edits when the view swaps.

`hydrateLogFields` handles both shapes: a row with `data-date` loads that date's entry and shows no
"last session" reference; today's field also looks up the previous entry.

## History view

`#/history/<CODE>` is a route, not an overlay, so Android's back gesture closes it. `resolveHash()`
accepts it only when `getExercise(code)` resolves, and a history hash is never remembered as the last
tab. The parent workout tab stays lit via `getWorkoutForExercise`.

Delete removes the row in place rather than re-rendering, so scroll position and any other
in-progress edit survive.

## Wake lock

Held only on the workout tabs; released on the guide, on history, and when the page is hidden.
**The browser releases the lock itself when the page is hidden**, so `wake-lock.js` listens for the
sentinel's `release` event, clears its reference, and re-requests on `visibilitychange` when visible
again. Without that it silently stops working after the first phone call. Every call is guarded -
`request()` rejects when unsupported, hidden, or refused by battery saver, and a failure must never
break logging.

## Backup

Logs live only in the phone's IndexedDB. Nothing syncs; GitHub Pages is a static host and cannot
receive data. Two devices would keep two independent logs.

- **Export/import in the Guide tab** is therefore the only protection against a cleared cache or an
  uninstall. Export writes a JSON file to the phone's Downloads, which "clear site data" does not
  touch; import merges by key with newest `updatedAt` winning.
- `parseBackup()` refuses a file from a different `schemaVersion` major and reports every failure in
  plain language. A rejected import must never modify stored data.
- `requestPersistentStorage()` asks the browser to mark the data non-evictable. Without it, storage
  is "best effort" and can be reclaimed under pressure.
- The blob URL for the download is revoked on the **next frame**, not synchronously — revoking
  immediately can cancel the download.

## Reads stay scoped to one exercise

Log keys are `"<CODE>:<YYYY-MM-DD>"`, so every entry for one exercise is a contiguous, date-ordered
key range. `dbByCode` and `dbLastBefore` in `src/db.js` use `IDBKeyRange` over that range; the cursor
runs backwards and stops at the first hit.

**Never go back to `dbAll()` + filter for per-exercise reads.** It was 6 full scans per tab render -
18,720 objects and 82 ms against 5 years of history, growing forever. The range read is 6 objects and
1.4 ms, and is constant regardless of history size. `dbAll()` is correct only for export and import,
which genuinely need every entry.

## Deployed

Live at https://jorgegoco.github.io/my_mobile_gym_app/ via `.github/workflows/deploy.yml` (build,
test, publish on push to `main`). The repo is public, which is what GitHub Pages requires on the free
tier.

## Still to do

Nothing tracked right now - the per-exercise history sheet and the wake lock both shipped.
