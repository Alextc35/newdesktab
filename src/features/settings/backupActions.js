import {
  createBackupEnvelope,
  parseBackupPayload
} from '../../platform/storage/dataSchema.js';
import { getState, setState, requirePersistence } from '../../state/appStore.js';
import { flashError, flashSuccess } from '../../shared/ui/flash.js';
import { downloadJson } from '../../shared/ui/jsonDownload.js';
import { downloadBlob } from '../../shared/ui/blobDownload.js';
import { createBackupArchive, isBackupArchive, readBackupArchive } from '../../platform/backup/backupArchive.js';
import {
  exportReferencedLocalImages,
  restoreReferencedLocalImages
} from '../../platform/images/localImages.js';
import {
  getReferencedLocalVideoFiles,
  restoreReferencedLocalVideos,
  restoreReferencedLocalVideoFiles
} from '../../platform/images/localVideos.js';
import { ensureRecycleBinPosition } from '../recycle-bin/recycleBinActions.js';

let exporting = false;

export async function exportBackup() {
  if (exporting) return;
  exporting = true;
  try {
    const data = getState().data;
    const localImages = await exportReferencedLocalImages(data);
    const localVideos = await getReferencedLocalVideoFiles(data);
    const filename = `newdesktab-backup-${new Date().toISOString().slice(0, 10)}`;
    if (Object.keys(localVideos).length) {
      downloadBlob(await createBackupArchive(data, localImages, localVideos), `${filename}.zip`);
    } else {
      downloadJson(createBackupEnvelope(data, { localImages }), `${filename}.json`);
    }
    flashSuccess('flash.backup.exported');
  } catch (error) {
    console.error('[BACKUP] Export failed:', error);
    flashError(['LOCAL_IMAGE_MISSING', 'LOCAL_VIDEO_MISSING'].includes(error?.code)
      ? 'flash.backup.mediaUnavailable'
      : 'flash.backup.exportError');
  } finally {
    exporting = false;
  }
}

/** @param {File} file */
export async function importBackup(file) {
  if (!file) {
    flashError('flash.backup.importError');
    return false;
  }

  try {
    let data;
    if (await isBackupArchive(file)) {
      const archive = await readBackupArchive(file, getState().data);
      data = archive.data;
      await restoreReferencedLocalImages(data, archive.localImages);
      await restoreReferencedLocalVideoFiles(data, archive.localVideos);
    } else {
      const payload = JSON.parse(await file.text());
      data = parseBackupPayload(payload, getState().data);
      await restoreReferencedLocalImages(data,
        payload?.format === 'newdesktab-backup' ? payload.localImages : undefined);
      await restoreReferencedLocalVideos(data,
        payload?.format === 'newdesktab-backup' ? payload.localVideos : undefined);
    }
    await setState({ data });
    await requirePersistence();
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

