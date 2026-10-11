import { DEFAULT_BOOKMARK_STYLE } from '../../domain/bookmarks/bookmarkDefaults.js';
import { DEFAULT_FOLDER_STYLE } from '../../domain/folders/folderDefaults.js';
import { createBookmarkElement } from '../bookmarks/bookmarkCard.js';
import { createFolderVisual } from '../folders/folderVisual.js';
import { createRecycleBinGlyph } from '../recycle-bin/recycleBinAppearance.js';
import { measurePreviewRect } from '../onboarding/onboardingTimeline.js';

export const DEMO_WIDTH = 600;
export const DEMO_HEIGHT = 300;
export const DEMO_DURATION = 12000;
export const DEMO_STEP_ENDS = [3500, 7500, 12000];

const MAIL = new URL('../onboarding/assets/mail.svg', import.meta.url).href;
const VIDEO = new URL('../onboarding/assets/video.svg', import.meta.url).href;
const BRAND = new URL('../../../assets/icons/brand-mark.svg', import.meta.url).href;
const EASE = 'cubic-bezier(.4, 0, .2, 1)';

export function demoElement(tag, className, text = '') {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

/** Production artwork in an inert desktop. All coordinates belong to this example. */
export function createManualDemoScene(root, t) {
  const animations = [];
  const painters = [];
  const layoutPainters = [];
  const scene = demoElement('div', 'manual-demo-scene');
  scene.inert = true;
  scene.setAttribute('aria-hidden', 'true');
  root.append(scene);

  function place(node, x, y, width, height) {
    Object.assign(node.style, { left: `${x}px`, top: `${y}px` });
    if (width !== undefined) node.style.width = `${width}px`;
    if (height !== undefined) node.style.height = `${height}px`;
    scene.append(node);
    return node;
  }

  function track(node, frames, name = '') {
    const animation = node.animate(frames.map(([time, values]) => ({
      offset: time / DEMO_DURATION, easing: EASE, ...values
    })), { duration: DEMO_DURATION, fill: 'both' });
    animation.id = `manual-demo-${name || animations.length}`;
    animation.pause();
    animation.currentTime = 0;
    animations.push(animation);
    return animation;
  }

  function show(node, start = 0, end = DEMO_DURATION) {
    const frames = [[0, { opacity: start ? 0 : 1 }]];
    if (start) frames.push([Math.max(0, start - 250), { opacity: 0 }], [start, { opacity: 1 }]);
    frames.push([end, { opacity: 1 }]);
    if (end < DEMO_DURATION) frames.push([Math.min(DEMO_DURATION, end + 250), { opacity: 0 }]);
    frames.push([DEMO_DURATION, { opacity: end === DEMO_DURATION ? 1 : 0 }]);
    track(node, frames);
    return node;
  }

  function move(node, points, linear = false) {
    return track(node, points.map(([time, x, y, scale = 1]) => [time, {
      transform: `translate(${x}px, ${y}px) scale(${scale})`, ...(linear ? { easing: 'linear' } : {})
    }]), node.dataset.demoItem || 'movement');
  }

  function during(node, className, windows) {
    painters.push(time => node.classList.toggle(className, windows.some(([from, to = DEMO_DURATION + 1]) => time >= from && time < to)));
  }

  function type(node, value, from, to) {
    const initial = node.textContent;
    painters.push(time => {
      node.textContent = time < from ? initial
        : value.slice(0, Math.round(value.length * Math.min(1, (time - from) / (to - from))));
    });
  }

  function textAt(node, values) {
    painters.push(time => { node.textContent = values.findLast(([at]) => time >= at)?.[1] || ''; });
  }

  const wallpaper = place(demoElement('div', 'manual-demo-wallpaper'), 0, 0, 600, 300);
  const grid = place(demoElement('div', 'manual-demo-grid'), 62, 26, 432, 210);
  for (let i = 0; i < 12; i++) grid.append(demoElement('span', 'manual-demo-cell'));
  const brand = place(demoElement('div', 'manual-demo-brand', 'New DeskTab'), 140, 164, 390);

  function bookmark(name, x, y, icon = BRAND, style = {}) {
    const node = createBookmarkElement({
      ...DEFAULT_BOOKMARK_STYLE, name, url: '#', backgroundFavicon: false,
      noBackground: false, backgroundColor: '#17263b', textColor: '#f1f5f9', ...style
    }, { isPreview: true, faviconUrl: icon });
    node.classList.add('manual-demo-item');
    node.dataset.demoItem = name;
    const pencil = demoElement('span', 'manual-demo-pencil', '✎');
    const handle = demoElement('span', 'manual-demo-handle');
    node.append(pencil, handle);
    return place(node, x, y, 98, 62);
  }

  const trash = place(demoElement('div', 'manual-demo-item manual-demo-trash'), 62, 26, 98, 62);
  trash.append(createRecycleBinGlyph(), demoElement('span', '', t('onboarding.demo.trash')));
  const a = bookmark('Gmail', 174, 26, MAIL);
  const b = bookmark('YouTube', 174, 100, VIDEO);
  const c = bookmark('New DeskTab', 286, 100);
  const folder = place(demoElement('div', 'manual-demo-item manual-demo-folder'), 286, 26, 98, 62);
  const folderArtwork = createFolderVisual({ ...DEFAULT_FOLDER_STYLE, noBackground: false, backgroundColor: '#267ca4' });
  folder.append(folderArtwork, demoElement('span', 'manual-demo-folder-name', t('onboarding.demo.work')));
  const folderCount = demoElement('span', 'manual-demo-folder-count', '1');
  folder.append(folderCount);
  const dock = place(demoElement('div', 'manual-demo-dock'), 6, 92, 36);
  const edit = demoElement('span', 'manual-demo-tool', '✎');
  const add = demoElement('span', 'manual-demo-tool', '+');
  const settings = demoElement('span', 'manual-demo-tool', '⚙');
  dock.append(edit, add, settings);
  const toolbar = place(demoElement('div', 'manual-demo-toolbar'), 155, 256, 290, 32);
  const search = demoElement('span', 'manual-demo-tool manual-demo-search');
  search.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.25 4.25"/></svg>';
  const workspace = demoElement('span', 'manual-demo-workspace', t('workspace.main'));
  const plus = demoElement('span', 'manual-demo-tool', '+');
  const undo = demoElement('span', 'manual-demo-tool', '↶');
  const redo = demoElement('span', 'manual-demo-tool', '↷');
  toolbar.append(search, workspace, plus, demoElement('span', '', '−'), undo, redo);
  const pointer = place(demoElement('div', 'manual-demo-pointer'), 0, 0, 20, 26);
  pointer.innerHTML = '<svg viewBox="0 0 24 26"><path class="manual-demo-arrow" d="M2 1v20l5-5 4 9 4-2-4-9h7Z"/><path class="manual-demo-diagonal" d="M4 4h6M4 4v6m0-6 16 16m0-6v6h-6"/><path class="manual-demo-horizontal" d="M3 13h18M8 8l-5 5 5 5m8-10 5 5-5 5"/></svg>';
  const click = place(demoElement('div', 'manual-demo-click'), 0, 0, 22, 22);
  const key = place(demoElement('kbd', 'manual-demo-key'), 452, 256);
  pointer.style.opacity = click.style.opacity = key.style.opacity = '0';

  function cursor(points, clicks = []) {
    // Buttons are measured in the fixed scene, including translated labels.
    const point = (x, y) => {
      if (typeof x === 'function') return x();
      if (!x?.nodeType) return { x, y };
      if (!scene.offsetWidth || !scene.getBoundingClientRect().width) return { x: 0, y: 0 };
      const target = measurePreviewRect(scene, x);
      return { x: target.x + target.width / 2, y: target.y + target.height / 2 };
    };
    const movement = track(pointer, [[0, { opacity: 0 }]], 'cursor');
    const feedback = track(click, [[0, { opacity: 0 }]], 'click');
    let previous = '';
    layoutPainters.push(() => {
      const movementFrames = [[0, { opacity: 0, transform: 'translate(540px, 220px)' }],
        ...points.map(([time, x, y, opacity = 1, linear = false]) => {
          const target = point(x, y);
          return [time, {
            transform: `translate(${target.x}px, ${target.y}px)`, opacity,
            ...(linear ? { easing: 'linear' } : {})
          }];
        }), [DEMO_DURATION, { opacity: 0 }]];
      const frames = [[0, { opacity: 0 }]];
      for (const [time, x, y] of clicks) {
        const target = point(x, y);
        frames.push([time - 1, { opacity: 0, transform: `translate(${target.x - 10}px, ${target.y - 10}px) scale(.3)` }],
          [time, { opacity: .8, transform: `translate(${target.x - 10}px, ${target.y - 10}px) scale(.3)` }],
          [time + 350, { opacity: 0, transform: `translate(${target.x - 10}px, ${target.y - 10}px) scale(1.6)` }]);
      }
      frames.push([DEMO_DURATION, { opacity: 0 }]);
      const next = JSON.stringify([movementFrames, frames]);
      if (next === previous) return;
      previous = next;
      const keyframes = frames => frames.map(([time, values]) => ({ offset: time / DEMO_DURATION, easing: EASE, ...values }));
      movement.effect.setKeyframes(keyframes(movementFrames));
      feedback.effect.setKeyframes(keyframes(frames));
    });
  }

  function keys(windows) {
    painters.push(time => {
      const current = windows.find(([from, to]) => time >= from && time < to);
      key.style.opacity = current ? '1' : '0';
      key.textContent = current?.[2] || '';
    });
  }

  function panel(title, x = 215, y = 38, width = 345) {
    const node = place(demoElement('div', 'manual-demo-panel'), x, y, width);
    node.append(demoElement('strong', 'manual-demo-panel-title', title));
    const body = demoElement('div', 'manual-demo-panel-body');
    node.append(body);
    return { node, body };
  }

  function row(panel, label, value = '') {
    const node = demoElement('div', 'manual-demo-row');
    const field = demoElement('span', 'manual-demo-field', value);
    node.append(demoElement('span', 'manual-demo-label', label), field);
    panel.body.append(node);
    return field;
  }

  function action(panel, label, primary = true) {
    const node = demoElement('span', `manual-demo-action${primary ? ' is-primary' : ''}`, label);
    panel.body.append(node);
    return node;
  }

  return {
    scene, a, b, c, trash, folder, folderArtwork, folderCount, grid, brand,
    wallpaper, dock, edit, add, settings, toolbar, workspace, plus, undo, redo, search,
    bookmark, place, track, show, move, during, type, textAt, cursor, keys, panel, row, action,
    paint(time) {
      painters.forEach(paint => paint(time));
      layoutPainters.forEach(paint => paint(time));
      animations.forEach(animation => { animation.currentTime = time; });
    },
    destroy() { animations.forEach(animation => animation.cancel()); scene.remove(); }
  };
}
