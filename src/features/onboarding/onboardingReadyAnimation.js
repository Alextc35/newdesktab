import { createClickAnimation, measureOnboardingGrid, measurePreviewRect, measureSettledLauncherRect, pointerFrame } from './onboardingTimeline.js';

const DURATION = 13200;
const TIMES = { edit: 1200, drag: 2600, drop: 3900, deleted: 4100, exit: 4900,
  undo: 6200, restored: 6600, search: 7800, typing: 8750, close: 11400, closed: 12000, reset: 12100 };
const QUERY = 'youtube';
const EASING = 'cubic-bezier(.4, 0, .2, 1)';

/** Illustrates deletion, Undo and live search without calling application actions. */
export function createOnboardingReadyAnimation(root) {
  const edit = root.querySelector('.launcher-edit');
  const item = root.querySelector('.onboarding-demo-video');
  const trash = root.querySelector('.onboarding-demo-trash');
  const undo = root.querySelector('.onboarding-demo-undo');
  const redo = root.querySelector('.onboarding-demo-redo');
  const loupe = root.querySelector('.onboarding-demo-loupe');
  const cursor = root.querySelector('.onboarding-demo-cursor');
  const panel = root.querySelector('.onboarding-demo-search');
  const backdrop = root.querySelector('.onboarding-demo-search-backdrop');
  const input = panel.querySelector('input');
  const results = [...panel.querySelectorAll('.search-result')];
  let phase = '';

  function setPhase(progress) {
    const elapsed = progress * DURATION;
    const editing = elapsed >= TIMES.edit && elapsed < TIMES.exit;
    const dragging = elapsed >= TIMES.drag && elapsed < TIMES.deleted;
    const overTrash = elapsed >= 3300 && elapsed < TIMES.deleted;
    const deleted = elapsed >= TIMES.deleted && elapsed < TIMES.undo;
    const restored = elapsed >= TIMES.undo && elapsed < TIMES.reset;
    const searching = elapsed >= TIMES.search && elapsed < TIMES.closed;
    const query = searching && elapsed >= TIMES.typing
      ? QUERY.slice(0, Math.min(QUERY.length, Math.floor((elapsed - TIMES.typing) / 140) + 1)) : '';
    const next = `${editing}:${dragging}:${overTrash}:${deleted}:${restored}:${searching}:${query}`;
    if (phase === next) return;
    phase = next;
    root.classList.toggle('is-demo-editing', editing);
    root.classList.toggle('is-demo-searching', searching);
    edit.classList.toggle('is-editing', editing);
    edit.setAttribute('aria-pressed', String(editing));
    item.classList.toggle('is-demo-trash-dragging', dragging);
    trash.classList.toggle('is-demo-trash-target', overTrash);
    undo.disabled = !deleted;
    redo.disabled = !restored;
    loupe.classList.toggle('is-demo-search-active', searching);
    input.value = query;
    for (const result of results) result.hidden = !result.dataset.searchName.includes(query);
  }

  function start() {
    measureOnboardingGrid(root);
    const center = element => {
      const bounds = measurePreviewRect(root, element);
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    };
    const editRect = measureSettledLauncherRect(root, edit);
    const pencil = { x: editRect.x + editRect.width / 2, y: editRect.y + editRect.height / 2 };
    const grab = center(item);
    const bin = center(trash);
    const back = center(undo);
    const search = center(loupe);
    // The cursor enters after opening; measure the panel at its settled scale.
    panel.style.transform = 'translateY(-50%)';
    const field = center(input);
    const close = center(panel.querySelector('button'));
    panel.style.removeProperty('transform');
    const rest = { x: root.clientWidth * .8, y: root.clientHeight * .78 };
    const dismissed = { x: field.x + 12, y: field.y + 12 };
    const closing = { x: close.x - 8, y: close.y + 6 };
    const pointer = (position, time, opacity = 1) => pointerFrame(position, time / DURATION, opacity);
    const movement = cursor.animate([
      pointer(rest, 0, 0), pointer(rest, 400),
      pointer(pencil, 1050), pointer(pencil, 1450),
      pointer(grab, 2350), pointer(grab, TIMES.drag), pointer(grab, 2700),
      pointer(bin, TIMES.drop), pointer(bin, 4250),
      pointer(pencil, 4700), pointer(pencil, TIMES.exit),
      pointer(back, 5950), pointer(back, 6550),
      pointer(search, 7450), pointer(search, TIMES.search),
      pointer(field, 8350), pointer(field, 8650),
      pointer(dismissed, TIMES.typing, 0), pointer(dismissed, 10700, 0),
      pointer(close, 10750, 0), pointer(close, 11100), pointer(close, TIMES.close),
      pointer(closing, 11700, 0), pointer(rest, TIMES.reset, 0), pointer(rest, DURATION, 0)
    ], { duration: DURATION, iterations: Infinity });
    movement.id = 'onboarding-ready-cursor';
    const itemFrame = (time, inTrash = false, opacity = 1, scale = 1) => ({
      offset: time / DURATION, opacity, easing: EASING,
      transform: `translate(${inTrash ? bin.x - grab.x : 0}px, ${inTrash ? bin.y - grab.y : 0}px) scale(${scale})`
    });
    const geometry = item.animate([
      itemFrame(0), itemFrame(TIMES.drag), itemFrame(2700, false, 1, .96),
      itemFrame(TIMES.drop, true, .9, .65), itemFrame(TIMES.deleted, true, 0, .2),
      itemFrame(TIMES.undo, true, 0, .2), itemFrame(6250, false, 0, .94),
      itemFrame(TIMES.restored), itemFrame(DURATION)
    ], { duration: DURATION, iterations: Infinity });
    geometry.id = 'onboarding-ready-item';
    const panelFrame = (time, opacity, scale) => ({ offset: time / DURATION, opacity, easing: EASING,
      transform: `translateY(-50%) scale(${scale})` });
    const opening = panel.animate([
      panelFrame(0, 0, .98), panelFrame(TIMES.search, 0, .98), panelFrame(8150, 1, 1),
      panelFrame(TIMES.close, 1, 1), panelFrame(TIMES.closed, 0, .985), panelFrame(DURATION, 0, .985)
    ], { duration: DURATION, iterations: Infinity });
    opening.id = 'onboarding-ready-search';
    // Fade the modal and its veil on the same clock; keep the restored desktop visible.
    const veil = backdrop.animate([
      { offset: 0, opacity: 0 }, { offset: TIMES.search / DURATION, opacity: 0, easing: EASING },
      { offset: 8150 / DURATION, opacity: 1 },
      { offset: TIMES.close / DURATION, opacity: 1, easing: EASING },
      { offset: TIMES.closed / DURATION, opacity: 0 }, { offset: 1, opacity: 0 }
    ], { duration: DURATION, iterations: Infinity });
    veil.id = 'onboarding-ready-backdrop';
    const clicks = createClickAnimation(root.querySelector('.onboarding-demo-click'), [
      { position: pencil, offset: TIMES.edit / DURATION }, { position: grab, offset: TIMES.drag / DURATION },
      { position: pencil, offset: TIMES.exit / DURATION }, { position: back, offset: TIMES.undo / DURATION },
      { position: search, offset: TIMES.search / DURATION }, { position: field, offset: 8600 / DURATION },
      { position: close, offset: TIMES.close / DURATION }
    ], DURATION);
    clicks.id = 'onboarding-ready-click';
    return { animations: [movement, geometry, opening, veil, clicks], duration: DURATION, setPhase };
  }

  return {
    start,
    reset() {
      setPhase(0);
      panel.classList.remove('is-demo-ready-static');
    },
    showStatic() {
      setPhase(10000 / DURATION);
      panel.classList.add('is-demo-ready-static');
    }
  };
}
