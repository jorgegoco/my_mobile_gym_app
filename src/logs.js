import { dbGet, dbSet, dbDel, dbAll, dbByCode } from './db.js';
import { program, logCodeFor } from './program.js';

// Dated keys only exist from before the app kept one value per exercise; they
// are still read, moved and exported.
export const logKey = (code, date) => `${code}:${date}`;

export function parseTopWeight(text) {
  const match = /(\d+(?:[.,]\d+)?)\s?kg/i.exec(text ?? '');
  return match ? Number(match[1].replace(',', '.')) : null;
}

export function mergeEntries(existing, incoming) {
  const byKey = new Map(existing.map((entry) => [entry.key, entry]));
  let imported = 0;
  let updated = 0;

  for (const entry of incoming) {
    if (!entry?.key || typeof entry.text !== 'string') continue;
    const current = byKey.get(entry.key);
    if (!current) {
      byKey.set(entry.key, entry);
      imported++;
    } else if ((entry.updatedAt ?? 0) > (current.updatedAt ?? 0)) {
      byKey.set(entry.key, entry);
      updated++;
    }
  }

  return { entries: [...byKey.values()], imported, updated };
}

export function backupFilename(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `workout-log-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

export function parseBackup(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('That does not look like a workout backup.');
  }
  if (!Array.isArray(payload.entries)) {
    throw new Error('No entries found in that file. Is it a workout backup?');
  }
  const theirs = String(payload.schemaVersion ?? '').split('.')[0];
  const ours = String(program.schemaVersion).split('.')[0];
  if (payload.schemaVersion && theirs !== ours) {
    throw new Error(
      `That backup uses program schema ${payload.schemaVersion}, but this app expects ${ours}.x.`
    );
  }
  return payload;
}

// The one value an exercise holds. An exercise never saved since the single-value
// change falls back to its newest dated entry (key order is date order).
export async function getEntry(code) {
  const current = await dbGet(code);
  if (current) return current;
  return (await dbByCode(code)).at(-1) ?? null;
}

// Blank text is stored, not deleted: deleting would let the old dated entry
// resurface as the value.
export async function saveEntry(code, text) {
  const entry = { key: code, code, text, updatedAt: Date.now() };
  await dbSet(code, entry);
  return entry;
}

export async function exportAll() {
  const entries = await dbAll();
  return {
    schemaVersion: program.schemaVersion,
    exportedAt: new Date().toISOString(),
    entries: entries.sort((a, b) => a.key.localeCompare(b.key))
  };
}

// Refiles an entry under the code that owns its log ("B6:..." -> "A6:...").
// Anything already canonical, or too malformed to parse, comes back as-is.
export function canonicalEntry(entry) {
  const split = typeof entry?.key === 'string' ? entry.key.indexOf(':') : -1;
  if (split < 1) return entry;
  const code = entry.key.slice(0, split);
  const owner = logCodeFor(code);
  if (owner === code) return entry;
  const date = entry.key.slice(split + 1);
  return { ...entry, key: logKey(owner, date), code: owner };
}

// One-off move of entries written before two exercises shared a log. Safe to
// run on every boot: once moved there is nothing left under the old code.
// Written before deleted, so an interrupted run leaves a duplicate, not a loss.
export async function migrateSharedLogs() {
  const aliases = program.workouts.flatMap((w) => w.exercises).filter((ex) => ex.logAs);
  let moved = 0;
  for (const ex of aliases) {
    for (const entry of await dbByCode(ex.code)) {
      const target = canonicalEntry(entry);
      const existing = await dbGet(target.key);
      // Both days logged on one date with different text: never overwrite typed
      // text. The old entry stays where it is and still goes out in an export.
      if (existing && existing.text !== entry.text) continue;
      if (!existing) await dbSet(target.key, target);
      await dbDel(entry.key);
      moved++;
    }
  }
  return moved;
}

export async function importAll(payload) {
  const incoming = (Array.isArray(payload?.entries) ? payload.entries : []).map(canonicalEntry);
  const existing = await dbAll();
  const { entries, imported, updated } = mergeEntries(existing, incoming);

  const changed = new Map(existing.map((entry) => [entry.key, entry]));
  await Promise.all(
    entries
      .filter((entry) => changed.get(entry.key) !== entry)
      .map((entry) => dbSet(entry.key, entry))
  );

  return { imported, updated };
}
