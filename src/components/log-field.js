import { esc } from '../dom.js';
import { todayKey, logCodeFor, sharedLogWith, getWorkoutForExercise } from '../program.js';
import {
  getEntry,
  saveEntry,
  lastEntryBefore,
  formatShortDate,
  stampText,
  logKey
} from '../logs.js';

const SAVE_DELAY = 500;

const timers = new Map();
const pending = new Map();

// "shared with A6 (Day 1)" - says why a session logged on another day shows
// up here as the last one.
function sharedNote(ex) {
  const others = sharedLogWith(ex.code);
  if (!others.length) return '';
  const names = others.map((o) => `${o.code} (${getWorkoutForExercise(o.code).name.split(':')[0]})`);
  return ` <span class="log-shared">- shared with ${esc(names.join(', '))}</span>`;
}

// data-log carries the code that owns the log, which for B6 is A6. The DOM id
// keeps the card's own code so both cards stay unique.
export function logField(ex, placeholder = '60kg x8,8,7 - felt strong') {
  return `
    <div class="log" data-log="${esc(logCodeFor(ex.code))}">
      <p class="log-last" data-last hidden></p>
      <label class="log-label" for="log-${esc(ex.code)}">Log${sharedNote(ex)}</label>
      <textarea
        id="log-${esc(ex.code)}"
        class="log-input"
        rows="2"
        enterkeyhint="done"
        placeholder="${esc(placeholder)}"
      ></textarea>
      <span class="log-stamp" data-stamp aria-live="polite"></span>
    </div>
  `;
}

function autoGrow(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function setStamp(wrap, entry, previous = null) {
  const stamp = wrap.querySelector('[data-stamp]');
  if (!stamp) return;
  stamp.textContent = stampText(entry, previous);
}

// The stamp is the only sign a save happened, so every edit moves it through
// saving -> saved. The time alone has minute resolution: a second edit inside
// the same minute would leave it unchanged and look like nothing was written.
function showSave(wrap, state, text) {
  const stamp = wrap.querySelector('[data-stamp]');
  if (!stamp) return;
  stamp.textContent = text;
  delete stamp.dataset.save;
  // Reading layout between the two writes restarts the flash animation.
  void stamp.offsetWidth;
  stamp.dataset.save = state;
}

// History rows carry a fixed date; today's field has none and resolves at save
// time, so an app left open past midnight still files under the right day.
const dateFor = (wrap) => wrap.dataset.date || todayKey();

async function commit(key, code, date, text, wrap) {
  pending.delete(key);
  let entry;
  try {
    entry = await saveEntry(code, date, text);
  } catch {
    // Keep it queued so the next flush (blur, tab switch, backgrounding) retries.
    if (!pending.has(key)) pending.set(key, { code, date, text, wrap });
    if (wrap.isConnected) showSave(wrap, 'error', 'Not saved - will retry');
    return;
  }
  // Typing continued while this write ran: that newer save owns the stamp.
  if (pending.has(key) || !wrap.isConnected) return;
  // Clearing today's box must fall back to the previous session, not to
  // "Not logged yet" - stampText only needs its date.
  const previous = wrap.dataset.prevDate ? { date: wrap.dataset.prevDate } : null;
  showSave(wrap, 'saved', stampText(entry, previous));
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
  showSave(wrap, 'saving', 'Saving...');

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
      // A history row is pinned to its own date and has no "last session"
      // reference; today's field looks up the previous entry as well.
      const dated = Boolean(wrap.dataset.date);
      const [entry, previous] = await Promise.all([
        getEntry(code, dated ? wrap.dataset.date : today),
        dated ? null : lastEntryBefore(code, today)
      ]);

      if (!wrap.isConnected) return;

      if (entry && !textarea.dataset.hydrated && document.activeElement !== textarea) {
        textarea.value = entry.text;
        autoGrow(textarea);
      }

      setStamp(wrap, entry, previous);

      if (previous) {
        wrap.dataset.prevDate = previous.date;
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
