/** Counts visible reading time, pausing for pointer and keyboard interaction. */
export function createTimedNotice(card, { duration = 20_000, onDismiss }) {
  const events = new AbortController();
  const progress = card.querySelector('.daily-tip-progress-fill');
  let countdown = null;
  let exit = null;
  let closing = false;
  let visible = false;
  let hovering = false;
  let focused = false;

  function sync() {
    if (!countdown || closing) return;
    if (!visible || hovering || focused) countdown.pause();
    else countdown.play();
  }

  function finish() {
    card.hidden = true;
    countdown?.cancel();
    countdown = null;
    card.inert = false;
    closing = false;
    visible = false;
    exit?.cancel();
    exit = null;
    onDismiss();
  }

  function dismiss({ animate = true } = {}) {
    if (closing) return;
    closing = true;
    // Freeze the remaining bar during departure; cancelling here would refill it.
    countdown?.pause();
    if (!animate || card.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish();
      return;
    }
    card.inert = true;
    exit = card.animate([
      { transform: 'translateX(0)', opacity: 1 },
      { transform: 'translateX(calc(100% + 40px))', opacity: 0 }
    ], { duration: 360, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
    exit.id = 'daily-tip-exit';
    exit.finished.then(finish, () => {});
  }

  card.addEventListener('pointerenter', () => { hovering = true; sync(); }, { signal: events.signal });
  card.addEventListener('pointerleave', () => { hovering = false; sync(); }, { signal: events.signal });
  card.addEventListener('focusin', () => { focused = true; sync(); }, { signal: events.signal });
  card.addEventListener('focusout', event => {
    focused = card.contains(event.relatedTarget);
    sync();
  }, { signal: events.signal });

  return {
    show() {
      countdown?.cancel();
      countdown = progress.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }],
        { duration, easing: 'linear', fill: 'forwards' });
      countdown.id = 'daily-tip-countdown';
      countdown.finished.then(() => dismiss(), () => {});
      sync();
    },
    setVisible(value) {
      visible = value;
      card.hidden = !value;
      // Visibility changes can hide a hovered card without a pointerleave.
      hovering = value && card.matches(':hover');
      focused = value && card.contains(document.activeElement);
      sync();
    },
    dismiss,
    destroy() { events.abort(); countdown?.cancel(); exit?.cancel(); card.hidden = true; }
  };
}
