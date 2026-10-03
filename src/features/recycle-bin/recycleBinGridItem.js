import { t } from '../../platform/i18n/i18n.js';
import { createItemActionButton } from '../../shared/ui/itemActionButton.js';
import { isGridKeyboardActive } from '../grid/gridKeyboardController.js';
import { applyGridItemPosition } from '../grid/gridItemLayout.js';
import { addGridItemPointerControls } from '../grid/gridPointerController.js';
import { isGridItemSurfaceDark } from '../grid/gridItemAppearance.js';
import { openRecycleBinEditor } from './recycleBinEditorModal.js';
import { openRecycleBinModal } from './recycleBinModal.js';
import { applyRecycleBinAppearance, createRecycleBinGlyph } from './recycleBinAppearance.js';
import { getActiveWorkspaceId } from '../workspaces/workspaceSelectors.js';

export const recycleBinGridItem = Object.freeze({
  type: 'recycle-bin',
  order: { grid: 30, list: 10 },
  selector: '.recycle-bin[data-recycle-bin-id], .recycle-bin-list-item[data-recycle-bin-id]',
  getElementId: element => element.dataset.recycleBinId,
  select(state) {
    const { settings } = state.data;
    if (!settings.showRecycleBin || getActiveWorkspaceId(state.data) !== null) return [];
    return [{ item: state.data.recycleBin, trash: state.data.trash }];
  },
  render({ view, container, item, trash, state }) {
    if (view === 'list') {
      return createRecycleBinListItem({
        recycleBin: item,
        count: trash.length,
        active: isGridKeyboardActive(item.id),
        onOpen: openRecycleBinModal
      });
    }
    return createRecycleBinElement({
      container,
      recycleBin: item,
      trash,
      isEditing: state.ui.isEditing
    });
  },
  enableEditing: enableRecycleBinEditing,
  open: () => openRecycleBinModal(),
  edit: () => openRecycleBinEditor()
});

export function createRecycleBinElement({ container, recycleBin, trash, isEditing }) {
  const element = document.createElement('div');
  element.className = 'recycle-bin';
  element.dataset.recycleBinId = recycleBin.id;
  element.classList.toggle('is-editing', isEditing);
  element.classList.toggle('is-keyboard-active', isGridKeyboardActive(recycleBin.id));
  applyRecycleBinAppearance(element, recycleBin);
  applyGridItemPosition(container, element, recycleBin);

  const button = document.createElement('button');
  button.className = 'recycle-bin-open';
  button.type = 'button';
  button.title = t('recycleBin.open');
  button.setAttribute('aria-label', t('recycleBin.openCount', { count: trash.length }));

  const caption = document.createElement('span');
  caption.className = 'recycle-bin-caption';
  const title = document.createElement('strong');
  title.textContent = t('recycleBin.title');
  const count = document.createElement('small');
  count.textContent = t(
    trash.length === 1 ? 'recycleBin.countOne' : 'recycleBin.count',
    { count: trash.length }
  );
  caption.append(title, count);

  const dropFeedback = document.createElement('span');
  dropFeedback.className = 'recycle-bin-drop-feedback';
  dropFeedback.textContent = t('recycleBin.dropHint');

  button.append(createRecycleBinGlyph(), caption, dropFeedback);
  button.addEventListener('click', event => {
    if (element.classList.contains('is-editing') || element.dataset.suppressOpen === 'true') {
      event.preventDefault();
      return;
    }
    openRecycleBinModal();
  });
  element.append(button);

  if (isEditing) enableRecycleBinEditing(container, element, recycleBin);
  return element;
}

export function enableRecycleBinEditing(container, element, recycleBin) {
  if (element.dataset.editingControlsAttached === 'true') return;
  element.dataset.editingControlsAttached = 'true';
  element.classList.add('is-editing');
  addRecycleBinActions(element, recycleBin);
  addGridItemPointerControls(container, element, recycleBin, { kind: 'recycle-bin' });
}

function createRecycleBinListItem({ recycleBin, count, active, onOpen }) {
  const row = document.createElement('li');
  row.className = 'bookmark bookmark-list-item recycle-bin-list-item';
  row.dataset.recycleBinId = recycleBin.id;
  row.dataset.listSearchStatic = 'true';
  row.classList.toggle('is-keyboard-active', active);
  applyRecycleBinAppearance(row, recycleBin);

  const link = document.createElement('button');
  link.className = 'bookmark-list-link recycle-bin-list-link';
  link.type = 'button';
  link.title = t('recycleBin.open');
  link.setAttribute('aria-label', t('recycleBin.openCount', { count }));
  link.addEventListener('click', onOpen);

  const icon = document.createElement('span');
  icon.className = 'bookmark-list-icon recycle-bin-list-icon';
  icon.setAttribute('aria-hidden', 'true');
  const glyph = createRecycleBinGlyph();
  glyph.classList.add('bookmark-list-recycle-glyph');
  icon.append(glyph);

  const copy = document.createElement('span');
  copy.className = 'bookmark-list-copy';
  const name = document.createElement('span');
  name.className = 'bookmark-list-name';
  name.textContent = t('recycleBin.title');
  const detail = document.createElement('span');
  detail.className = 'bookmark-list-detail';
  detail.textContent = t(count === 1 ? 'recycleBin.countOne' : 'recycleBin.count', { count });
  copy.append(name, detail);

  const arrow = document.createElement('span');
  arrow.className = 'bookmark-list-arrow';
  arrow.textContent = '›';
  arrow.setAttribute('aria-hidden', 'true');
  link.append(icon, copy, arrow);
  row.append(link);
  return row;
}

function addRecycleBinActions(container, recycleBin) {
  const themeClass = recycleBin.backgroundColor && !recycleBin.noBackground
    ? (isGridItemSurfaceDark(recycleBin) ? 'is-dark' : 'is-light')
    : 'is-dark';
  const actions = document.createElement('div');
  actions.className = 'item-actions recycle-bin-item-actions';
  actions.setAttribute('role', 'group');
  actions.setAttribute('aria-label', t('recycleBin.editor.actions'));

  const editButton = createItemActionButton('✎', 'edit', themeClass, openRecycleBinEditor);
  editButton.setAttribute('aria-label', t('recycleBin.editor.edit'));
  actions.append(editButton);
  container.append(actions);
}
