import { esc } from '../dom.js';

export const TABS = [
  { hash: '#/workout-a', label: 'Workout A', short: 'A' },
  { hash: '#/workout-b', label: 'Workout B', short: 'B' },
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
