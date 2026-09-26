import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  logKey,
  formatShortDate,
  parseTopWeight,
  mergeEntries,
  saveEntry,
  getEntry,
  historyFor,
  lastEntryBefore,
  exportAll,
  importAll,
  backupFilename,
  parseBackup,
  formatStamp,
  stampText,
  deleteEntry,
  canonicalEntry,
  migrateSharedLogs
} from './logs.js';
import { dbAll, dbDel, dbSet } from './db.js';

const clear = async () => {
  for (const entry of await dbAll()) await dbDel(entry.key);
};

describe('logKey', () => {
  it('joins code and date', () => {
    expect(logKey('B5', '2026-08-29')).toBe('B5:2026-08-29');
  });
});

describe('formatShortDate', () => {
  it('renders a short label', () => {
    expect(formatShortDate('2026-08-22')).toBe('Aug 22');
    expect(formatShortDate('2026-01-01')).toBe('Jan 1');
  });

  it('returns the input unchanged when unparseable', () => {
    expect(formatShortDate('nonsense')).toBe('nonsense');
  });
});

describe('parseTopWeight', () => {
  it('reads the first weight', () => {
    expect(parseTopWeight('60kg x8 / 62.5 x6')).toBe(60);
    expect(parseTopWeight('22,5 kg x10')).toBe(22.5);
    expect(parseTopWeight('80 KG x5')).toBe(80);
  });

  it('returns null freely', () => {
    expect(parseTopWeight('felt good, no idea of the load')).toBeNull();
    expect(parseTopWeight('')).toBeNull();
    expect(parseTopWeight(null)).toBeNull();
  });
});

describe('mergeEntries', () => {
  const base = { key: 'A1:2026-08-01', code: 'A1', date: '2026-08-01', text: 'old', updatedAt: 100 };

  it('adds unseen keys', () => {
    const incoming = [{ ...base, key: 'A2:2026-08-01' }];
    const result = mergeEntries([base], incoming);
    expect(result.imported).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.entries).toHaveLength(2);
  });

  it('lets the newest updatedAt win', () => {
    const result = mergeEntries([base], [{ ...base, text: 'new', updatedAt: 200 }]);
    expect(result.updated).toBe(1);
    expect(result.entries[0].text).toBe('new');
  });

  it('keeps the local copy when it is newer', () => {
    const result = mergeEntries([base], [{ ...base, text: 'stale', updatedAt: 50 }]);
    expect(result.updated).toBe(0);
    expect(result.entries[0].text).toBe('old');
  });

  it('skips malformed rows', () => {
    const result = mergeEntries([], [{ key: 'X' }, null, { text: 'no key' }]);
    expect(result.entries).toHaveLength(0);
  });
});

describe('backupFilename', () => {
  it('names the file by local date', () => {
    expect(backupFilename(new Date(2026, 7, 30))).toBe('workout-log-2026-08-30.json');
    expect(backupFilename(new Date(2026, 0, 5))).toBe('workout-log-2026-01-05.json');
  });
});

describe('parseBackup', () => {
  const good = JSON.stringify({ schemaVersion: '1.0', entries: [] });

  it('accepts a well-formed backup', () => {
    expect(parseBackup(good).entries).toEqual([]);
  });

  it('accepts a payload with no schemaVersion', () => {
    expect(parseBackup(JSON.stringify({ entries: [] })).entries).toEqual([]);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseBackup('{ not json')).toThrow(/not valid JSON/);
  });

  it('rejects a payload that is not an object', () => {
    expect(() => parseBackup('[]')).toThrow(/does not look like/);
    expect(() => parseBackup('42')).toThrow(/does not look like/);
  });

  it('rejects a payload with no entries array', () => {
    expect(() => parseBackup(JSON.stringify({ schemaVersion: '1.0' }))).toThrow(/No entries/);
  });

  it('refuses a backup from a different schema major', () => {
    expect(() => parseBackup(JSON.stringify({ schemaVersion: '2.0', entries: [] }))).toThrow(
      /schema 2\.0/
    );
  });
});

describe('formatStamp', () => {
  const now = new Date(2026, 7, 30, 20, 0);

  it('says "today" for an entry made today', () => {
    expect(formatStamp(new Date(2026, 7, 30, 18, 42).getTime(), now)).toBe('Saved today - 18:42');
  });

  it('names the day for an older entry', () => {
    expect(formatStamp(new Date(2026, 7, 22, 9, 5).getTime(), now)).toBe('Saved Aug 22 - 09:05');
  });

  it('returns empty for a bad timestamp', () => {
    expect(formatStamp(undefined, now)).toBe('');
  });
});

