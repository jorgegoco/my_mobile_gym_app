// Keeps the screen on during a workout so the phone does not lock between sets.
// Every call is guarded: the API is missing on some browsers, and request()
// rejects when the page is hidden or the battery saver refuses. Failing to hold
// the screen must never break logging.

let lock = null;
let wanted = false;

async function acquire() {
  if (!wanted || lock || document.visibilityState !== 'visible') return;
  if (!navigator.wakeLock?.request) return;
  try {
    lock = await navigator.wakeLock.request('screen');
    // The browser drops the lock on its own when the page is hidden; clear our
    // reference so the next acquire() actually re-requests it.
    lock.addEventListener('release', () => {
      lock = null;
    });
  } catch {
    lock = null;
  }
}

async function release() {
  if (!lock) return;
  const current = lock;
  lock = null;
  try {
    await current.release();
  } catch {
    /* already gone */
  }
}

export function setWakeLockWanted(next) {
  wanted = next;
  if (wanted) acquire();
  else release();
}

export function watchWakeLock() {
  document.addEventListener('visibilitychange', () => {
    // Hidden pages lose the lock automatically, so only re-acquire on return.
    if (document.visibilityState === 'visible') acquire();
  });
}

export const wakeLockHeld = () => lock !== null;
