import { dbGet, dbSet, dbDel, dbAll } from './db.js';
import { program } from './program.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const logKey = (code, date) => `${code}:${date}`;

export function formatShortDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  return `${MONTHS[month - 1]} ${day}`;
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
  const all = await dbAll();
  return all.filter((entry) => entry.code === code).sort((a, b) => b.date.localeCompare(a.date));
}

export async function lastEntryBefore(code, date) {
  const history = await historyFor(code);
  return history.find((entry) => entry.date < date) ?? null;
}

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
