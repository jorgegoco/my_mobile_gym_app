# Data contract — `program.json`

> The `program.json` schema. For what the app is and how to run it, see the
> [README](../README.md).

`program.json` is the single source of truth for building a workout app from the *Swim & Lift* guide. It is plain JSON (no comments, UTF-8, ASCII-safe punctuation) so it can be imported directly, served from an API, or seeded into a database.

```js
import program from './program.json';

const dayTwo = program.workouts.find(w => w.id === 'day-2');
```

---

## Top-level shape

| Key | Type | What it holds |
| :---- | :---- | :---- |
| `schemaVersion` | string | Version of *this* data contract (`"1.1"`). Major = breaking shape change (the app refuses to boot); minor = additive. |
| `program` | object | Identity, athlete context, header highlights, changelog. |
| `dailyProtocol` | array | Timeline of the training day (swim, food, gym windows). |
| `warmUp` / `coolDown` | object | Session bookends with prescriptions. `warmUp.durationMinutes` is `null` from v6.0 — the swim is the warm-up, so there is no separate block to time. |
| `fuel` | object | The 08:30 locker-room transition fuel protocol (`title`, `timeWindow`, `recipe`, `why`). Added in v6.0; renderers should tolerate its absence. |
| `legTraining` | object | Why no leg work happens in the gym (`title`, `body`). Added in v6.0; optional. |
| `rules` | array | The four hypertrophy / joint-safety rules. |
| `workouts` | array | The three gym micro-sessions and their exercises. |
| `swappingMatrix` | object | Ordering logic when equipment is occupied. |
| `swim` | object | The swim programme: routines, weekday rotation, Express set, technique. Added in v7.0 (schema 1.1); optional. See below. |
| `weeklySchedule` | array | 7 rows, Monday-first, linked to workouts by `workoutId`. |
| `summaryStrategy` | string | One-paragraph program rationale. |
| `theme` | object | Hex palette taken from the original printed guide, used verbatim by the app. |

---

## `workouts[].exercises[]`

The core entity of the app. Every exercise object:

| Field | Type | Notes |
| :---- | :---- | :---- |
| `code` | string | Stable id inside the program: `A1`, `A3`…`A6`, `B1`…`B6`, `C1`. Use as React key / DB key. Assigned in v5.x and preserved through the v6.0 restructure, so the letter no longer indicates a day. `A2` is retired. |
| `name` | string | Display name. |
| `tags` | string[] | `"key-compound"` → blue badge; `"updated"` → amber badge, meaning "changed in the last revision". Empty array = no badge. |
| `target` | string | Muscles worked (shown under the title). |
| `sets` | number | Working sets. |
| `repRange` | [number, number] | Min/max reps — use for rep pickers and logging validation. |
| `prescription` | string | Pre-rendered `"3 Sets x 6-8 Reps"` label if you don't want to compose it. |
| `tempo` | string \| null | Tempo line, when the guide specifies one. |
| `benefit` | string \| null | Shown instead of `tempo` when tempo is null. |
| `grip` | string | Present only on B4. Treat as optional. |
| `logAs` | string | Optional. The `code` whose log this exercise shares. B6 has `"logAs": "A6"`: the same movement on two days keeps one history. Must name another exercise that has no `logAs` of its own. |
| `equipment` | string[] | Slugs for filtering ("what can I do if the cable station is busy?"). |
| `priority` | `"high"` \| `"medium"` \| `"swappable"` | Matches `swappingMatrix.tiers[].priority`. |
| `cues` | string[] | Bullet-point execution cues, in display order. |

Render rule, shared by the app and `docs/PROGRAM.md`: the meta line shows `tempo` if present, otherwise `benefit`, otherwise `grip`. See `metaLine()` in `src/program.js`.

## `swappingMatrix`

`tiers[].items[].codes` reference exercise `code`s, so a UI can highlight the affected cards directly. `goldenRule` is the emphasised call-out. The invariant the app should enforce when reordering a session: **no tricep isolation (A5/B5) may be scheduled before that day's pressing — B1/A3 on Day 1, A1 on Day 3.**

## `swim`

