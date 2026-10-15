import './styles.css';
import { ProgramError, getWorkout, validateProgram } from './program.js';
import { workoutView } from './views/workout.js';
import { guideView } from './views/guide.js';
import { swimView } from './views/swim.js';
import { tabBar, TABS, SWIM_HASH } from './components/tab-bar.js';
import { autoGrow, hydrateLogFields, toggleLog } from './components/log-field.js';
import { runExport, runImport } from './components/data-tools.js';
import { migrateSharedLogs } from './logs.js';
import { setWakeLockWanted, watchWakeLock } from './wake-lock.js';

const app = document.getElementById('app');
const LAST_TAB = 'lastTab';

const scrollByHash = new Map();
let currentHash = null;

const isTab = (hash) => TABS.some((tab) => tab.hash === hash);

function resolveHash() {
  if (isTab(location.hash)) return location.hash;
  let remembered = null;
  try {
    remembered = localStorage.getItem(LAST_TAB);
  } catch {
    remembered = null;
  }
  return isTab(remembered) ? remembered : TABS[0].hash;
}

async function viewFor(hash) {
  if (hash === '#/guide') return guideView();
  if (hash === SWIM_HASH) return swimView();
  // Every other tab hash is a workout id: '#/day-1' -> 'day-1'.
  return workoutView(getWorkout(hash.slice(2)));
}

async function render() {
  const hash = resolveHash();
  if (location.hash !== hash) {
    location.hash = hash;
    return;
  }

  if (currentHash && currentHash !== hash) scrollByHash.set(currentHash, window.scrollY);

  app.innerHTML = (await viewFor(hash)) + tabBar(hash);
  currentHash = hash;
  try {
    if (isTab(hash)) localStorage.setItem(LAST_TAB, hash);
  } catch {
    /* private mode: the tab just won't be remembered */
  }

  // Only the gym screens keep the screen awake; the guide and the swim are
  // reading - the phone is in the locker during the swim - and holding it
  // there would just burn battery.
  setWakeLockWanted(isTab(hash) && hash !== '#/guide' && hash !== SWIM_HASH);

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
  if (event.target.classList.contains('log-input')) autoGrow(event.target);
});

app.addEventListener('change', (event) => {
  if (event.target.matches('[data-import]')) runImport(app, event.target);
});

app.addEventListener('click', (event) => {
  const action = event.target.closest('[data-log-action]');
  if (action) {
    toggleLog(action);
    return;
  }

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

window.addEventListener('hashchange', render);

try {
  validateProgram();
  trackConnectivity();
  trackInstallability();
  registerServiceWorker();
  requestPersistentStorage();
  watchWakeLock();
  // Before the first render, so a shared log shows its moved entries at once.
  // A failed migration only leaves old entries where they were; never block boot.
  migrateSharedLogs().catch(() => {}).finally(render);
} catch (error) {
  if (error instanceof ProgramError) showBootError(error);
  else throw error;
}
