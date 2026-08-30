# Chest & Arms Hypertrophy Program — App Data Package (v5.1)

`program.json` is the single source of truth for building a workout app from the *Chest & Arms Hypertrophy Program* guide. It is plain JSON (no comments, UTF-8, ASCII-safe punctuation) so it can be imported directly, served from an API, or seeded into a database.

```js
import program from './program.json';

const workoutB = program.workouts.find(w => w.id === 'workout-b');
```

---

## Top-level shape

| Key | Type | What it holds |
| :---- | :---- | :---- |
| `schemaVersion` | string | Version of *this* data contract (`"1.0"`). Bump on breaking shape changes. |
| `program` | object | Identity, athlete context, header highlights, changelog. |
| `dailyProtocol` | array | Timeline of the training day (swim, food, gym windows). |
| `warmUp` / `coolDown` | object | Session bookends with prescriptions. |
| `rules` | array | The four hypertrophy / joint-safety rules. |
| `workouts` | array | The two gym sessions and their exercises. |
| `swappingMatrix` | object | Ordering logic when equipment is occupied. |
| `weeklySchedule` | array | 7 rows, Monday-first, linked to workouts by `workoutId`. |
| `summaryStrategy` | string | One-paragraph program rationale. |
| `theme` | object | Hex palette taken from the PDF, for consistent UI styling. |

---

## `workouts[].exercises[]`

The core entity of the app. Every exercise object:

| Field | Type | Notes |
| :---- | :---- | :---- |
| `code` | string | Stable id inside the program: `A1`…`A6`, `B1`…`B6`. Use as React key / DB key. |
| `name` | string | Display name. |
| `tags` | string[] | `"key-compound"` → blue badge; `"updated"` → amber badge. Empty array = no badge. |
| `target` | string | Muscles worked (shown under the title). |
| `sets` | number | Working sets. |
| `repRange` | [number, number] | Min/max reps — use for rep pickers and logging validation. |
| `prescription` | string | Pre-rendered `"3 Sets x 6-8 Reps"` label if you don't want to compose it. |
| `tempo` | string \| null | Tempo line, when the guide specifies one. |
| `benefit` | string \| null | Shown instead of `tempo` when tempo is null. |
| `grip` | string | Present only on B4. Treat as optional. |
| `equipment` | string[] | Slugs for filtering ("what can I do if the cable station is busy?"). |
| `priority` | `"high"` \| `"medium"` \| `"swappable"` | Matches `swappingMatrix.tiers[].priority`. |
| `replaces` | string | Present only on exercises changed in v5.1 (B5, B6). |
| `cues` | string[] | Bullet-point execution cues, in display order. |

Render rule used by the PDF: the right-hand meta column shows `tempo` if present, otherwise `benefit`, otherwise `grip`.

## `swappingMatrix`

`tiers[].items[].codes` reference exercise `code`s, so a UI can highlight the affected cards directly. `goldenRule` is the emphasised call-out. The invariant the app should enforce when reordering a session: **no exercise tagged as tricep isolation (A5/B5) may be scheduled before A1/B1/A3.**

## `weeklySchedule`

`workoutId` is `null` on non-gym days and otherwise points at `workouts[].id`, so a calendar view can join without string matching on the label.

---

## What changed in v5.1

Two exercises in Workout B were replaced; everything else is unchanged.

| Code | v5.0 | v5.1 |
| :---- | :---- | :---- |
| B5 | Overhead Cable Tricep Extension | **Seated DB Overhead Tricep Extension** — dumbbell + backed bench, no cable station |
| B6 | Standing Cable Rear Delt Crossover Flyes | **Reverse Pec Deck (Machine Rear Delt Fly)** — same machine as A6 |

Knock-on edits: the B3 cue now specifies sitting *facing away from* the machine, the "updated" badges moved from B3/B6 onto B5/B6, and the swapping matrix rows for A5/B5 and A6/B6 were rewritten for the new equipment needs. See `program.changelog` in the JSON.

---

## Suggested app model

A minimal training app can be built from this file alone:

1. **Program screen** — `program.highlights`, `rules`, `warmUp`, `coolDown`.
2. **Week screen** — `weeklySchedule`, tapping a gym day opens its workout.
3. **Workout screen** — exercise cards from `workouts[].exercises`, badges from `tags`.
4. **Logging** — persist per set: `{ code, date, weight, reps, rpe }`. Validate `reps` against `repRange`; warn above RPE 8 (Rule 3 keeps 1–2 reps in reserve).
5. **Equipment-busy mode** — filter by `priority` and `equipment` and reorder the session using `swappingMatrix`, respecting the tricep-isolation invariant above.

Nothing in this file is user data; add a separate store for logs, bodyweight and PRs.
