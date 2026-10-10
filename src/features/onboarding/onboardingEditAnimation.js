import { createClickAnimation, measureOnboardingGrid, measurePreviewRect, measureSettledLauncherRect, pointerFrame } from './onboardingTimeline.js';

const RESULT_HOLD = 2000;
const TIMES = {
  edit: 1872,
  select: 3328,
  drag: 3536,
  moved: 5096,
  resize: 6552,
  resized: 7696,
  exit: 8850
};
const RESULT_FADE = TIMES.exit + RESULT_HOLD;
const FADE_END = RESULT_FADE + 600;
const RESET = FADE_END + 100;
const RESTORED = RESET + 500;
const DURATION = RESTORED + 350;
const EASING = 'cubic-bezier(.4, 0, .2, 1)';

/** Illustrates edit, drag and resize using only the isolated example bookmark. */
export function createOnboardingEditAnimation(root) {
  const edit = root.querySelector('.launcher-edit');
  const gmail = root.querySelector('.onboarding-demo-favorite');
  const handle = gmail.querySelector('.resizer.bottom-right');
  const indicator = gmail.querySelector('.resize-indicator');
  const cursor = root.querySelector('.onboarding-demo-cursor');
  let phase = '';

  function setPhase(progress) {
    const elapsed = progress * DURATION;
    const editing = elapsed >= TIMES.edit && elapsed < TIMES.exit;
    const selected = elapsed >= TIMES.select && elapsed < TIMES.exit;
    const dragging = elapsed >= TIMES.drag && elapsed < TIMES.moved;
    const resizing = elapsed >= TIMES.resize && elapsed < TIMES.resized;
    const resizeCursor = elapsed >= 6240 && elapsed < TIMES.resized;
    const size = elapsed >= 7124 ? '2 × 1' : '1 × 1';
    const next = `${editing}:${selected}:${dragging}:${resizing}:${resizeCursor}:${size}`;
    if (phase === next) return;
    phase = next;
    root.classList.toggle('is-demo-editing', editing);
    edit.classList.toggle('is-editing', editing);
    edit.setAttribute('aria-pressed', String(editing));
    gmail.classList.toggle('is-demo-selected', selected);
    gmail.classList.toggle('is-demo-dragging', dragging);
    gmail.classList.toggle('is-demo-resizing', resizing);
    handle.classList.toggle('is-active', resizeCursor);
    cursor.classList.toggle('is-demo-resize', resizeCursor);
    indicator.textContent = size;
  }

  function measureLayout() {
    const initial = measurePreviewRect(root, gmail);
    return { initial, ...measureOnboardingGrid(root) };
  }

  function start() {
    const { initial, cellX, cellY } = measureLayout();
    const editRect = measureSettledLauncherRect(root, edit);
    const pencil = { x: editRect.x + editRect.width / 2, y: editRect.y + editRect.height / 2 };
    const rest = { x: root.clientWidth * .78, y: root.clientHeight * .76 };
    const grab = { x: initial.x + initial.width / 2, y: initial.y + initial.height / 2 };
    const moved = { x: grab.x + cellX, y: grab.y + cellY };
    const corner = { x: initial.x + initial.width + cellX, y: initial.y + initial.height + cellY };
    const enlarged = { x: corner.x + cellX, y: corner.y };
    const released = { x: enlarged.x - 12, y: enlarged.y + 12 };
    const dismissed = { x: pencil.x + 12, y: pencil.y + 12 };
    const pointer = (position, time, opacity = 1) => pointerFrame(position, time / DURATION, opacity);
    const movement = cursor.animate([
      pointer(rest, 0, 0), pointer(rest, 520),
      pointer(pencil, 1456), pointer(pencil, 2288),
      pointer(grab, 3224), pointer(grab, TIMES.drag),
      pointer(moved, TIMES.moved), pointer(moved, 5616),
      pointer(corner, 6240), pointer(corner, TIMES.resize),
      pointer(enlarged, TIMES.resized), pointer(released, 7950),
      pointer(pencil, 8650), pointer(pencil, TIMES.exit),
      pointer(dismissed, 9110, 0), pointer(dismissed, RESULT_FADE, 0),
      pointer(rest, RESET, 0), pointer(rest, DURATION, 0)
    ], { duration: DURATION, iterations: Infinity });
    movement.id = 'onboarding-edit-cursor';
    const bookmarkFrame = (time, moved = false, resized = false, opacity = 1) => ({
      offset: time / DURATION, opacity, easing: EASING,
      transform: `translate(${moved ? cellX : 0}px, ${moved ? cellY : 0}px)`,
      width: `${initial.width + (resized ? cellX : 0)}px`
    });
    const geometry = gmail.animate([
      bookmarkFrame(0), bookmarkFrame(TIMES.drag), bookmarkFrame(TIMES.moved, true),
      bookmarkFrame(TIMES.resize, true), bookmarkFrame(TIMES.resized, true, true),
      bookmarkFrame(RESULT_FADE, true, true), bookmarkFrame(FADE_END, true, true, 0),
      bookmarkFrame(RESET, false, false, 0), bookmarkFrame(RESTORED), bookmarkFrame(DURATION)
    ], { duration: DURATION, iterations: Infinity });
    geometry.id = 'onboarding-edit-bookmark';
    const clicks = createClickAnimation(root.querySelector('.onboarding-demo-click'), [
      { position: pencil, offset: TIMES.edit / DURATION }, { position: grab, offset: TIMES.drag / DURATION },
      { position: corner, offset: TIMES.resize / DURATION }, { position: pencil, offset: TIMES.exit / DURATION }
    ], DURATION);
    clicks.id = 'onboarding-edit-click';
    return { animations: [movement, geometry, clicks], duration: DURATION, setPhase };
  }

  return {
    start,
    reset: () => setPhase(0),
    showStatic() {
      measureLayout();
      setPhase(5616 / DURATION);
    }
  };
}
