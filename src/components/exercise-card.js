import { esc } from '../dom.js';
import { metaLine } from '../program.js';
import { getMedia } from '../media.js';
import { logField } from './log-field.js';

const BADGES = {
  'key-compound': { label: 'Key Compound', className: 'badge badge-key' },
  updated: { label: 'Updated', className: 'badge badge-updated' }
};

const metaLabel = (ex) => (ex.tempo ? 'Tempo' : ex.benefit ? 'Benefit' : ex.grip ? 'Grip' : null);

function badges(tags) {
  return tags
    .map((tag) => BADGES[tag])
    .filter(Boolean)
    .map((b) => `<span class="${b.className}">${esc(b.label)}</span>`)
    .join('');
}

export function exerciseCard(ex) {
  const meta = metaLine(ex);
  const label = metaLabel(ex);
  const videos = getMedia(ex.code);
  const badgeHtml = badges(ex.tags ?? []);

  return `
    <article class="card" id="ex-${esc(ex.code)}">
      <div class="card-head">
        <span class="chip">${esc(ex.code)}</span>
        <h3 class="card-title">${esc(ex.name)}</h3>
        <span class="reps">${esc(ex.prescription)}</span>
        ${badgeHtml ? `<div class="badges">${badgeHtml}</div>` : ''}
      </div>

      <div class="meta-band">
        <p class="meta-cell"><span class="meta-key">Target:</span> ${esc(ex.target)}</p>
        ${meta ? `<p class="meta-cell"><span class="meta-key">${esc(label)}:</span> ${esc(meta)}</p>` : ''}
      </div>

      <ul class="cues">
        ${ex.cues.map((cue) => `<li>${esc(cue)}</li>`).join('')}
      </ul>

      <div class="card-actions">
        ${videos
          .map(
            (video) => `<a class="watch" href="${esc(video.url)}" target="_blank" rel="noopener noreferrer">
                 <span class="watch-label">▶ ${video.label ? `Watch: ${esc(video.label)}` : 'Watch form video'}</span>
                 <span class="watch-where">↗ YouTube</span>
               </a>`
          )
          .join('')}
        <a class="history-link" href="#/history/${esc(ex.code)}">History</a>
      </div>

      ${logField(ex)}
    </article>
  `;
}
