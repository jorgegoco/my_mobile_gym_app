import { esc } from '../dom.js';
import { logCodeFor, sharedLogWith, getWorkoutForExercise } from '../program.js';
import { getEntry, saveEntry } from '../logs.js';

const EMPTY = 'Not logged yet';

// "shared with A6 (Day 1)" - says why a value entered on another day shows up here.
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
      <label class="log-label" for="log-${esc(ex.code)}">Log${sharedNote(ex)}</label>
      <p class="log-value" data-value data-empty>${EMPTY}</p>
      <textarea
        id="log-${esc(ex.code)}"
        class="log-input"
        rows="2"
        placeholder="${esc(placeholder)}"
        hidden
      ></textarea>
      <p class="log-error" data-error role="alert" hidden></p>
      <button class="log-btn" type="button" data-log-action>Edit</button>
    </div>
  `;
}

export function autoGrow(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

// textContent only: this is user text.
function showValue(wrap, text) {
  const value = wrap.querySelector('[data-value]');
  const has = Boolean(text?.trim());
  value.textContent = has ? text : EMPTY;
  value.toggleAttribute('data-empty', !has);
  value.dataset.text = text ?? '';
}

// One button, two states: Edit opens the box on the saved value, Submit writes
// it. Nothing is saved until Submit, so a tab switch while editing drops the edit.
export async function toggleLog(button) {
  const wrap = button.closest('[data-log]');
  const value = wrap.querySelector('[data-value]');
  const input = wrap.querySelector('.log-input');
  const error = wrap.querySelector('[data-error]');

  if (input.hidden) {
    input.value = value.dataset.text ?? '';
    input.hidden = false;
    value.hidden = true;
    error.hidden = true;
    button.textContent = 'Submit';
    button.dataset.mode = 'submit';
    autoGrow(input);
    input.focus();
    return;
  }

  button.disabled = true;
  try {
    const entry = await saveEntry(wrap.dataset.log, input.value);
    showValue(wrap, entry.text);
    input.hidden = true;
    value.hidden = false;
    error.hidden = true;
    button.textContent = 'Edit';
    delete button.dataset.mode;
  } catch {
    error.textContent = 'Not saved - tap Submit to retry';
    error.hidden = false;
  } finally {
    button.disabled = false;
  }
}

export async function hydrateLogFields(root) {
  await Promise.all(
    [...root.querySelectorAll('[data-log]')].map(async (wrap) => {
      const entry = await getEntry(wrap.dataset.log);
      // A late read must never overwrite an edit already under way.
      if (!wrap.isConnected || !wrap.querySelector('.log-input').hidden) return;
      showValue(wrap, entry?.text);
    })
  );
}
