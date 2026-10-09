import { deleteLocalImage, saveLocalImage } from '../../platform/images/localImages.js';
import { deleteLocalVideo, saveLocalVideo } from '../../platform/images/localVideos.js';

/** Tracks files created by one settings draft and cleans only discarded references. */
export function createWallpaperFiles({ getRetainedTheme = () => null } = {}) {
  const uploadedVideos = new Set();
  const uploadedImages = new Set();
  async function cleanupLocalMedia(previousTheme, savedTheme) {
    const previous = [previousTheme?.backgroundVideo?.local, ...(previousTheme?.backgroundMedia ?? [])
      .filter(item => item.type === 'video').map(item => item.local)];
    const retained = new Set([savedTheme?.backgroundVideo?.local, ...(savedTheme?.backgroundMedia ?? [])
      .filter(item => item.type === 'video').map(item => item.local)]);
    const unused = new Set([...previous, ...uploadedVideos].filter(ref => ref && !retained.has(ref)));
    await Promise.all([...unused].map(deleteLocalVideo));
    uploadedVideos.clear();
    const retainedImages = new Set([savedTheme?.backgroundImageLocal,
      ...(savedTheme?.backgroundMedia ?? []).map(item => item.backgroundImageLocal)]);
    await Promise.all([...uploadedImages]
      .filter(ref => !retainedImages.has(ref)).map(deleteLocalImage));
    uploadedImages.clear();
  }

  async function discardUploadedMedia() {
    // A global retry may already have saved this draft. Never delete files
    // still referenced by the live state when the dialog is later cancelled.
    await cleanupLocalMedia(null, getRetainedTheme());
  }

  return {
    cleanupLocalMedia,
    discardUploadedMedia,
    async save(file) {
      const type = file.type.startsWith('video/') ? 'video' : 'image';
      const reference = type === 'video' ? await saveLocalVideo(file) : await saveLocalImage(file);
      return { type, reference };
    },
    retain(created) {
      for (const { type, reference } of created) {
        (type === 'video' ? uploadedVideos : uploadedImages).add(reference);
      }
    },
    async discardCreated(created) {
      await Promise.all(created.map(({ type, reference }) => (
        type === 'video' ? deleteLocalVideo(reference) : deleteLocalImage(reference)
      )));
    }
  };
}
