const INTERACTIVE_CONTROL_SELECTOR = [
  'a',
  'button',
  'input',
  'label',
  'option',
  'select',
  'textarea',
  '[contenteditable="true"]'
].join(', ');

/**
 * Makes a fixed toolbar freely draggable while keeping it inside a boundary.
 * Interactive controls remain clickable and never start a drag.
 *
 * @param {HTMLElement} toolbar
 * @param {HTMLElement} boundary
 * @returns {{ resetPosition: () => void }}
 */
export function makeToolbarDraggable(toolbar, boundary) {
  let drag = null;

  const setPosition = (left, top) => {
    const toolbarRect = toolbar.getBoundingClientRect();
    const boundaryRect = boundary.getBoundingClientRect();
    const maxLeft = Math.max(boundaryRect.left, boundaryRect.right - toolbarRect.width);
    const maxTop = Math.max(boundaryRect.top, boundaryRect.bottom - toolbarRect.height);

    toolbar.style.left = `${clamp(left, boundaryRect.left, maxLeft)}px`;
    toolbar.style.top = `${clamp(top, boundaryRect.top, maxTop)}px`;
  };

  const finishDrag = () => {
    if (!drag) return;
    drag = null;
    toolbar.classList.remove('is-dragging');
  };

  const resetPosition = () => {
    finishDrag();
    toolbar.classList.remove('has-drag-position');
    toolbar.style.removeProperty('left');
    toolbar.style.removeProperty('top');
    toolbar.style.removeProperty('bottom');
    toolbar.style.removeProperty('transform');
  };

  toolbar.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest?.(INTERACTIVE_CONTROL_SELECTOR)) return;

    const toolbarRect = toolbar.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: toolbarRect.left,
      startTop: toolbarRect.top
    };

    toolbar.classList.add('has-drag-position', 'is-dragging');
    toolbar.style.left = `${toolbarRect.left}px`;
    toolbar.style.top = `${toolbarRect.top}px`;
    toolbar.style.bottom = 'auto';
    toolbar.style.transform = 'none';
    toolbar.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  toolbar.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    setPosition(
      drag.startLeft + event.clientX - drag.startX,
      drag.startTop + event.clientY - drag.startY
    );
  });

  toolbar.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    finishDrag();
  });
  toolbar.addEventListener('pointercancel', finishDrag);
  toolbar.addEventListener('lostpointercapture', finishDrag);

  window.addEventListener('resize', () => {
    if (!toolbar.classList.contains('has-drag-position')) return;
    const toolbarRect = toolbar.getBoundingClientRect();
    setPosition(toolbarRect.left, toolbarRect.top);
  });

  return { resetPosition };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
