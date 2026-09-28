import {
  createBackupEnvelope,
  parseBackupPayload
} from '../../platform/storage/dataSchema.js';
import { getState, setState } from '../../core/store.js';
import { flashError, flashSuccess } from '../../shared/ui/flash.js';
import { downloadJson } from '../../shared/ui/jsonDownload.js';
import { ensureRecycleBinPosition } from '../recycle-bin/recycleBinActions.js';

export function exportBackup() {
  try {
    downloadJson(
      createBackupEnvelope(getState().data),
      `newdesktab-backup-${new Date().toISOString().slice(0, 10)}.json`
    );
    flashSuccess('flash.backup.exported');
  } catch (error) {
    console.error('[BACKUP] Export failed:', error);
    flashError('flash.backup.exportError');
  }
}

/** @param {File} file */
export async function importBackup(file) {
  if (!file) {
    flashError('flash.backup.importError');
    return false;
  }

  try {
    const payload = JSON.parse(await file.text());
    const data = parseBackupPayload(payload, getState().data);
    await setState({ data });
    ensureRecycleBinPosition();
    flashSuccess('flash.backup.imported');
    return true;
  } catch (error) {
    console.error('[BACKUP] Import failed:', error);
    flashError('flash.backup.importError');
    return false;
  }
}

