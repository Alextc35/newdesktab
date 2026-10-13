import { t } from '../../platform/i18n/i18n.js';
import { createCatalogIcon } from './catalogIcon.js';

/** Keep editor artwork separate from its translated, accessible heading. */
export function setEditorTitle(heading, key, { creating = false } = {}) {
  let line = heading.closest('.editor-title-line');
  if (!line) {
    line = document.createElement('div');
    line.className = 'editor-title-line';
    heading.before(line);
    line.append(heading);
  }
  line.querySelector('.editor-title-icon')?.remove();
  const icon = createCatalogIcon(creating ? 'plus' : 'ui-editing');
  icon.classList.add('editor-title-icon');
  line.prepend(icon);
  heading.dataset.i18n = key;
  heading.textContent = t(key);
}
