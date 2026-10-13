/** Animate a details body while preserving native summary keyboard activation. */
export function initAnimatedDisclosure(details, content, { signal } = {}) {
  const summary = details.querySelector('summary');
  let expanded = details.open;
  let animation;

  function settle(open) {
    details.open = open;
    details.classList.remove('is-collapsing');
    content.style.overflow = '';
    content.inert = !open;
  }

  function setOpen(open, { animate = false } = {}) {
    if (!animation && expanded === open && details.open === open) return;
    expanded = open;
    const startHeight = details.open ? content.getBoundingClientRect().height : 0;
    const startOpacity = details.open ? getComputedStyle(content).opacity : 0;
    animation?.cancel();
    animation = null;
    if (!animate || !content.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      settle(open);
      return;
    }
    details.open = true;
    details.classList.toggle('is-collapsing', !open);
    content.inert = !open;
    content.style.overflow = 'hidden';
    const current = content.animate([
      { height: `${startHeight}px`, opacity: startOpacity },
      { height: `${open ? content.scrollHeight : 0}px`, opacity: open ? 1 : 0 }
    ], { duration: 240, easing: 'cubic-bezier(.2, 0, .2, 1)', fill: 'both' });
    animation = current;
    void current.finished.then(() => {
      if (animation !== current) return;
      settle(open);
      current.cancel();
      animation = null;
    }, () => {});
  }

  summary.addEventListener('click', event => {
    event.preventDefault();
    setOpen(!expanded, { animate: true });
  }, { signal });
  signal?.addEventListener('abort', () => {
    animation?.cancel();
    animation = null;
    settle(expanded);
  }, { once: true });
  content.inert = !expanded;
  return { setOpen };
}
