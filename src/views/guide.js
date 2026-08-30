import { esc } from '../dom.js';
import { program } from '../program.js';

const range = ([a, b]) => `${a}–${b}`;

function banner() {
  const { title, version, subtitle, highlights } = program.program;
  return `
    <header class="banner">
      <h1>${esc(title)} <span class="banner-version">(v${esc(version)})</span></h1>
      <p class="banner-sub">${esc(subtitle)}</p>
      <dl class="banner-highlights">
        ${highlights
          .map((h) => `<div><dt>${esc(h.label)}</dt><dd>${esc(h.value)}</dd></div>`)
          .join('')}
      </dl>
    </header>
  `;
}

function protocol() {
  const rows = program.dailyProtocol
    .map((row) => {
      const option = row.optionGroup === 'gym';
      const tag = option ? (row.recommended ? 'Recommended' : 'Back-to-Back') : null;
      const prefix = option ? (row.recommended ? 'OPTION A: ' : 'OPTION B: ') : '';
      return `
        <tr>
          <td class="col-time" data-label="Time Window">
            <strong>${esc(prefix + row.timeWindow)}</strong>
            ${tag ? `<em class="option-tag">(${esc(tag)})</em>` : ''}
          </td>
          <td class="col-activity" data-label="Activity / Event">${esc(row.activity)}</td>
          <td class="col-strategy" data-label="Nutritional &amp; Recovery Strategy">${esc(row.strategy)}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <h2 class="section-title">Fasted Swim &amp; Gym Timing Protocol</h2>
    <div class="table-wrap">
      <table class="grid">
        <thead>
          <tr><th>Time Window</th><th>Activity / Event</th><th>Nutritional &amp; Recovery Strategy</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function bookends() {
  const { warmUp, coolDown } = program;
  return `
    <h2 class="section-title">Warm-Up &amp; Cool-Down Protocols</h2>
    <div class="note note-warm">
      <h3>${esc(warmUp.title)} (${range(warmUp.durationMinutes)} mins)</h3>
      <p><strong>Execution:</strong> ${esc(warmUp.execution)}</p>
    </div>
    <div class="note note-cool">
      <h3>${esc(coolDown.title)}</h3>
      <ul>
        <li><strong>Timing:</strong> ${esc(coolDown.timing)}</li>
        <li><strong>Why:</strong> ${esc(coolDown.why)}</li>
        <li>
          <strong>How to do it:</strong>
          ${range(coolDown.prescription.sets)} sets of ${range(coolDown.prescription.durationSeconds)} seconds.
          ${esc(coolDown.prescription.note)}
        </li>
      </ul>
    </div>
  `;
}

function rules() {
  return `
    <h2 class="section-title">Rules of Hypertrophy &amp; Joint Safety (Age ${esc(program.program.athlete.age)})</h2>
    ${program.rules
      .map(
        (rule) => `
      <div class="rule">
        <h3>${esc(rule.title)}</h3>
        <p>${esc(rule.body)}</p>
      </div>`
      )
      .join('')}
  `;
}

function matrix() {
  const { anchorNote, tiers, goldenRule } = program.swappingMatrix;
  return `
    <h2 class="section-title">Equipment Availability &amp; Exercise Swapping Matrix</h2>
    <div class="note note-anchor"><p>${esc(anchorNote)}</p></div>
    <p class="matrix-lead">How to prioritize the rest of your exercises when machines are occupied</p>
    ${tiers
      .map(
        (tier, i) => `
      <h3 class="tier-title">${i + 1}. ${esc(tier.label)}</h3>
      <ul class="tier">
        ${tier.items
          .map(
            (item) =>
              `<li><strong>${esc(item.codes.join(' & '))}:</strong> ${esc(item.note)}</li>`
          )
          .join('')}
      </ul>`
      )
      .join('')}
    <div class="golden">
      <span class="golden-label">The Golden Rule for your specific routine:</span>
      ${esc(goldenRule)}
    </div>
  `;
}

export function guideView() {
  return `
    ${banner()}
    <button class="install" type="button" data-install>Install app on this phone</button>
    ${protocol()}
    ${bookends()}
    ${rules()}
    ${matrix()}
    <div class="note note-summary">
      <h3>Summary Strategy</h3>
      <p>${esc(program.summaryStrategy)}</p>
    </div>
  `;
}
