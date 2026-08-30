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
  importAll
} from './logs.js';
import { dbAll, dbDel } from './db.js';

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
