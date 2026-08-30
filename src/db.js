import { createStore, get, set, del, values } from 'idb-keyval';

const store = createStore('workout-log', 'logs');

// Keys are "<CODE>:<YYYY-MM-DD>", so every entry for one exercise sits in a
// contiguous, date-ordered key range. That lets us read one exercise's history
// directly instead of scanning the whole store.
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

// Walks backwards from the day before `date` and stops at the first hit.
export const dbLastBefore = (code, date) =>
  store('readonly', (s) => {
    const range = IDBKeyRange.bound(`${code}:`, `${code}:${date}`, false, true);
    const request = s.openCursor(range, 'prev');
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result?.value ?? null);
      request.onerror = () => reject(request.error);
    });
  });
