import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  logKey,
  parseTopWeight,
  mergeEntries,
  saveEntry,
  getEntry,
  exportAll,
  importAll,
  backupFilename,
  parseBackup,
  canonicalEntry,
  migrateSharedLogs
} from './logs.js';
import { dbAll, dbDel, dbSet, dbByCode } from './db.js';

const clear = async () => {
  for (const entry of await dbAll()) await dbDel(entry.key);
};

// An entry written before the app kept one value per exercise.
const dated = (code, date, text, updatedAt = 1) => {
  const entry = { key: logKey(code, date), code, date, text, updatedAt };
  return dbSet(entry.key, entry);
};

describe('logKey', () => {
  it('joins code and date', () => {
    expect(logKey('B5', '2026-08-29')).toBe('B5:2026-08-29');
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

describe('one value per exercise', () => {
  beforeEach(clear);

  it('saves and reads back verbatim', async () => {
    const text = '60kg x8 / 62.5 x6 - last set grindy, keep 60 next week';
    await saveEntry('B1', text);
    expect((await getEntry('B1')).text).toBe(text);
  });

  it('keeps only the last value entered', async () => {
    await saveEntry('B1', 'first');
    await saveEntry('B1', 'second');
    expect((await getEntry('B1')).text).toBe('second');
    expect(await dbAll()).toHaveLength(1);
  });

  it('is null for an exercise never logged', async () => {
    await saveEntry('A1', 'something');
    expect(await getEntry('A6')).toBeNull();
  });

  it('does not bleed across codes that share a prefix', async () => {
    await saveEntry('B1', 'b1');
    await saveEntry('B5', 'b5');
    expect((await getEntry('B1')).text).toBe('b1');
    expect((await getEntry('B5')).text).toBe('b5');
  });

  it('falls back to the newest dated entry until the first save', async () => {
    await dated('B1', '2026-08-10', 'older');
    await dated('B1', '2026-08-30', 'newest');
    await dated('B5', '2026-09-01', 'other exercise');
    expect((await getEntry('B1')).text).toBe('newest');
  });

  it('prefers the saved value over any dated entry', async () => {
    await dated('B1', '2026-08-30', 'old session');
    await saveEntry('B1', 'current');
    expect((await getEntry('B1')).text).toBe('current');
  });

  it('keeps a blank save blank instead of resurfacing a dated entry', async () => {
    await dated('B1', '2026-08-30', 'old session');
    await saveEntry('B1', '');
    expect((await getEntry('B1')).text).toBe('');
  });

  it('leaves dated entries in place', async () => {
    await dated('B1', '2026-08-30', 'old session');
    await saveEntry('B1', 'current');
    expect(await dbByCode('B1')).toHaveLength(1);
  });

  it('survives export then import into an empty store', async () => {
    await saveEntry('B5', '22kg x10,10,9');
    await saveEntry('A1', '60kg x8,8,7');
    const dump = await exportAll();

    await clear();
    const result = await importAll(dump);

    expect(result).toEqual({ imported: 2, updated: 0 });
    expect((await getEntry('B5')).text).toBe('22kg x10,10,9');
    expect((await getEntry('A1')).text).toBe('60kg x8,8,7');
  });

  it('import does not clobber a newer local value', async () => {
    await saveEntry('B5', 'old');
    const dump = await exportAll();
    await new Promise((resolve) => setTimeout(resolve, 2));
    await saveEntry('B5', 'newer local');

    const result = await importAll(dump);
    expect(result.updated).toBe(0);
    expect((await getEntry('B5')).text).toBe('newer local');
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
    await dated('A6', '2026-09-01', '30kg x15,15');

    expect(await migrateSharedLogs()).toBe(1);
    expect(await dbByCode('B6')).toEqual([]);
    expect((await dbByCode('A6')).map((e) => e.text)).toEqual(['30kg x15,15', '30kg x15,14']);
    expect((await getEntry('A6')).text).toBe('30kg x15,14');
  });

  it('never overwrites a different same-day A6 entry', async () => {
    await dated('A6', '2026-09-03', 'A6 text');
    await dbSet('B6:2026-09-03', b6('2026-09-03', 'B6 text'));

    expect(await migrateSharedLogs()).toBe(0);
    expect((await dbByCode('A6')).map((e) => e.text)).toEqual(['A6 text']);
    expect((await dbByCode('B6')).map((e) => e.text)).toEqual(['B6 text']);
  });

  it('drops the duplicate an interrupted migration left behind', async () => {
    await dated('A6', '2026-09-03', 'same');
    await dbSet('B6:2026-09-03', b6('2026-09-03', 'same'));

    expect(await migrateSharedLogs()).toBe(1);
    expect(await dbByCode('B6')).toEqual([]);
  });

  it('is a no-op once migrated', async () => {
    await dbSet('B6:2026-09-03', b6('2026-09-03', 'x'));
    await migrateSharedLogs();
    expect(await migrateSharedLogs()).toBe(0);
  });

  it('imports an old backup\'s B6 entries as A6', async () => {
    const result = await importAll({ entries: [b6('2026-09-03', 'from backup')] });
    expect(result).toEqual({ imported: 1, updated: 0 });
    expect((await getEntry('A6')).text).toBe('from backup');
    expect(await dbByCode('B6')).toEqual([]);
  });
});
