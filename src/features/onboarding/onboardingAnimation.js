import { createOnboardingEditAnimation } from './onboardingEditAnimation.js';
import { createOnboardingFolderAnimation } from './onboardingFolderAnimation.js';
import { createOnboardingReadyAnimation } from './onboardingReadyAnimation.js';
import { subscribeLanguageChange } from '../../platform/i18n/i18n.js';
import { createClickAnimation, measurePreviewRect, pointerFrame } from './onboardingTimeline.js';

const DURATION = 7600;

/** Coordinates the inert launcher and cursor on one clock; no actions are clicked. */
export function createOnboardingAnimation(root) {
  const dock = root.querySelector('.launcher-dock');
  const add = dock.querySelector('.launcher-add');
  const options = dock.querySelector('.launcher-options');
  const bookmark = options.querySelector('button');
  const cursor = root.querySelector('.onboarding-demo-cursor');
  const click = root.querySelector('.onboarding-demo-click');
  const demos = {
    edit: createOnboardingEditAnimation(root),
    organize: createOnboardingFolderAnimation(root),
    ready: createOnboardingReadyAnimation(root)
  };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let active = false;
  let step = null;
  let size = '';
  let animations = [];
  let frame = null;
  let phase = '';

  function setPhase(progress) {
    const revealed = progress >= .21 && progress < .74;
    const hovered = progress >= .3 && progress < .6;
    const expanded = progress >= .34 && progress < .6;
    const selected = progress >= .5 && progress < .6;
    const next = `${revealed}:${hovered}:${expanded}:${selected}`;
    if (phase === next) return;
    phase = next;
    dock.classList.toggle('is-demo-revealed', revealed);
    add.classList.toggle('is-demo-hovered', hovered);
    add.setAttribute('aria-expanded', String(expanded));
    bookmark.classList.toggle('is-demo-hovered', selected);
  }

  function stop() {
    animations.forEach(animation => animation.cancel());
    animations = [];
    cancelAnimationFrame(frame);
    frame = null;
    setPhase(0);
    Object.values(demos).forEach(demo => demo.reset());
  }

  function sync() {
    stop();
    if (!active || (step !== 'start' && !demos[step]) || document.hidden || !root.clientWidth) return;
    size = `${root.clientWidth}:${root.clientHeight}`;
    if (reducedMotion.matches) {
      if (demos[step]) demos[step].showStatic();
      else setPhase(.52);
      return;
    }
    if (demos[step]) {
      run(demos[step].start());
      return;
    }
    const width = root.clientWidth;
    const height = root.clientHeight;
    const { plus, favorite } = measureTargets();
    const rest = { x: width * .76, y: height * .74 };
    const edge = { x: 4, y: plus.y };
    const movement = cursor.animate([
      pointerFrame(rest, 0, 0), pointerFrame(rest, .06), pointerFrame(edge, .21),
      pointerFrame(plus, .3), pointerFrame(plus, .4), pointerFrame(favorite, .51),
      pointerFrame(favorite, .6), pointerFrame(favorite, .67, 0),
      pointerFrame(rest, .8, 0), pointerFrame(rest, 1, 0)
    ], { duration: DURATION, iterations: Infinity });
    movement.id = 'onboarding-add-cursor';
    const feedback = createClickAnimation(click, [
      { position: plus, offset: .34 }, { position: favorite, offset: .56 }
    ], DURATION);
    run({ animations: [movement, feedback], duration: DURATION, setPhase });
  }

  function run(sequence) {
    animations = sequence.animations;
    const clock = animations[0];
    const startTime = document.timeline.currentTime;
    animations.forEach(animation => { animation.startTime = startTime; });
    function tick() {
      sequence.setPhase((clock.currentTime % sequence.duration) / sequence.duration);
      frame = requestAnimationFrame(tick);
    }
    tick();
  }

  // Read the expanded layout without displaying an intermediate measurement frame.
  function measureTargets() {
    dock.style.transition = 'none';
    dock.style.transform = 'translate(0, -50%)';
    dock.style.width = 'var(--launcher-expanded-width)';
    options.style.transition = 'none';
    options.style.transform = 'translate(0, -50%)';
    const center = element => {
      const target = measurePreviewRect(root, element);
      return {
        x: target.x + target.width / 2,
        y: target.y + target.height / 2
      };
    };
    const targets = { plus: center(add), favorite: center(bookmark) };
    dock.style.removeProperty('transform');
    dock.style.removeProperty('width');
    options.style.removeProperty('transform');
    // Restore the closed layout before enabling its normal transitions.
    dock.getBoundingClientRect();
    dock.style.removeProperty('transition');
    options.style.removeProperty('transition');
    return targets;
  }

  new ResizeObserver(() => {
    if (`${root.clientWidth}:${root.clientHeight}` !== size) sync();
  }).observe(root);
  reducedMotion.addEventListener('change', sync);
  subscribeLanguageChange(sync);
  document.addEventListener('visibilitychange', sync);

  return {
    setStep(next) {
      if (step === next) return;
      step = next;
      sync();
    },
    setActive(next) {
      if (active === next) return;
      active = next;
      sync();
    }
  };
}
