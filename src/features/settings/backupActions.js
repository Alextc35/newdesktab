import {
  createBackupEnvelope,
  parseBackupPayload
} from '../../platform/storage/dataSchema.js';
import { getState, setState } from '../../state/appStore.js';
import { flashError, flashSuccess } from '../../shared/ui/flash.js';
import { downloadJson } from '../../shared/ui/jsonDownload.js';
import {
  exportReferencedLocalImages,
  restoreReferencedLocalImages
} from '../../platform/images/localImages.js';
import {
  exportReferencedLocalVideos,
  restoreReferencedLocalVideos
} from '../../platform/images/localVideos.js';
import { ensureRecycleBinPosition } from '../recycle-bin/recycleBinActions.js';

export async function exportBackup() {
  try {
    const data = getState().data;
    const localImages = await exportReferencedLocalImages(data);
    const localVideos = await exportReferencedLocalVideos(data);
    downloadJson(
      createBackupEnvelope(data, { localImages, localVideos }),
      `newdesktab-backup-${new Date().toISOString().slice(0, 10)}.json`
    );
    flashSuccess('flash.backup.exported');
  } catch (error) {
    console.error('[BACKUP] Export failed:', error);
    flashError(['LOCAL_IMAGE_MISSING', 'LOCAL_VIDEO_MISSING'].includes(error?.code)
      ? 'flash.backup.mediaUnavailable'
      : 'flash.backup.exportError');
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
    await restoreReferencedLocalImages(
      data,
      payload?.format === 'newdesktab-backup' ? payload.localImages : undefined
    );
    await restoreReferencedLocalVideos(
      data,
      payload?.format === 'newdesktab-backup' ? payload.localVideos : undefined
    );
    await setState({ data });
    ensureRecycleBinPosition();
    flashSuccess('flash.backup.imported');
    return true;
  } catch (error) {
    console.error('[BACKUP] Import failed:', error);
    flashError(['LOCAL_IMAGE_STORAGEFULL', 'LOCAL_VIDEO_STORAGEFULL'].includes(error?.code)
      ? 'flash.backup.mediaStorageFull'
      : 'flash.backup.importError');
    return false;
  }
}

