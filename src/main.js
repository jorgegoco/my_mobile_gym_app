import './styles.css';
import { ProgramError, getWorkout, validateProgram } from './program.js';
import { workoutView } from './views/workout.js';
import { guideView } from './views/guide.js';
import { tabBar, TABS } from './components/tab-bar.js';
import { flushPending, handleLogInput, hydrateLogFields, copyLastInto } from './components/log-field.js';
import { runExport, runImport } from './components/data-tools.js';

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

app.addEventListener('change', (event) => {
  if (event.target.matches('[data-import]')) runImport(app, event.target);
});

app.addEventListener('click', (event) => {
  if (event.target.closest('[data-export]')) {
    runExport(app);
    return;
  }

  const install = event.target.closest('[data-install]');
  if (install) {
    runInstallPrompt(install);
    return;
  }

  const watch = event.target.closest('.watch');
  if (watch && !navigator.onLine) {
    event.preventDefault();
    return;
  }

  const last = event.target.closest('[data-last]');
  if (last) copyLastInto(last);
});

let installPrompt = null;

function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* offline support is a bonus; never block the app on it */
    });
  });
}

function trackInstallability() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    document.documentElement.dataset.installable = 'true';
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    delete document.documentElement.dataset.installable;
  });
}

async function runInstallPrompt(button) {
  if (!installPrompt) return;
  button.disabled = true;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  delete document.documentElement.dataset.installable;
}

// Without this the browser treats our data as evictable under storage pressure.
async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist || (await navigator.storage.persisted())) return;
    await navigator.storage.persist();
  } catch {
    /* not supported everywhere; the app works either way */
  }
}

function trackConnectivity() {
  const apply = () => {
    document.documentElement.dataset.offline = navigator.onLine ? '' : 'true';
  };
  window.addEventListener('online', apply);
  window.addEventListener('offline', apply);
  apply();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushPending();
});

window.addEventListener('pagehide', flushPending);
window.addEventListener('hashchange', render);

try {
  validateProgram();
  trackConnectivity();
  trackInstallability();
  registerServiceWorker();
  requestPersistentStorage();
  render();
} catch (error) {
  if (error instanceof ProgramError) showBootError(error);
  else throw error;
}
