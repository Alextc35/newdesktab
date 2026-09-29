import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_RECYCLE_BIN_STYLE } from '../src/domain/recycle-bin/recycleBinDefaults.js';
import {
  normalizeRecycleBinStyle,
  validateRecycleBinStyle
} from '../src/domain/recycle-bin/recycleBinModel.js';

test('normalizes recycle bin colors and independently hidden elements', () => {
  assert.deepEqual(normalizeRecycleBinStyle({
    noBackground: true,
    backgroundColor: '#AA11CC',
    backgroundImageUrl: 'https://images.test/bin.png',
    backgroundImageSource: 'url',
    backgroundImageUrlLocked: true,
    iconColor: '#12AB34',
    textColor: '#F8FAFC',
    showIcon: false,
    showName: false,
    showCount: false
  }), {
    noBackground: true,
    backgroundColor: '#aa11cc',
    backgroundImageUrl: 'https://images.test/bin.png',
    backgroundImageLocal: null,
    backgroundImageSource: 'url',
    backgroundImageUrlLocked: true,
    iconColor: '#12ab34',
    textColor: '#f8fafc',
    showIcon: false,
    showName: false,
    showCount: false
  });
});

test('invalid recycle bin appearance falls back without hiding content', () => {
  assert.deepEqual(normalizeRecycleBinStyle({
    backgroundColor: 'purple',
    iconColor: null,
    textColor: '#123'
  }), DEFAULT_RECYCLE_BIN_STYLE);
});

test('an older recycle bin with a custom background keeps that background', () => {
  const legacy = normalizeRecycleBinStyle({ backgroundColor: '#123456' });
  assert.equal(legacy.noBackground, false);
  assert.equal(legacy.backgroundColor, '#123456');
});

test('validates recycle bin background image URLs', () => {
  const invalid = validateRecycleBinStyle({ backgroundImageUrl: 'javascript:alert(1)' });
  assert.equal(invalid.isValid, false);
  assert.equal(invalid.errors.backgroundImageUrl, 'unsupportedProtocol');

  const valid = validateRecycleBinStyle({
    backgroundImageUrl: 'data:image/png;base64,iVBORw0KGgo='
  });
  assert.equal(valid.isValid, true);
});
