import { demoElement, createManualDemoScene, DEMO_DURATION, DEMO_WIDTH, DEMO_HEIGHT, DEMO_STEP_ENDS } from './manualDemoScene.js';
import { buildManualDemo, getManualDemoVariants, prepareManualDataDemo } from './manualDemoRecipes.js';

/** A finite, seekable demonstration with one clock for the cursor and every item. */
export function createManualDemo(topic, t) {
  const events = new AbortController();
  const root = demoElement('section', 'manual-demo');
  root.dataset.demoTopic = topic;
  root.setAttribute('aria-label', t('manual.demo.title'));
  const heading = demoElement('div', 'manual-demo-heading');
  heading.append(demoElement('strong', '', t('manual.demo.title')),
    demoElement('span', '', t('manual.demo.example')));
  const viewport = demoElement('div', 'manual-demo-viewport');
  const steps = demoElement('div', 'manual-demo-step-buttons');
  steps.setAttribute('role', 'group');
  steps.setAttribute('aria-label', t('manual.demo.steps'));
  const stepButtons = DEMO_STEP_ENDS.map((time, index) => {
    const button = demoElement('button', '', String(index + 1));
    button.type = 'button';
    button.setAttribute('aria-label', t('manual.demo.step', { step: index + 1, count: 3 }));
    button.addEventListener('click', () => seek(time), { signal: events.signal });
    steps.append(button);
    return button;
  });
  const caption = demoElement('p', 'manual-demo-caption');
  const controls = demoElement('div', 'manual-demo-controls');
  const play = demoElement('button', 'btn btn-secondary manual-demo-play');
  play.type = 'button';
  const replay = demoElement('button', 'btn btn-ghost manual-demo-replay', t('manual.demo.replay'));
  replay.type = 'button';
  const progress = demoElement('input', 'manual-demo-progress');
  progress.type = 'range';
  progress.min = '0'; progress.max = String(DEMO_DURATION); progress.step = '10';
  progress.value = '0';
  progress.setAttribute('aria-label', t('manual.demo.progress'));
  const position = demoElement('span', 'manual-demo-position');
  controls.append(play, replay, progress, position);
  const reducedHint = demoElement('p', 'manual-demo-reduced', t('manual.demo.reducedMotion'));
  root.append(heading, viewport, steps, caption, controls, reducedHint);

  const variants = getManualDemoVariants(topic);
  let variant = variants[0];
  if (variants.length) {
    const variantLabel = demoElement('label', 'manual-demo-variant', t('manual.demo.mode'));
    const select = demoElement('select', '');
    select.setAttribute('aria-label', t('manual.demo.mode'));
    for (const id of variants) {
      const key = topic === 'resizing' ? 'resize' : 'drag';
      const option = demoElement('option', '', t(`settingsModal.bookmark.${key}.${id}.title`));
      option.value = id;
      select.append(option);
    }
    select.addEventListener('change', () => {
      variant = select.value;
      rebuild();
    }, { signal: events.signal });
    variantLabel.append(select);
    heading.after(variantLabel);
  }

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let scene = null;
  let frame = null;
  let currentTime = 0;
  let lastTime = null;
  let playing = !reducedMotion.matches;
  let active = false;
  let visible = false;
  let destroyed = false;
  let currentStep = -1;
  let ready = topic !== 'data';
  let dataLocale = null;

  function render() {
    root.dataset.demoReady = String(ready);
    viewport.style.visibility = ready ? '' : 'hidden';
    [play, replay, progress, ...stepButtons].forEach(control => { control.disabled = !ready; });
    scene?.paint(currentTime);
    root.dataset.demoTime = String(Math.round(currentTime));
    root.dataset.demoPlaying = String(playing);
    const step = currentTime < 4000 ? 0 : currentTime < 8000 ? 1 : 2;
    if (step !== currentStep) {
      currentStep = step;
      root.dataset.demoStep = String(step + 1);
      // Brief narration stays outside the inert scene and is available to assistive technology.
      caption.textContent = t(`manual.demo.topics.${topic}.${step}`);
      position.textContent = t('manual.demo.step', { step: step + 1, count: 3 });
      stepButtons.forEach((button, index) => {
        if (index === step) button.setAttribute('aria-current', 'step');
        else button.removeAttribute('aria-current');
      });
    }
    progress.value = String(Math.round(currentTime));
    progress.setAttribute('aria-valuetext', `${position.textContent} · ${Math.round(currentTime / DEMO_DURATION * 100)}%`);
    play.textContent = t(reducedMotion.matches ? 'manual.demo.nextStep' : playing ? 'manual.demo.pause' : 'manual.demo.play');
    reducedHint.hidden = !reducedMotion.matches;
  }

  function stopClock() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    lastTime = null;
  }

  function tick(time) {
    frame = null;
    if (lastTime !== null) currentTime = Math.min(DEMO_DURATION, currentTime + time - lastTime);
    lastTime = time;
    if (currentTime === DEMO_DURATION) playing = false;
    render();
    if (playing) frame = requestAnimationFrame(tick);
    else lastTime = null;
  }

  function syncClock() {
    stopClock();
    if (!destroyed && ready && playing && active && visible && !document.hidden && !reducedMotion.matches) {
      frame = requestAnimationFrame(tick);
    }
  }

  function seek(time) {
    currentTime = Math.min(DEMO_DURATION, Math.max(0, time));
    playing = false;
    render();
    syncClock();
  }

  function rebuild() {
    stopClock();
    scene?.destroy();
    scene = createManualDemoScene(viewport, t);
    if (ready) buildManualDemo(topic, scene, t, variant, dataLocale);
    currentTime = reducedMotion.matches ? DEMO_STEP_ENDS[0] : 0;
    playing = !reducedMotion.matches;
    currentStep = -1;
    fit();
    render();
    syncClock();
  }

  function fit() {
    const width = viewport.clientWidth;
    if (!width || !scene) return;
    const scale = width / DEMO_WIDTH;
    scene.scene.style.transform = `scale(${scale})`;
    viewport.style.height = `${DEMO_HEIGHT * scale}px`;
  }

  play.addEventListener('click', () => {
    if (reducedMotion.matches) {
      seek(DEMO_STEP_ENDS.find(time => time > currentTime) ?? DEMO_STEP_ENDS[0]);
      return;
    }
    if (currentTime === DEMO_DURATION) currentTime = 0;
    playing = !playing;
    render();
    syncClock();
  }, { signal: events.signal });
  replay.addEventListener('click', () => {
    currentTime = reducedMotion.matches ? DEMO_STEP_ENDS[0] : 0;
    playing = !reducedMotion.matches;
    render();
    syncClock();
  }, { signal: events.signal });
  progress.addEventListener('input', () => seek(Number(progress.value)), { signal: events.signal });
  document.addEventListener('visibilitychange', syncClock, { signal: events.signal });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) seek(DEMO_STEP_ENDS[currentStep]);
    else render();
  }, { signal: events.signal });
  const resize = new ResizeObserver(fit);
  resize.observe(viewport);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    syncClock();
  });
  intersection.observe(root);
  rebuild();
  if (!ready) {
    prepareManualDataDemo(t).catch(() => null).then(locales => {
      if (destroyed) return;
      dataLocale = locales;
      ready = true;
      rebuild();
    });
  }

  return {
    element: root,
    setActive(next) { active = next; syncClock(); },
    destroy() {
      destroyed = true;
      stopClock();
      events.abort();
      resize.disconnect();
      intersection.disconnect();
      scene.destroy();
      root.remove();
    }
  };
}
