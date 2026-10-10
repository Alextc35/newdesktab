const EASING = 'cubic-bezier(.4, 0, .2, 1)';

/** Preview-local geometry also accounts for the modal's opening scale. */
export function measurePreviewRect(root, element) {
  const bounds = root.getBoundingClientRect();
  const target = element.getBoundingClientRect();
  const scaleX = bounds.width / root.offsetWidth;
  const scaleY = bounds.height / root.offsetHeight;
  return {
    x: (target.left - bounds.left) / scaleX - root.clientLeft,
    y: (target.top - bounds.top) / scaleY - root.clientTop,
    width: target.width / scaleX,
    height: target.height / scaleY
  };
}

/** Measures the launcher after its slide-in without displaying a measurement frame. */
export function measureSettledLauncherRect(root, element) {
  const dock = element.closest('.launcher-dock');
  dock.style.transition = 'none';
  dock.style.transform = 'translate(0, -50%)';
  const bounds = measurePreviewRect(root, element);
  dock.style.removeProperty('transform');
  dock.getBoundingClientRect();
  dock.style.removeProperty('transition');
  return bounds;
}

/** Fits the shared edit-grid pattern to the illustrative desktop's actual cells. */
export function measureOnboardingGrid(root) {
  const first = measurePreviewRect(root, root.querySelector('.onboarding-demo-trash'));
  const second = measurePreviewRect(root, root.querySelector('.onboarding-demo-favorite'));
  const nextRow = measurePreviewRect(root, root.querySelector('.onboarding-demo-video'));
  const cellX = second.x - first.x;
  const cellY = nextRow.y - first.y;
  const overlay = root.querySelector('.onboarding-demo-edit-grid');
  overlay.style.left = `${first.x - (cellX - first.width) / 2}px`;
  overlay.style.top = `${first.y - (cellY - first.height) / 2}px`;
  overlay.style.width = `${cellX * 4}px`;
  overlay.style.height = `${cellY * 3}px`;
  overlay.style.setProperty('--cell-w', `${cellX}px`);
  overlay.style.setProperty('--cell-h', `${cellY}px`);
  return { cellX, cellY };
}

export function pointerFrame(position, offset, opacity = 1) {
  return {
    offset, opacity,
    transform: `translate(${position.x - 2}px, ${position.y - 2}px)`,
    easing: EASING
  };
}

/** Click feedback shares the sequence's clock and never dispatches input events. */
export function createClickAnimation(element, clicks, duration) {
  const pulse = (position, offset, opacity, scale) => ({
    offset, opacity,
    transform: `translate(${position.x - 10}px, ${position.y - 10}px) scale(${scale})`
  });
  const frames = [pulse(clicks[0].position, 0, 0, .2)];
  for (const { position, offset } of clicks) {
    frames.push(pulse(position, offset - .005, 0, .2),
      pulse(position, offset, .8, .3), pulse(position, offset + .05, 0, 1.4));
  }
  frames.push(pulse(clicks.at(-1).position, 1, 0, 1.4));
  return element.animate(frames, { duration, iterations: Infinity });
}
