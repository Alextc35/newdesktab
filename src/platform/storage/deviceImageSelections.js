import { preloadLocalImages, resolveImageSource } from '../images/localImages.js';
import { isLocalImageReference } from '../../shared/images/backgroundImage.js';
import { callStorage } from './chromeStorage.js';

export const DEVICE_IMAGE_SELECTIONS_KEY = 'newdesktabLocalImageSelections';

/** Stable slots let each device choose its own file for the same synchronized item. */
function imageSlots(data) {
  return [
    ['theme', data.settings?.theme],
    ['bookmarkDefault', data.settings?.bookmarkDefault],
    ['recycleBin', data.recycleBin],
    ...(data.bookmarks ?? []).map(item => [`bookmark:${item.id}`, item]),
    ...(data.folders ?? []).map(item => [`folder:${item.id}`, item]),
    ...(data.trash ?? []).flatMap(entry => entry.type === 'folder'
      ? [
        [`trash:${entry.id}:folder`, entry.folder],
        ...entry.bookmarks.map(item => [`trash:${entry.id}:bookmark:${item.id}`, item])
      ]
      : [[`trash:${entry.id}:bookmark:${entry.bookmark.id}`, entry.bookmark]]),
    ...(data.settings?.bookmarkPresets ?? []).map(item => [`preset:${item.id}`, item.style])
  ].filter(([, style]) => style && typeof style === 'object');
}

/** Removes device selections from the payload sent to Sync, without changing app state. */
export function withoutDeviceImages(data) {
  const shared = structuredClone(data);
  for (const [, style] of imageSlots(shared)) {
    delete style.backgroundImageLocal;
    delete style.backgroundImageSource;
  }
  return shared;
}

/** Commits local selections, including explicit removals, when the user saves a draft. */
export async function saveDeviceImageSelections(data) {
  const selections = await readSelections();
  const slots = imageSlots(data);
  let changed = pruneSelections(selections, slots);
  for (const [key, style] of slots) {
    const reference = isLocalImageReference(style.backgroundImageLocal)
      ? style.backgroundImageLocal : null;
    const selection = {
      reference,
      source: reference && style.backgroundImageSource !== 'url' ? 'local' : 'url'
    };
    if (!Object.hasOwn(selections, key) && !reference) continue;
    if (sameSelection(selections[key], selection)) continue;
    selections[key] = selection;
    changed = true;
  }
  if (changed) await writeSelections(selections);
}

/** Removes every device-specific image choice during a complete data reset. */
export function clearDeviceImageSelections() {
  return callStorage(chrome.storage.local, 'remove', DEVICE_IMAGE_SELECTIONS_KEY);
}

/**
 * Overlays this device's choices on incoming data. Legacy inline references are
 * adopted only where the file is available locally and no choice has been made.
 * A saved null prevents a removed image from reappearing after a sync refresh.
 */
export async function restoreDeviceImageSelections(data) {
  const restored = structuredClone(data);
  const selections = await readSelections();
  const slots = imageSlots(restored);
  const candidates = slots.map(([key, style]) => (
    Object.hasOwn(selections, key) ? selections[key].reference : style.backgroundImageLocal
  ));
  await preloadLocalImages(candidates);

  let changed = pruneSelections(selections, slots);
  for (const [key, style] of slots) {
    const hasSelection = Object.hasOwn(selections, key);
    const reference = hasSelection ? selections[key].reference : style.backgroundImageLocal;
    const source = hasSelection ? selections[key].source : style.backgroundImageSource;
    const available = isLocalImageReference(reference) && resolveImageSource(reference);
    style.backgroundImageLocal = available ? reference : null;
    style.backgroundImageSource = available && source !== 'url' ? 'local' : 'url';
    if (!hasSelection && isLocalImageReference(reference)) {
      selections[key] = {
        reference: style.backgroundImageLocal,
        source: style.backgroundImageSource
      };
      changed = true;
    }
  }
  if (changed) await writeSelections(selections);
  return restored;
}

async function readSelections() {
  const stored = await callStorage(chrome.storage.local, 'get', DEVICE_IMAGE_SELECTIONS_KEY);
  const value = stored[DEVICE_IMAGE_SELECTIONS_KEY];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, selection]) => {
    if (selection === null || isLocalImageReference(selection)) {
      return [[key, {
        reference: selection,
        source: selection ? 'local' : 'url'
      }]];
    }
    if (!selection || typeof selection !== 'object' || Array.isArray(selection)) return [];
    const reference = selection.reference;
    if (reference !== null && !isLocalImageReference(reference)) return [];
    return [[key, {
      reference,
      source: reference && selection.source !== 'url' ? 'local' : 'url'
    }]];
  }));
}

function sameSelection(left, right) {
  return left?.reference === right.reference && left?.source === right.source;
}

function pruneSelections(selections, slots) {
  const validKeys = new Set(slots.map(([key]) => key));
  let changed = false;

  for (const key of Object.keys(selections)) {
    if (validKeys.has(key)) continue;
    delete selections[key];
    changed = true;
  }

  return changed;
}

function writeSelections(selections) {
  return callStorage(chrome.storage.local, 'set', {
    [DEVICE_IMAGE_SELECTIONS_KEY]: selections
  });
}
