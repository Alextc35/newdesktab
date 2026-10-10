import { FOLDER_GRID_COLUMNS, FOLDER_GRID_ROWS } from '../../domain/folders/folderGrid.js';
import { t } from '../../platform/i18n/i18n.js';
import { createClickAnimation, measurePreviewRect, pointerFrame } from './onboardingTimeline.js';

const DURATION = 8800;
const TIMES = { open: 1200, edit: 2600, drag: 3500, moved: 4700, exit: 5400, close: 7400 };
const EASING = 'cubic-bezier(.4, 0, .2, 1)';

/** Demonstrates folder-local editing without opening a real modal or changing data. */
export function createOnboardingFolderAnimation(root) {
  const folder = root.querySelector('.onboarding-demo-media');
  const panel = root.querySelector('.onboarding-demo-folder');
  const edit = panel.querySelector('.folder-modal-edit-toggle');
  const item = panel.querySelector('.onboarding-demo-folder-item');
  const grid = panel.querySelector('.folder-modal-grid');
  const cursor = root.querySelector('.onboarding-demo-cursor');
  let phase = '';

  function setPhase(progress) {
    const elapsed = progress * DURATION;
    const open = elapsed >= TIMES.open && elapsed < TIMES.close;
    const editing = elapsed >= TIMES.edit && elapsed < TIMES.exit;
    const dragging = elapsed >= TIMES.drag && elapsed < TIMES.moved;
    const selected = elapsed >= 950 && elapsed < 1500;
    const next = `${open}:${editing}:${dragging}:${selected}`;
    if (phase === next) return;
    phase = next;
    root.classList.toggle('is-demo-folder-open', open);
    folder.classList.toggle('is-demo-folder-selected', selected);
    panel.classList.toggle('is-folder-editing', editing);
    item.classList.toggle('is-folder-grid-dragging', dragging);
    edit.setAttribute('aria-pressed', String(editing));
    edit.dataset.i18n = editing ? 'folder.editMode.disable' : 'folder.editMode.enable';
    edit.textContent = t(edit.dataset.i18n);
  }

  function measureTargets() {
    const center = element => {
      const bounds = measurePreviewRect(root, element);
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    };
    const enable = center(edit);
    // The real pill expands for "Finish editing"; measure both localized labels.
    edit.textContent = t('folder.editMode.disable');
    const disable = center(edit);
    edit.textContent = t('folder.editMode.enable');
    const cells = measurePreviewRect(root, grid);
    return { open: center(folder), grab: center(item), enable, disable,
      cellX: (cells.width - 2) / FOLDER_GRID_COLUMNS, cellY: (cells.height - 2) / FOLDER_GRID_ROWS };
  }

  function start() {
    const targets = measureTargets();
    const rest = { x: root.clientWidth * .8, y: root.clientHeight * .76 };
    const moved = { x: targets.grab.x + targets.cellX, y: targets.grab.y + targets.cellY };
    const dismissed = { x: targets.disable.x - 12, y: targets.disable.y + 12 };
    const pointer = (position, time, opacity = 1) => pointerFrame(position, time / DURATION, opacity);
    const movement = cursor.animate([
      pointer(rest, 0, 0), pointer(rest, 400),
      pointer(targets.open, 1050), pointer(targets.open, 1400),
      pointer(targets.enable, 2350), pointer(targets.enable, 2800),
      pointer(targets.grab, 3250), pointer(targets.grab, TIMES.drag), pointer(targets.grab, 3600),
      pointer(moved, TIMES.moved), pointer(moved, 4900),
      pointer(targets.disable, 5200), pointer(targets.disable, TIMES.exit),
      pointer(dismissed, 5800, 0), pointer(dismissed, TIMES.close, 0),
      pointer(rest, 8000, 0), pointer(rest, DURATION, 0)
    ], { duration: DURATION, iterations: Infinity });
    movement.id = 'onboarding-folder-cursor';
    const itemFrame = (time, moved = false, scale = 1) => ({ offset: time / DURATION, easing: EASING,
      transform: `translate(${moved ? targets.cellX : 0}px, ${moved ? targets.cellY : 0}px) scale(${scale})` });
    const geometry = item.animate([
      itemFrame(0), itemFrame(TIMES.drag), itemFrame(3600, false, .96),
      itemFrame(TIMES.moved, true, .96), itemFrame(4900, true),
      itemFrame(7800, true), itemFrame(8000), itemFrame(DURATION)
    ], { duration: DURATION, iterations: Infinity });
    geometry.id = 'onboarding-folder-item';
    const panelFrame = (time, opacity, scale) => ({ offset: time / DURATION, opacity, easing: EASING,
      transform: `translateY(-50%) scale(${scale})` });
    const opening = panel.animate([
      panelFrame(0, 0, .96), panelFrame(TIMES.open, 0, .96), panelFrame(1550, 1, 1),
      panelFrame(TIMES.close, 1, 1), panelFrame(7800, 0, .96), panelFrame(DURATION, 0, .96)
    ], { duration: DURATION, iterations: Infinity });
    opening.id = 'onboarding-folder-panel';
    const clicks = createClickAnimation(root.querySelector('.onboarding-demo-click'), [
      { position: targets.open, offset: TIMES.open / DURATION },
      { position: targets.enable, offset: TIMES.edit / DURATION },
      { position: targets.grab, offset: TIMES.drag / DURATION },
      { position: targets.disable, offset: TIMES.exit / DURATION }
    ], DURATION);
    clicks.id = 'onboarding-folder-click';
    return { animations: [movement, geometry, opening, clicks], duration: DURATION, setPhase };
  }

  return {
    start,
    reset() {
      setPhase(0);
      panel.classList.remove('is-demo-folder-static');
    },
    showStatic() {
      setPhase(1800 / DURATION);
      panel.classList.add('is-demo-folder-static');
    }
  };
}
