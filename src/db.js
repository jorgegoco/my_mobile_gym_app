import { createStore, get, set, del, values } from 'idb-keyval';

const store = createStore('workout-log', 'logs');

export const dbGet = (key) => get(key, store);
export const dbSet = (key, value) => set(key, value, store);
export const dbDel = (key) => del(key, store);
export const dbAll = () => values(store);
