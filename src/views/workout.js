import { esc } from '../dom.js';
import { exerciseCard } from '../components/exercise-card.js';

export function workoutView(workout) {
  return `
    <header class="view-head">
      <h2 class="section-title">${esc(workout.name)}</h2>
      <p class="section-sub">${esc(workout.focus)}</p>
    </header>
    <section class="exercises">
      ${workout.exercises.map(exerciseCard).join('')}
    </section>
  `;
}
