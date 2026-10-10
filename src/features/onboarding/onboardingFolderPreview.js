import { DEFAULT_BOOKMARK_STYLE } from '../../domain/bookmarks/bookmarkDefaults.js';
import { DEFAULT_FOLDER_STYLE } from '../../domain/folders/folderDefaults.js';
import { FOLDER_GRID_CAPACITY } from '../../domain/folders/folderGrid.js';
import { subscribeLanguageChange, t } from '../../platform/i18n/i18n.js';
import { createEditIndicatorSvg } from '../../shared/ui/svgIcons.js';
import { createBookmarkElement } from '../bookmarks/bookmarkCard.js';
import { applyFolderContentsAppearance } from '../folders/folderAppearance.js';
import { createFolderVisual } from '../folders/folderVisual.js';

/** A miniature contents surface uses production artwork and no folder controller. */
export function initOnboardingFolderPreview(root, samples) {
  const backdrop = document.createElement('div');
  backdrop.className = 'onboarding-demo-folder-backdrop';
  const panel = document.createElement('div');
  panel.className = 'modal-folder onboarding-demo-folder';
  const folder = { ...DEFAULT_FOLDER_STYLE, noBackground: true };
  applyFolderContentsAppearance(panel, folder);
  panel.innerHTML = `
    <header class="folder-modal-header">
      <span class="folder-modal-heading">
        <strong class="onboarding-demo-folder-title"><span data-i18n="onboarding.demo.media"></span></strong>
        <small class="onboarding-demo-folder-summary"></small>
      </span>
      <button class="folder-modal-glyph" type="button" tabindex="-1"></button>
      <button class="folder-modal-edit-toggle" type="button" tabindex="-1"
        aria-pressed="false" data-i18n="folder.editMode.enable"></button>
    </header>
    <div class="folder-grid-shell">
      <div class="folder-modal-grid onboarding-demo-folder-grid"></div>
    </div>`;
  panel.querySelector('.folder-modal-glyph').append(
    createFolderVisual(folder, [], { compact: true }), createEditIndicatorSvg()
  );
  const grid = panel.querySelector('.folder-modal-grid');
  for (const [index, sample] of samples.entries()) {
    const item = createBookmarkElement({ ...DEFAULT_BOOKMARK_STYLE, name: sample.name, url: '#' },
      { isPreview: true, faviconUrl: sample.icon });
    item.classList.add('folder-grid-bookmark', 'onboarding-demo-folder-item');
    item.style.gridColumn = String(index + 1);
    item.style.gridRow = '1';
    const actions = document.createElement('span');
    actions.className = 'folder-bookmark-actions';
    for (const [type, text] of [['edit', '✎'], ['delete', '🗑'], ['remove', '↗']]) {
      const button = document.createElement('button');
      button.className = `item-action-button ${type} is-dark folder-item-${type}`;
      button.type = 'button';
      button.tabIndex = -1;
      button.textContent = text;
      actions.append(button);
    }
    item.append(actions);
    grid.append(item);
  }
  root.append(backdrop, panel);
  const updateSummary = () => {
    panel.querySelector('.onboarding-demo-folder-summary').textContent = t('folder.summary', {
      count: samples.length, capacity: FOLDER_GRID_CAPACITY
    });
  };
  updateSummary();
  subscribeLanguageChange(updateSummary);
}