| Field | Type | Notes |
| :---- | :---- | :---- |
| `poolMeters` / `sessionMeters` / `sessionMinutes` | number | 25, 2500, 90. Lengths are `meters / poolMeters`; Express times are estimated from `sessionMeters` in `sessionMinutes`. Neither is stored. |
| `schedule` | array | 7 rows `{ day, routineId, objective }`, Monday-first. Every weekday must be present. |
| `routines` | array | `{ id, name, target, rounds, blocks }`. Each block is `{ title, meters, detail, points?, rest? }`. `sum(blocks.meters) x rounds` must equal `sessionMeters`. |
| `express` | object | `warmUp`, `mainBlock`, `coolDown` (blocks as above) and `options[] { mainBlocks, meters }`, where `meters` must equal warm-up + n main blocks + cool-down. |
| `breathing` / `missedSessions` | object | `{ title, points[] { label, text } }`. |
| `openTurn` | object | `{ title, intro, steps[] { phase, action } }`, in order. |

The app validates every distance at boot and refuses to start on a mismatch, because a typo in a block
length is otherwise invisible until you are in the water.

## `weeklySchedule`

`workoutId` is `null` on non-gym days and otherwise points at `workouts[].id`, so a calendar view can join without string matching on the label.

The gym weekdays here are **an example week, not a rule**: in practice Day 1, 2 and 3 rotate with roughly a two-day gap and drift across weekdays. That is why the app does not render this table. The swim, by contrast, *is* fixed to the weekday - see `swim.schedule`.

---

## What changed in v7.0

- The swim went from 2,300m to **2,500m** and gained its own programme in the new `swim` object; the app renders it on a Swim tab. Schema is now `1.1` - additive, so a `1.0` backup still imports.
- **A5** is the Seated Triceps Pressdown Machine (rope kept as Plan B); **C1** (Machine Preacher Curl or Machine Shrug) joins Day 2. Both carry `"updated"`.
- B6 gained `"logAs": "A6"`.
- `dailyProtocol` gained a `10:00+` work row; the fuel's pinch of salt is no longer optional.
- `tools/make-program-doc.py` now writes `docs/SWIM.md` and `docs/GYM.md` next to `docs/PROGRAM.md`: each half standalone, with the athlete profile and daily timing, so either can be handed to a coach or an LLM on its own.

## What changed in v6.1

No programme content changed - same three days, same eleven exercises, same prescriptions. Only naming and presentation:

- `program.title` is now **Swim & Lift** and `program.id` is `swim-and-lift`. The subtitle keeps "Chest & Arms" as the descriptive line.
- The `"updated"` tags came off B2 and B3.
- `docs/PROGRAM.md` was added: the whole programme in readable form, generated from this file by `tools/make-program-doc.py`. Regenerate it whenever you change `program.json`.

---

## What changed in v6.0

The programme moved from two 6-exercise sessions to **three micro-sessions of 3–4 exercises**, sized for the 20–25 minute window between the post-swim shower and breakfast. All 10 distinct exercises were kept; only the distribution changed.

| Day | `id` | Exercises |
| :---- | :---- | :---- |
| Day 1 — Flat Chest Mass & Push Focus | `day-1` | B1, A3, A5, A6 |
| Day 2 — Upper Back & Biceps Peak | `day-2` | B2, A4, B4 |
| Day 3 — Upper Chest, Triceps & Posterior Shoulder | `day-3` | A1, B3, B5, B6 |

Codes were deliberately **not** renumbered: they key the IndexedDB log, so renumbering would orphan every set ever logged.

Everything else that moved: `dailyProtocol` is now one linear timeline (the OPTION A / OPTION B gym rows are gone and `optionGroup` is `null` on every row); the new `fuel` object holds the 08:30 locker-room protocol; `warmUp` keeps its key but `durationMinutes` is `null` now the rowing ergometer is retired; `coolDown` is 1 × 60 s and mandatory; `legTraining` records why the gym has no leg work; B2 moved to 8–10 reps and B3 to 10–12 (both carried the `"updated"` badge until v6.1); `A2` left the rotation, with the seated cable row surviving as the alternative named on the B2 card. See `program.changelog` in the JSON.

---

## Suggested app model

A minimal training app can be built from this file alone:

1. **Program screen** — `program.highlights`, `rules`, `warmUp`, `coolDown`.
2. **Week screen** — `weeklySchedule`, tapping a gym day opens its workout.
3. **Workout screen** — exercise cards from `workouts[].exercises`, badges from `tags`.
4. **Logging** — persist per set: `{ code, date, weight, reps, rpe }`. Validate `reps` against `repRange`; warn above RPE 8 (Rule 3 keeps 1–2 reps in reserve).
5. **Equipment-busy mode** — filter by `priority` and `equipment` and reorder the session using `swappingMatrix`, respecting the tricep-isolation invariant above.

Nothing in this file is user data; add a separate store for logs, bodyweight and PRs.