describe('stampText', () => {
  const now = new Date(2026, 7, 31, 10, 0);
  const today = { updatedAt: new Date(2026, 7, 31, 6, 45).getTime() };
  const previous = { date: '2026-08-30' };

  it('reports today\'s save with the time', () => {
    expect(stampText(today, previous, now)).toBe('Saved today - 06:45');
  });

  it('falls back to the last session when nothing is logged today', () => {
    expect(stampText(null, previous, now)).toBe('Last saved Aug 30');
  });

  it('says so when the exercise has never been logged', () => {
    expect(stampText(null, null, now)).toBe('Not logged yet');
  });

  it('prefers today over the previous session', () => {
    expect(stampText(today, previous, now)).not.toContain('Aug 30');
  });
});

describe('per-exercise reads stay scoped to one exercise', () => {
  beforeEach(clear);

  it('history returns only that code, newest first', async () => {
    await saveEntry('A1', '2026-08-10', 'a1 old');
    await saveEntry('A1', '2026-08-20', 'a1 new');
    await saveEntry('A2', '2026-08-15', 'a2 should not appear');
    await saveEntry('B1', '2026-08-15', 'b1 should not appear');

    const history = await historyFor('A1');
    expect(history.map((e) => e.text)).toEqual(['a1 new', 'a1 old']);
  });

  it('does not bleed across codes that share a prefix', async () => {
    await saveEntry('B1', '2026-08-10', 'b1');
    await saveEntry('B5', '2026-08-10', 'b5');
    expect((await historyFor('B1')).map((e) => e.text)).toEqual(['b1']);
    expect((await historyFor('B5')).map((e) => e.text)).toEqual(['b5']);
  });

  it('finds the most recent entry strictly before a date', async () => {
    await saveEntry('B1', '2026-08-01', 'oldest');
    await saveEntry('B1', '2026-08-22', 'previous');
    await saveEntry('B1', '2026-08-30', 'today');
    expect((await lastEntryBefore('B1', '2026-08-30')).text).toBe('previous');
  });

  it('excludes the given date itself', async () => {
    await saveEntry('B1', '2026-08-30', 'today only');
    expect(await lastEntryBefore('B1', '2026-08-30')).toBeNull();
  });

  it('returns null for an exercise with no history', async () => {
    await saveEntry('A1', '2026-08-30', 'something');
    expect(await lastEntryBefore('A6', '2026-08-30')).toBeNull();
    expect(await historyFor('A6')).toEqual([]);
  });
});

describe('editing and deleting past sessions', () => {
  beforeEach(clear);

  it('deletes one entry and leaves the rest of that exercise intact', async () => {
    await saveEntry('B1', '2026-08-10', 'first');
    await saveEntry('B1', '2026-08-20', 'second');
    await saveEntry('B1', '2026-08-30', 'third');

    await deleteEntry('B1', '2026-08-20');

    expect((await historyFor('B1')).map((e) => e.date)).toEqual(['2026-08-30', '2026-08-10']);
    expect(await getEntry('B1', '2026-08-20')).toBeNull();
  });

  it('does not touch other exercises', async () => {
    await saveEntry('B1', '2026-08-20', 'b1');
    await saveEntry('B5', '2026-08-20', 'b5');
    await deleteEntry('B1', '2026-08-20');
    expect((await getEntry('B5', '2026-08-20')).text).toBe('b5');
  });

  it('is harmless when the entry does not exist', async () => {
    await expect(deleteEntry('A3', '2020-01-01')).resolves.not.toThrow();
  });

  it('editing a past entry leaves today alone', async () => {
    await saveEntry('B1', '2026-08-22', 'old value');
    await saveEntry('B1', '2026-08-31', 'todays value');

    await saveEntry('B1', '2026-08-22', 'corrected value');

    expect((await getEntry('B1', '2026-08-22')).text).toBe('corrected value');
    expect((await getEntry('B1', '2026-08-31')).text).toBe('todays value');
  });
});

