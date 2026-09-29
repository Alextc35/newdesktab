import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_FOLDER_STYLE } from '../src/domain/folders/folderDefaults.js';
import { normalizeFolderStyle, validateFolderDraft } from '../src/domain/folders/folderModel.js';

test('legacy and invalid folder styles preserve the default visible appearance', () => {
  for (const style of [undefined, null, {}, {
    outerBackgroundColor: 'red',
    showFolder: null,
    showPreviews: 'false',
    showName: 0,
    showCount: undefined
  }]) {
    assert.deepEqual(normalizeFolderStyle(style), {
      ...DEFAULT_FOLDER_STYLE,
      noOuterBackground: false,
      showCount: true
    });
  }
  assert.equal(normalizeFolderStyle(DEFAULT_FOLDER_STYLE).showCount, false);
});

test('folder visibility controls are independent except previews require a folder graphic', () => {
  const hidden = validateFolderDraft({
    name: 'Private',
    outerBackgroundColor: '#ABCDEF',
    showFolder: false,
    showPreviews: true,
    showName: false,
    showCount: false
  });
  assert.equal(hidden.isValid, true);
  assert.equal(hidden.value.outerBackgroundColor, '#abcdef');
  assert.equal(hidden.value.showFolder, false);
  assert.equal(hidden.value.showPreviews, false);
  assert.equal(hidden.value.showName, false);
  assert.equal(hidden.value.showCount, false);

  const withoutPreviews = normalizeFolderStyle({ showPreviews: false, showName: false });
  assert.equal(withoutPreviews.showFolder, true);
  assert.equal(withoutPreviews.showPreviews, false);
  assert.equal(withoutPreviews.showName, false);
  assert.equal(withoutPreviews.showCount, true);
});

test('clearing or importing an invalid outer color restores the automatic background', () => {
  for (const outerBackgroundColor of [null, '', '#fff', '#ff00ff00', 'url(test)']) {
    assert.equal(normalizeFolderStyle({ outerBackgroundColor }).outerBackgroundColor, null);
  }
});
