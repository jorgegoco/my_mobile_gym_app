import { esc } from '../dom.js';
import { getExercise, getWorkoutForExercise, logCodeFor, todayKey } from '../program.js';
import { historyFor, formatShortDate } from '../logs.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function heading(date, today) {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  const label = `${weekday}, ${formatShortDate(date)}`;
  return date === today ? `${label} (today)` : label;
}

function row(entry, today) {
  return `
    <li class="entry" data-entry="${esc(entry.date)}">
      <div class="entry-head">
        <h3 class="entry-date">${esc(heading(entry.date, today))}</h3>
        <button class="entry-delete" type="button" data-delete="${esc(entry.date)}" aria-label="Delete this entry">Delete</button>
      </div>
      <div class="log" data-log="${esc(entry.code)}" data-date="${esc(entry.date)}">
        <textarea
          id="log-${esc(entry.code)}-${esc(entry.date)}"
          class="log-input"
          rows="2"
          enterkeyhint="done"
          aria-label="Log for ${esc(heading(entry.date, today))}"
        ></textarea>
        <span class="log-stamp" data-stamp aria-live="polite"></span>
      </div>
    </li>
  `;
}

export async function historyView(code) {
  const exercise = getExercise(code);
  const workout = getWorkoutForExercise(code);
  // B6's history is A6's: the route keeps B6 so "back" returns to Day 3.
  const entries = await historyFor(logCodeFor(code));
  const today = todayKey();

  const body = entries.length
    ? `<ul class="entries">${entries.map((entry) => row(entry, today)).join('')}</ul>`
    : `<p class="entries-empty">No sessions logged yet for this exercise.</p>`;

  return `
    <header class="view-head">
      <a class="back" href="#/${esc(workout.id)}">&lsaquo; ${esc(workout.name.split(':')[0])}</a>
      <h2 class="section-title">${esc(exercise.name)}</h2>
      <p class="section-sub">
        ${entries.length} ${entries.length === 1 ? 'session' : 'sessions'} logged &middot; newest first
      </p>
    </header>
    ${body}
  `;
}
