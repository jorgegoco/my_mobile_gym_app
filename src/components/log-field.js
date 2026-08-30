import { esc } from '../dom.js';
import { todayKey } from '../program.js';
import {
  getEntry,
  saveEntry,
  lastEntryBefore,
  formatShortDate,
  formatStamp,
  logKey
} from '../logs.js';

const SAVE_DELAY = 500;

const timers = new Map();
const pending = new Map();

export function logField(ex) {
  return `
    <div class="log" data-log="${esc(ex.code)}">
      <p class="log-last" data-last hidden></p>
      <label class="log-label" for="log-${esc(ex.code)}">Log</label>
      <textarea
        id="log-${esc(ex.code)}"
        class="log-input"
        rows="2"
        enterkeyhint="done"
        placeholder="60kg x8,8,7 - felt strong"
      ></textarea>
      <span class="log-stamp" data-stamp aria-live="polite"></span>
    </div>
  `;
}

function autoGrow(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function setStamp(wrap, entry) {
  const stamp = wrap.querySelector('[data-stamp]');
  if (!stamp) return;
  stamp.textContent = entry ? formatStamp(entry.updatedAt) : '';
}

// History rows carry a fixed date; today's field has none and resolves at save
// time, so an app left open past midnight still files under the right day.
const dateFor = (wrap) => wrap.dataset.date || todayKey();

async function commit(key, code, date, text, wrap) {
  pending.delete(key);
  const entry = await saveEntry(code, date, text);
  if (wrap.isConnected) setStamp(wrap, entry);
}

export function flushPending() {
  const writes = [];
  for (const [key, { code, date, text, wrap }] of pending) {
    clearTimeout(timers.get(key));
    timers.delete(key);
    writes.push(commit(key, code, date, text, wrap));
  }
  return Promise.all(writes);
}

export function handleLogInput(textarea) {
  const wrap = textarea.closest('[data-log]');
  const code = wrap.dataset.log;
  const date = dateFor(wrap);
  const key = logKey(code, date);

  textarea.dataset.hydrated = 'true';
  autoGrow(textarea);
  pending.set(key, { code, date, text: textarea.value, wrap });

  clearTimeout(timers.get(key));
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      commit(key, code, date, textarea.value, wrap);
    }, SAVE_DELAY)
  );
}

export async function hydrateLogFields(root) {
  const today = todayKey();

  await Promise.all(
    [...root.querySelectorAll('[data-log]')].map(async (wrap) => {
      const code = wrap.dataset.log;
      const textarea = wrap.querySelector('.log-input');
      const [entry, previous] = await Promise.all([
        getEntry(code, today),
        lastEntryBefore(code, today)
      ]);

      if (!wrap.isConnected) return;

      if (entry && !textarea.dataset.hydrated && document.activeElement !== textarea) {
        textarea.value = entry.text;
        autoGrow(textarea);
      }

      if (entry) setStamp(wrap, entry);

      if (previous) {
        const last = wrap.querySelector('[data-last]');
        last.textContent = `Last (${formatShortDate(previous.date)}): ${previous.text}`;
        last.dataset.text = previous.text;
        last.hidden = false;
      }
    })
  );
}

export function copyLastInto(lastEl) {
  const wrap = lastEl.closest('[data-log]');
  const textarea = wrap.querySelector('.log-input');
  textarea.value = lastEl.dataset.text ?? '';
  textarea.focus();
  handleLogInput(textarea);
}
