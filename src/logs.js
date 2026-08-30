import { dbGet, dbSet, dbDel, dbAll, dbByCode, dbLastBefore } from './db.js';
import { program } from './program.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const logKey = (code, date) => `${code}:${date}`;

export function formatShortDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  return `${MONTHS[month - 1]} ${day}`;
}

// "Aug 30 - 18:42": the date answers "is this today's entry?", the time
// answers "is this the set I just typed?".
export function formatStamp(updatedAt, now = new Date()) {
  const d = new Date(updatedAt);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const day = sameDay ? 'today' : `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return `Saved ${day} - ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Every log box always says when it was last written to. Silence reads as a
// bug; "Not logged yet" reads as an answer.
export function stampText(entry, previous, now = new Date()) {
  if (entry) return formatStamp(entry.updatedAt, now);
  if (previous) return `Last saved ${formatShortDate(previous.date)}`;
  return 'Not logged yet';
}

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

export const getEntry = (code, date) => dbGet(logKey(code, date)).then((entry) => entry ?? null);

export async function saveEntry(code, date, text) {
  const key = logKey(code, date);
  if (!text.trim()) {
    await dbDel(key);
    return null;
  }
  const entry = { key, code, date, text, updatedAt: Date.now() };
  await dbSet(key, entry);
  return entry;
}

export async function historyFor(code) {
  const entries = await dbByCode(code);
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

export const lastEntryBefore = (code, date) => dbLastBefore(code, date);

export async function exportAll() {
  const entries = await dbAll();
  return {
    schemaVersion: program.schemaVersion,
    exportedAt: new Date().toISOString(),
    entries: entries.sort((a, b) => a.key.localeCompare(b.key))
  };
}

export async function importAll(payload) {
  const incoming = Array.isArray(payload?.entries) ? payload.entries : [];
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
