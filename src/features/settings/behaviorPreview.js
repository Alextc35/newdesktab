import { DEFAULT_BOOKMARK_STYLE } from '../../domain/bookmarks/bookmarkDefaults.js';
import { calculateResizeGeometry } from '../../shared/grid/resizeGeometry.js';
import { createBookmarkElement } from '../bookmarks/bookmarkCard.js';
import { createClickAnimation, measurePreviewRect, pointerFrame } from '../onboarding/onboardingTimeline.js';

const DURATION = 6800;
const EASING = 'cubic-bezier(.4, 0, .2, 1)';

/** An inert illustration: its cursor never dispatches input or changes the grid. */
export function createBehaviorPreview(root, kind) {
  const stage = root.querySelector('.behavior-preview-stage');
  const cells = [...stage.querySelectorAll('.behavior-preview-cell')];
  const tiles = [...stage.querySelectorAll('.behavior-preview-tile')].map(placeholder => {
    const tile = createBookmarkElement({
      ...DEFAULT_BOOKMARK_STYLE,
      name: placeholder.textContent.trim() || 'A',
      url: '#', backgroundFavicon: false, showFavicon: false
    }, { isPreview: true });
    tile.classList.add(...placeholder.classList);
    tile.append(...placeholder.children);
    placeholder.replaceWith(tile);
    return tile;
  });
  const cursor = stage.querySelector('.behavior-preview-pointer');
  const click = stage.querySelector('.behavior-preview-click');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const events = new AbortController();
  let animations = [];
  let mode = root.dataset.mode;
  let visible = false;
  let layout = '';

  function stop() {
    animations.forEach(animation => animation.cancel());
    animations = [];
    layout = '';
    root.removeAttribute('data-static');
  }

  function animate(element, frames, name) {
    const animation = element.animate(frames, { duration: DURATION, iterations: Infinity });
    animation.id = `behavior-${kind}-${name}`;
    animations.push(animation);
  }

  // Fade out the result before restoring the initial positions for the next loop.
  function geometry(element, frames) {
    const initial = frames[0];
    const result = frames.at(-1);
    animate(element, [
      ...frames,
      { ...result, offset: .84 }, { ...result, offset: .9, opacity: 0 },
      { ...initial, offset: .92, opacity: 0 }, { ...initial, offset: .98 },
      { ...initial, offset: 1 }
    ], element.classList.contains('preview-tile-a') ? 'a' :
      element.classList.contains('preview-tile-b') ? 'b' :
      element.classList.contains('preview-tile-c') ? 'c' : 'size');
  }

  function highlight(element, start, end, invalid = false) {
    const idle = element.classList.contains('bookmark')
      ? {
        borderColor: 'color-mix(in srgb, var(--ui-accent) 65%, var(--ui-border))',
        backgroundColor: element.classList.contains('preview-tile-a')
          ? 'color-mix(in srgb, var(--ui-accent) 22%, var(--ui-card))' : 'var(--ui-selected)'
      }
      : { borderColor: 'var(--ui-border)', backgroundColor: 'var(--ui-card)' };
    const active = invalid
      ? { borderColor: 'var(--ui-danger-text)', backgroundColor: 'var(--ui-danger-bg)' }
      : { borderColor: 'var(--ui-accent)', backgroundColor: 'var(--ui-selected)' };
    animate(element, [
      { ...idle, offset: 0 }, { ...idle, offset: start - .025 },
      { ...active, offset: start }, { ...active, offset: end },
      { ...idle, offset: end + .04 }, { ...idle, offset: 1 }
    ], `target-${cells.indexOf(element)}`);
  }

  function pointer(points, grab, release, resizing = false) {
    const rest = { x: stage.clientWidth * .83, y: stage.clientHeight * .76 };
    animate(cursor, [
      pointerFrame(rest, 0, 0), pointerFrame(rest, .06, 0),
      ...points.map(([offset, position]) => ({
        ...pointerFrame(position, offset),
        ...(resizing && offset >= .2 && offset < .6 ? { easing: 'linear' } : {})
      })),
      pointerFrame({ x: release.x + 9, y: release.y + 8 }, .74, 0),
      pointerFrame(rest, 1, 0)
    ], 'cursor');
    const feedback = createClickAnimation(click, [
      { position: grab, offset: .2 }, { position: release, offset: .64 }
    ], DURATION);
    feedback.id = `behavior-${kind}-click`;
    animations.push(feedback);
  }

  function drag(dx, dy) {
    const [a, c, b] = tiles;
    const bounds = measurePreviewRect(stage, a);
    const grab = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const position = (x, y = 0) => ({ x: grab.x + x * dx, y: grab.y + y * dy });
    const frame = (offset, x = 0, y = 0, lifted = false) => ({
      offset, opacity: 1, easing: EASING,
      transform: `translate(${x * dx}px, ${y * dy}px) scale(${lifted ? 1.045 : 1})`,
      boxShadow: lifted ? '0 6px 12px var(--ui-control-shadow)' : '0 2px 5px var(--ui-control-shadow)'
    });
    const start = [frame(0), frame(.2), frame(.23, 0, 0, true)];
    let path;
    let release;
    if (mode === 'none') {
      release = position(0, 1);
      path = [[.34, position(1)], [.4, position(1)], [.48, grab], [.6, release]];
      geometry(a, [...start, frame(.34, 1, 0, true), frame(.4, 1, 0, true),
        frame(.48, 0, 0, true), frame(.6, 0, 1, true), frame(.64, 0, 1)]);
      highlight(cells[1], .32, .41, true);
      highlight(a, .32, .41, true);
      highlight(cells[4], .52, .8);
    } else if (mode === 'relocate') {
      release = position(2);
      path = [[.3, position(0, 1)], [.45, position(2, 1)], [.6, release]];
      geometry(a, [...start, frame(.3, 0, 1, true), frame(.45, 2, 1, true),
        frame(.6, 2, 0, true), frame(.64, 2)]);
      geometry(b, [frame(0), frame(.45), frame(.5, 0, 1), frame(.56, -2, 1), frame(.62, -2)]);
      highlight(cells[2], .45, .8);
      highlight(cells[0], .5, .8);
    } else {
      release = position(2);
      path = [[.38, position(1)], [.44, position(1)], [.6, release]];
      geometry(a, [...start, frame(.38, 1, 0, true), frame(.44, 1, 0, true),
        frame(.6, 2, 0, true), frame(.64, 2)]);
      geometry(c, [frame(0), frame(.27), frame(.38, -1)]);
      geometry(b, [frame(0), frame(.48), frame(.6, -1)]);
      highlight(cells[1], .28, .44);
      highlight(cells[2], .48, .8);
    }
    pointer([[.16, grab], [.23, grab], ...path, [.68, release]], grab, release);
  }

  function resize(dx, dy) {
    const tile = tiles[0];
    const bounds = measurePreviewRect(stage, tile);
    const grab = { x: bounds.x + bounds.width, y: bounds.y + bounds.height };
    const target = measurePreviewRect(stage, cells[mode === 'none' ? 5 : 6]);
    const growth = {
      x: (target.x + target.width - grab.x) / dx,
      y: (target.y + target.height - grab.y) / dy
    };
    const release = { x: grab.x + dx * growth.x, y: grab.y + dy * growth.y };
    const pointerPoints = [[.16, grab], [.2, grab], [.6, release], [.68, release]];
    const frame = (offset, x = 0, y = 0, easing = EASING) => ({
      offset, opacity: 1, easing,
      width: `${bounds.width + dx * x}px`, height: `${bounds.height + dy * y}px`
    });
    if (mode === 'smooth') {
      // Reach the measured grid corner during the drag and hold it after release.
      geometry(tile, [frame(0), frame(.2, 0, 0, 'linear'),
        frame(.6, growth.x, growth.y), frame(.69, growth.x, growth.y)]);
    } else {
      // The diagonal crosses both half-cell thresholds together: 1×1 becomes 2×2.
      const snapOffset = .2 + (.6 - .2) * Math.max(.5 / growth.x, .5 / growth.y);
      const { grid } = calculateResizeGeometry({
        direction: 'bottom-right', start: { gx: 0, gy: 0, w: 1, h: 1 },
        deltaX: (.5 + 1e-7) * dx, deltaY: (.5 + 1e-7) * dy,
        cellWidth: dx, cellHeight: dy, columns: 4, rows: 2
      });
      geometry(tile, [frame(0), frame(.2, 0, 0, 'steps(1, end)'),
        frame(snapOffset, grid.w - 1, grid.h - 1), frame(.69, grid.w - 1, grid.h - 1)]);
    }
    pointer(pointerPoints, grab, release, true);
    animate(tile.querySelector('.preview-resize-handle'), [
      { offset: 0, backgroundColor: 'var(--ui-accent)', transform: 'scale(1)' },
      { offset: .16, backgroundColor: 'var(--ui-accent)', transform: 'scale(1)' },
      { offset: .2, backgroundColor: 'var(--ui-on-accent)', transform: 'scale(1.25)' },
      { offset: .64, backgroundColor: 'var(--ui-on-accent)', transform: 'scale(1.25)' },
      { offset: .69, backgroundColor: 'var(--ui-accent)', transform: 'scale(1)' },
      { offset: 1, backgroundColor: 'var(--ui-accent)', transform: 'scale(1)' }
    ], 'handle');
  }

  function sync() {
    const active = visible && !document.hidden && stage.clientWidth
      && !root.parentElement.closest('[hidden], .is-hidden, [inert]');
    const next = active ? `${mode}:${stage.clientWidth}:${stage.clientHeight}:${reducedMotion.matches}` : '';
    if (next === layout) return;
    stop();
    if (!active) return;
    const first = measurePreviewRect(stage, cells[0]);
    const second = measurePreviewRect(stage, cells[1]);
    const below = measurePreviewRect(stage, cells[4]);
    const dx = second.x - first.x;
    const dy = below.y - first.y;
    stage.style.setProperty('--preview-cell-x', `${dx}px`);
    stage.style.setProperty('--preview-cell-y', `${dy}px`);
    if (reducedMotion.matches) {
      root.dataset.static = 'true';
    } else {
      if (kind === 'drag') drag(dx, dy);
      else resize(dx, dy);
      const startTime = document.timeline.currentTime;
      animations.forEach(animation => { animation.startTime = startTime; });
    }
    layout = next;
  }

  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  });
  intersection.observe(stage);
  const size = new ResizeObserver(sync);
  size.observe(stage);
  const visibility = new MutationObserver(sync);
  for (let ancestor = root.parentElement; ancestor; ancestor = ancestor.parentElement) {
    visibility.observe(ancestor, { attributes: true, attributeFilter: ['hidden', 'class', 'inert'] });
  }
  reducedMotion.addEventListener('change', sync, { signal: events.signal });
  document.addEventListener('visibilitychange', sync, { signal: events.signal });

  return {
    setMode(next) {
      mode = next;
      root.dataset.mode = next;
      sync();
    },
    destroy() {
      stop();
      events.abort();
      intersection.disconnect();
      size.disconnect();
      visibility.disconnect();
    }
  };
}
