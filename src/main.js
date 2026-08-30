import './styles.css';
import { ProgramError, getWorkout, validateProgram } from './program.js';
import { workoutView } from './views/workout.js';
import { guideView } from './views/guide.js';
import { tabBar, TABS } from './components/tab-bar.js';
import { flushPending, handleLogInput, hydrateLogFields, copyLastInto } from './components/log-field.js';

const app = document.getElementById('app');
const LAST_TAB = 'lastTab';

const scrollByHash = new Map();
let currentHash = null;

const isKnown = (hash) => TABS.some((tab) => tab.hash === hash);

function resolveHash() {
  if (isKnown(location.hash)) return location.hash;
  let remembered = null;
  try {
    remembered = localStorage.getItem(LAST_TAB);
  } catch {
    remembered = null;
  }
  return isKnown(remembered) ? remembered : TABS[0].hash;
}

function viewFor(hash) {
  if (hash === '#/guide') return guideView();
  return workoutView(getWorkout(hash === '#/workout-b' ? 'workout-b' : 'workout-a'));
}

async function render() {
  await flushPending();

  const hash = resolveHash();
  if (location.hash !== hash) {
    location.hash = hash;
    return;
  }

  if (currentHash && currentHash !== hash) scrollByHash.set(currentHash, window.scrollY);

  app.innerHTML = viewFor(hash) + tabBar(hash);
  currentHash = hash;
  try {
    localStorage.setItem(LAST_TAB, hash);
  } catch {
    /* private mode: the tab just won't be remembered */
  }

  const target = scrollByHash.get(hash) ?? 0;
  requestAnimationFrame(() => window.scrollTo(0, target));

  hydrateLogFields(app);
}

function showBootError(error) {
  app.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'boot-error';
  const title = document.createElement('h1');
  title.textContent = 'Cannot load the program';
  const detail = document.createElement('p');
  detail.textContent = error.message;
  box.append(title, detail);
  app.append(box);
}

app.addEventListener('input', (event) => {
  if (event.target.classList.contains('log-input')) handleLogInput(event.target);
});

app.addEventListener('blur', (event) => {
  if (event.target.classList.contains('log-input')) flushPending();
}, true);

app.addEventListener('click', (event) => {
  const last = event.target.closest('[data-last]');
  if (last) copyLastInto(last);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushPending();
});

window.addEventListener('pagehide', flushPending);
window.addEventListener('hashchange', render);

try {
  validateProgram();
  render();
} catch (error) {
  if (error instanceof ProgramError) showBootError(error);
  else throw error;
}
