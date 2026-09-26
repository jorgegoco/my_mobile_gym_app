import { esc } from '../dom.js';
import { program, SWIM_LOG, swimForDate, swimMinutes, expressMeters } from '../program.js';
import { logField } from '../components/log-field.js';

const fmt = (meters) => meters.toLocaleString('en-US');
const lengths = (meters) => meters / program.swim.poolMeters;
// "300m · 12 lengths"
const distance = (meters) => `${fmt(meters)}m &middot; ${lengths(meters)} lengths`;

function block(b) {
  return `
    <li class="swim-block">
      <div class="swim-block-head">
        <h4>${esc(b.title)}</h4>
        <span class="swim-dist">${distance(b.meters)}</span>
      </div>
      <p>${esc(b.detail)}</p>
      ${b.points ? `<ul class="swim-points">${b.points.map((pt) => `<li>${esc(pt)}</li>`).join('')}</ul>` : ''}
      ${b.rest ? `<p class="swim-rest">Rest: ${esc(b.rest)}</p>` : ''}
    </li>
  `;
}

function blocks(routine) {
  const rounds = routine.rounds ?? 1;
  const perRound = routine.blocks.reduce((total, b) => total + b.meters, 0);
  const lead =
    rounds > 1
      ? `<p class="swim-rounds">${rounds} rounds of this ${fmt(perRound)}m block:</p>`
      : '';
  return `${lead}<ol class="swim-blocks">${routine.blocks.map(block).join('')}</ol>`;
}

// The days a routine is swum on, from the schedule: "Mondays & Thursdays".
function daysFor(routineId) {
  const days = program.swim.schedule.filter((r) => r.routineId === routineId).map((r) => `${r.day}s`);
  return days.length < 2 ? days.join('') : `${days.slice(0, -1).join(', ')} & ${days.at(-1)}`;
}

function today(swim) {
  const todays = swimForDate();
  const routine = todays.routine;
  return `
    <header class="view-head">
      <h2 class="section-title">${esc(todays.day)}: ${esc(routine.name)}</h2>
      <p class="section-sub">${distance(swim.sessionMeters)} &middot; ${esc(routine.target)}</p>
    </header>
    <article class="card swim-today">
      <p class="swim-objective">${esc(todays.objective)}</p>
      ${blocks(routine)}
      ${logField({ code: SWIM_LOG }, 'Strokes L10/30/50: 18,19,20 - felt smooth')}
      <div class="card-actions">
        <a class="history-link" href="#/history/${SWIM_LOG}">Swim history</a>
      </div>
    </article>
  `;
}

function rotation(swim) {
  const todayDay = swimForDate().day;
  const names = new Map(swim.routines.map((r) => [r.id, r.name]));
  const rows = swim.schedule
    .map(
      (row) => `
      <tr class="${row.day === todayDay ? 'row-today' : ''}">
        <td class="col-time" data-label="Day"><strong>${esc(row.day)}</strong></td>
        <td class="col-activity" data-label="Routine">${esc(names.get(row.routineId))}</td>
        <td class="col-strategy" data-label="Primary Training Objective">${esc(row.objective)}</td>
      </tr>`
    )
    .join('');
  return `
    <h2 class="section-title">Weekly Rotation</h2>
    <div class="table-wrap">
      <table class="grid">
        <thead><tr><th>Day</th><th>Routine</th><th>Primary Training Objective</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

// Every routine, collapsed: today's is already open above, the rest are there
// to look ahead or to swap when the pool is busy.
function allRoutines(swim) {
  return `
    <h2 class="section-title">All Routines</h2>
    ${swim.routines
      .map(
        (r) => `
      <details class="swim-routine">
        <summary>
          <span class="swim-routine-name">${esc(r.name)}</span>
          <span class="swim-routine-days">${esc(daysFor(r.id))}</span>
        </summary>
        <p class="swim-objective">${esc(r.target)}</p>
        ${blocks(r)}
      </details>`
      )
      .join('')}
  `;
}

function express(swim) {
  const ex = swim.express;
  if (!ex) return '';
  const parts = [ex.warmUp, ex.mainBlock, ex.coolDown];
  return `
    <h2 class="section-title">${esc(ex.title)}</h2>
    <p class="swim-intro">${esc(ex.intro)}</p>
    <ol class="swim-blocks">${parts.map(block).join('')}</ol>
    <h3 class="tier-title">Time options</h3>
    <ul class="tier">
      ${ex.options
        .map((opt) => {
          const meters = expressMeters(ex, opt.mainBlocks);
          const label = opt.mainBlocks === 1 ? '1 Main Block' : `${opt.mainBlocks} Main Blocks`;
          return `<li><strong>About ${swimMinutes(meters)} min - ${distance(meters)}:</strong> Warm-Up + ${label} + Cool-Down.</li>`;
        })
        .join('')}
    </ul>
    <p class="swim-footnote">
      Times are estimated from your own pace - ${fmt(swim.sessionMeters)}m in ${swim.sessionMinutes} minutes, rests included.
    </p>
    <div class="note"><p>${esc(ex.note)}</p></div>
  `;
}

function technique(swim) {
  const { breathing, openTurn, missedSessions } = swim;
  const points = (list) =>
    list.map((pt) => `<li><strong>${esc(pt.label)}:</strong> ${esc(pt.text)}</li>`).join('');
  return `
    <h2 class="section-title">Technique &amp; Principles</h2>
    <div class="note">
      <h3>${esc(breathing.title)}</h3>
      <ul>${points(breathing.points)}</ul>
    </div>
    <div class="note note-warm">
      <h3>${esc(openTurn.title)}</h3>
      <p>${esc(openTurn.intro)}</p>
      <ol class="swim-steps">
        ${openTurn.steps.map((s) => `<li><strong>${esc(s.phase)}:</strong> ${esc(s.action)}</li>`).join('')}
      </ol>
    </div>
    <div class="note">
      <h3>${esc(missedSessions.title)}</h3>
      <ul>${points(missedSessions.points)}</ul>
    </div>
  `;
}

export function swimView() {
  const swim = program.swim;
  return `
    ${today(swim)}
    ${rotation(swim)}
    ${allRoutines(swim)}
    ${express(swim)}
    ${technique(swim)}
  `;
}
