import { createStore, get, set, del, values } from 'idb-keyval';

const store = createStore('workout-log', 'logs');

// The current value of an exercise lives under its bare code ("B5"). Entries
// written before the app kept a single value are "<CODE>:<YYYY-MM-DD>"; they sit
// in a contiguous, date-ordered key range that never contains a bare code.
const codeRange = (code) => IDBKeyRange.bound(`${code}:`, `${code}:￿`);

export const dbGet = (key) => get(key, store);
export const dbSet = (key, value) => set(key, value, store);
export const dbDel = (key) => del(key, store);
export const dbAll = () => values(store);

export const dbByCode = (code) =>
  store('readonly', (s) => {
    const request = s.getAll(codeRange(code));
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
