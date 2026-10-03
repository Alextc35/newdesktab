import { applyInterfaceTheme } from '../../shared/ui/interfaceTheme.js';
import {
  getDraftInterfaceTheme,
  getDraftShowRecycleBin,
  setDraftInterfaceTheme,
  setDraftShowRecycleBin,
  getInitialSnapshot
} from './settingsDraft.js';
import { t } from '../../platform/i18n/i18n.js';
import { exportBackup, importBackup } from './backupActions.js';
import { showAlert } from '../../shared/ui/alertModal.js';
import { createRecycleBinSvg } from '../../shared/ui/svgIcons.js';

/** Connects complete backup/restore and destructive reset actions. */
export function initGeneralSection({
  onResetSettings,
  onDeleteAllData,
  onBackupImported,
  onRequestSaveStateUpdate
}) {
  const themeInputs = document.querySelectorAll('input[name="interface-theme"]');
  const showRecycleBinInput = document.getElementById('settings-show-recycle-bin');
  document.querySelector('.settings-recycle-bin-icon')
    .replaceChildren(createRecycleBinSvg());

  function syncUI() {
    const preference = getDraftInterfaceTheme();
    for (const input of themeInputs) input.checked = input.value === preference;
    applyInterfaceTheme(preference);
    showRecycleBinInput.checked = getDraftShowRecycleBin();
  }

  showRecycleBinInput.addEventListener('change', () => {
    setDraftShowRecycleBin(showRecycleBinInput.checked);
    onRequestSaveStateUpdate();
  });

  for (const input of themeInputs) {
    input.addEventListener('change', () => {
      setDraftInterfaceTheme(input.value);
      syncUI();
      onRequestSaveStateUpdate();
    });
  }

  function restoreInitialTheme() {
    applyInterfaceTheme(getInitialSnapshot().interfaceTheme);
  }

  const exportButton = document.getElementById('export-btn-general');
  const importButton = document.getElementById('import-btn-general');
  const importInput = document.getElementById('import-input-general');
  const resetButton = document.getElementById('reset-settings-btn-general');
  const deleteAllDataButton = document.getElementById('delete-all-data-btn-general');

  exportButton.addEventListener('click', exportBackup);
  importButton.addEventListener('click', () => importInput.click());

  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) return;

    const confirmed = await showAlert(t('alert.backup.import'), { type: 'confirm' });
    if (!confirmed) return;

    if (await importBackup(file)) onBackupImported?.();
  });

  resetButton.addEventListener('click', async () => {
    const confirmed = await showAlert(t('alert.settings.reset'), { type: 'confirm' });
    if (confirmed) await onResetSettings?.();
  });

  deleteAllDataButton.addEventListener('click', async () => {
    const confirmed = await showAlert(
      t('alert.settings.deleteAllData'),
      { type: 'confirm' }
    );
    if (!confirmed) return;

    deleteAllDataButton.disabled = true;
    try {
      await onDeleteAllData?.();
    } finally {
      deleteAllDataButton.disabled = false;
    }
  });

  return { syncUI, restoreInitialTheme };
}