describe('storage round trip', () => {
  beforeEach(clear);

  it('saves and reads back verbatim', async () => {
    const text = '60kg x8 / 62.5 x6 - last set grindy, keep 60 next week';
    await saveEntry('B1', '2026-08-30', text);
    expect((await getEntry('B1', '2026-08-30')).text).toBe(text);
  });

  it('deletes on blank text instead of storing an empty row', async () => {
    await saveEntry('B1', '2026-08-30', 'something');
    await saveEntry('B1', '2026-08-30', '   ');
    expect(await getEntry('B1', '2026-08-30')).toBeNull();
  });

  it('orders history newest first and finds the previous session', async () => {
    await saveEntry('A1', '2026-08-10', 'first');
    await saveEntry('A1', '2026-08-20', 'second');
    await saveEntry('A1', '2026-08-30', 'today');

    expect((await historyFor('A1')).map((e) => e.date)).toEqual([
      '2026-08-30',
      '2026-08-20',
      '2026-08-10'
    ]);
    expect((await lastEntryBefore('A1', '2026-08-30')).text).toBe('second');
  });

  it('returns null when there is no earlier entry', async () => {
    await saveEntry('A4', '2026-08-30', 'only one');
    expect(await lastEntryBefore('A4', '2026-08-30')).toBeNull();
  });

  it('survives export then import into an empty store', async () => {
    await saveEntry('B5', '2026-08-29', '22kg x10,10,9');
    await saveEntry('A1', '2026-08-29', '60kg x8,8,7');
    const dump = await exportAll();

    await clear();
    const result = await importAll(dump);

    expect(result).toEqual({ imported: 2, updated: 0 });
    expect((await getEntry('B5', '2026-08-29')).text).toBe('22kg x10,10,9');
    expect((await getEntry('A1', '2026-08-29')).text).toBe('60kg x8,8,7');
  });

  it('import does not clobber a newer local entry', async () => {
    await saveEntry('B5', '2026-08-29', 'old');
    const dump = await exportAll();
    await saveEntry('B5', '2026-08-29', 'newer local');

    const result = await importAll(dump);
    expect(result.updated).toBe(0);
    expect((await getEntry('B5', '2026-08-29')).text).toBe('newer local');
  });

  it('tolerates a payload with no entries', async () => {
    expect(await importAll({})).toEqual({ imported: 0, updated: 0 });
  });
});

// program.json declares B6 "logAs": "A6" - the reverse pec deck on two days.
describe('shared logs (B6 logs as A6)', () => {
  beforeEach(clear);

  const b6 = (date, text, updatedAt = 1) => ({ key: `B6:${date}`, code: 'B6', date, text, updatedAt });

  it('refiles an aliased entry under the owning code', () => {
    expect(canonicalEntry(b6('2026-09-01', '30kg x15'))).toEqual({
      key: 'A6:2026-09-01', code: 'A6', date: '2026-09-01', text: '30kg x15', updatedAt: 1
    });
  });

  it('leaves canonical and malformed entries alone', () => {
    const a1 = { key: 'A1:2026-09-01', code: 'A1', date: '2026-09-01', text: 'x', updatedAt: 1 };
    expect(canonicalEntry(a1)).toBe(a1);
    expect(canonicalEntry({ text: 'no key' })).toEqual({ text: 'no key' });
    expect(canonicalEntry(null)).toBeNull();
  });

  it('moves old B6 entries into A6 on migration', async () => {
    await dbSet('B6:2026-09-03', b6('2026-09-03', '30kg x15,14'));
    await saveEntry('A6', '2026-09-01', '30kg x15,15');

    expect(await migrateSharedLogs()).toBe(1);
    expect(await historyFor('B6')).toEqual([]);
    expect((await historyFor('A6')).map((e) => e.text)).toEqual(['30kg x15,14', '30kg x15,15']);
  });

  it('never overwrites a different same-day A6 entry', async () => {
    await saveEntry('A6', '2026-09-03', 'A6 text');
    await dbSet('B6:2026-09-03', b6('2026-09-03', 'B6 text'));

    expect(await migrateSharedLogs()).toBe(0);
    expect((await getEntry('A6', '2026-09-03')).text).toBe('A6 text');
    expect((await getEntry('B6', '2026-09-03')).text).toBe('B6 text');
  });

  it('drops the duplicate an interrupted migration left behind', async () => {
    await saveEntry('A6', '2026-09-03', 'same');
    await dbSet('B6:2026-09-03', b6('2026-09-03', 'same'));

    expect(await migrateSharedLogs()).toBe(1);
    expect(await historyFor('B6')).toEqual([]);
  });

  it('is a no-op once migrated', async () => {
    await dbSet('B6:2026-09-03', b6('2026-09-03', 'x'));
    await migrateSharedLogs();
    expect(await migrateSharedLogs()).toBe(0);
  });

  it('imports an old backup\'s B6 entries as A6', async () => {
    const result = await importAll({ entries: [b6('2026-09-03', 'from backup')] });
    expect(result).toEqual({ imported: 1, updated: 0 });
    expect((await getEntry('A6', '2026-09-03')).text).toBe('from backup');
    expect(await getEntry('B6', '2026-09-03')).toBeNull();
  });
});
