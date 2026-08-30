import { esc } from '../dom.js';
import { todayKey } from '../program.js';
import { getEntry, saveEntry, lastEntryBefore, formatShortDate, formatStamp } from '../logs.js';

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

async function commit(code, text, wrap) {
  pending.delete(code);
  const entry = await saveEntry(code, todayKey(), text);
  if (wrap.isConnected) setStamp(wrap, entry);
}

export function flushPending() {
  const writes = [];
  for (const [code, { text, wrap }] of pending) {
    clearTimeout(timers.get(code));
    timers.delete(code);
    writes.push(commit(code, text, wrap));
  }
  return Promise.all(writes);
}

export function handleLogInput(textarea) {
  const wrap = textarea.closest('[data-log]');
  const code = wrap.dataset.log;

  textarea.dataset.hydrated = 'true';
  autoGrow(textarea);
  pending.set(code, { text: textarea.value, wrap });

  clearTimeout(timers.get(code));
  timers.set(
    code,
    setTimeout(() => {
      timers.delete(code);
      commit(code, textarea.value, wrap);
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
