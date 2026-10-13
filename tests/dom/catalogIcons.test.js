import { expect, test, vi } from 'vitest';
import { createFavicon } from '../../src/features/bookmarks/bookmarkFavicon.js';
import { createBookmarkElement } from '../../src/features/bookmarks/bookmarkCard.js';
import { createBookmarkListIcon } from '../../src/features/bookmarks/bookmarkListItem.js';
import { createFolderVisual } from '../../src/features/folders/folderVisual.js';
import { createRecycleBinGlyph } from '../../src/features/recycle-bin/recycleBinAppearance.js';

test('selected categories render consistently without requesting favicons, including editor placeholders', () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  try {
    const bookmark = { name: 'Reading', url: 'https://reading.example', iconId: 'notes', backgroundFavicon: true };
    for (const visual of [
      createFavicon(bookmark, { placeholderUrl: 'https://placeholder.example/icon.png' }),
      createBookmarkElement(bookmark), createBookmarkListIcon(bookmark)
    ]) {
      expect(visual.querySelector('[data-icon-id="notes"]')).not.toBeNull();
      expect(visual.querySelector('img')).toBeNull();
    }
    const folder = createFolderVisual({ iconId: 'projects' }, [bookmark]);
    expect(folder.querySelector('[data-icon-id="projects"]')).not.toBeNull();
    expect(folder.querySelector('.folder-previews')).toBeNull();
    const bin = createRecycleBinGlyph({ iconId: 'tasks' });
    expect(bin.querySelector('[data-icon-id="tasks"]')).not.toBeNull();
    expect(bin.querySelector('.recycle-bin-svg')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});

test('original folder and recycle-bin artwork remains available for unknown or cleared choices', () => {
  for (const iconId of [null, 'unknown', '../unsafe.svg']) {
    expect(createFolderVisual({ iconId }).querySelector('.folder-tab')).not.toBeNull();
    expect(createRecycleBinGlyph({ iconId }).querySelector('.recycle-bin-can')).not.toBeNull();
  }
});
