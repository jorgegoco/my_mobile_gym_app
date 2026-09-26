import { esc } from '../dom.js';
import { program } from '../program.js';

// The swim first - it is how every morning starts - then one tab per gym day in
// program order, then the guide. A gym tab hash IS the workout id, which is
// what lets main.js resolve a route by lookup.
// `?? []` because this runs at module load, before validateProgram() - a
// program with no workouts must reach that check to get a readable error.
export const SWIM_HASH = '#/swim';

export const TABS = [
  ...(program.swim ? [{ hash: SWIM_HASH, label: 'Swim', short: 'S' }] : []),
  ...(program.workouts ?? []).map((workout) => ({
    hash: `#/${workout.id}`,
    label: workout.name.split(':')[0],
    short: workout.code
  })),
  { hash: '#/guide', label: 'Guide', short: 'i' }
];

export function tabBar(activeHash) {
  return `
    <nav class="tabs">
      ${TABS.map(
        (tab) => `
        <a class="tab${tab.hash === activeHash ? ' tab-active' : ''}" href="${esc(tab.hash)}">
          <span class="tab-mark">${esc(tab.short)}</span>
          <span class="tab-label">${esc(tab.label)}</span>
        </a>`
      ).join('')}
    </nav>
  `;
}
