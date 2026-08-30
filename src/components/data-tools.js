import { exportAll, importAll, parseBackup, backupFilename } from '../logs.js';

export function dataTools() {
  return `
    <h2 class="section-title">Your Data</h2>
    <div class="data-tools">
      <p class="data-note">
        Your logs are saved on this phone only - never on GitHub, never on a server.
        Export a backup file after training; clearing browser data or uninstalling would
        otherwise erase your history for good.
      </p>
      <div class="data-buttons">
        <button class="data-btn" type="button" data-export>Export backup</button>
        <label class="data-btn data-btn-import">
          Import backup
          <input type="file" accept="application/json,.json" data-import hidden />
        </label>
      </div>
      <p class="data-status" data-data-status aria-live="polite"></p>
    </div>
  `;
}

const status = (root, message, kind = '') => {
  const el = root.querySelector('[data-data-status]');
  if (!el) return;
  el.textContent = message;
  el.dataset.kind = kind;
};

export async function runExport(root) {
  try {
    const payload = await exportAll();
    if (payload.entries.length === 0) {
      status(root, 'Nothing to export yet - log a session first.', 'warn');
      return;
    }

    const name = backupFilename();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    // Revoke on the next frame: revoking synchronously can cancel the download.
    requestAnimationFrame(() => URL.revokeObjectURL(url));

    const n = payload.entries.length;
    status(root, `Saved ${name} to your downloads (${n} ${n === 1 ? 'entry' : 'entries'}).`, 'ok');
  } catch (error) {
    status(root, `Export failed: ${error.message}`, 'error');
  }
}

export async function runImport(root, input) {
  const file = input.files?.[0];
  if (!file) return;

  try {
    const payload = parseBackup(await file.text());
    const { imported, updated } = await importAll(payload);
    status(root, `${imported} entries imported, ${updated} updated.`, 'ok');
  } catch (error) {
    status(root, error.message, 'error');
  } finally {
    // Clear it so picking the same file again still fires a change event.
    input.value = '';
  }
}
