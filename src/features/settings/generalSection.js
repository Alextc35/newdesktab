import { applyInterfaceTheme } from '../../shared/ui/interfaceTheme.js';
import {
  getDraftInterfaceTheme,
  getDraftShowRecycleBin,
  getDraftRecycleBinRetentionDays,
  setDraftInterfaceTheme,
  setDraftShowRecycleBin,
  setDraftRecycleBinRetentionDays,
  getInitialSnapshot
} from './settingsDraft.js';
import { t } from '../../platform/i18n/i18n.js';
import { exportBackup, importBackup } from './backupActions.js';
import { showAlert } from '../../shared/ui/alertModal.js';
import { createRecycleBinSvg } from '../../shared/ui/svgIcons.js';
import { refreshCustomSelect } from '../../shared/ui/customSelect.js';

/** Connects complete backup/restore and destructive reset actions. */
export function initGeneralSection({
  onResetSettings,
  onDeleteAllData,
  onBackupImported,
  onRequestSaveStateUpdate
}) {
  const themeInputs = document.querySelectorAll('input[name="interface-theme"]');
  const showRecycleBinInput = document.getElementById('settings-show-recycle-bin');
  const recycleBinRetentionSelect = document.getElementById('settings-recycle-bin-retention');
  document.querySelector('.settings-recycle-bin-icon')
    .replaceChildren(createRecycleBinSvg());

  function syncUI() {
    const preference = getDraftInterfaceTheme();
    for (const input of themeInputs) input.checked = input.value === preference;
    applyInterfaceTheme(preference);
    showRecycleBinInput.checked = getDraftShowRecycleBin();
    recycleBinRetentionSelect.value = String(getDraftRecycleBinRetentionDays());
    refreshCustomSelect(recycleBinRetentionSelect);
  }

  showRecycleBinInput.addEventListener('change', () => {
    setDraftShowRecycleBin(showRecycleBinInput.checked);
    onRequestSaveStateUpdate();
  });

  recycleBinRetentionSelect.addEventListener('change', () => {
    setDraftRecycleBinRetentionDays(recycleBinRetentionSelect.value);
    refreshCustomSelect(recycleBinRetentionSelect);
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

  exportButton.addEventListener('click', async () => {
    exportButton.disabled = true;
    try { await exportBackup(); }
    finally { exportButton.disabled = false; }
  });
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
