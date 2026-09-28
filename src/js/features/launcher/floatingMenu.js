import { hasOpenModal } from '../../shared/ui/modalManager.js';

export function initFloatingMenu() {
  const container = document.querySelector('.floating-add');
  const toggle = document.getElementById('add-toggle');
  const options = document.getElementById('add-options');
  const buttons = [...options.querySelectorAll('button')];

  function setOpen(open) {
    options.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  }

  toggle.addEventListener('click', () => setOpen(options.hidden));

  // Restore focus before the existing action opens its dialog, so closing the
  // dialog returns to the visible + button instead of a hidden option.
  options.addEventListener('click', event => {
    if (!event.target.closest('button')) return;
    toggle.focus();
    setOpen(false);
  }, true);

  container.addEventListener('keydown', event => {
    if (hasOpenModal()) return;
    event.stopPropagation();
    if (event.key === 'Escape' && !options.hidden) {
      event.preventDefault();
      toggle.focus();
      setOpen(false);
    } else if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
      const index = buttons.indexOf(document.activeElement);
      const next = event.key === 'ArrowDown' ? index + 1 : (index < 0 ? buttons.length - 1 : index - 1);
      buttons[(next + buttons.length) % buttons.length].focus();
    }
  });

  document.addEventListener('pointerdown', event => {
    if (!container.contains(event.target)) setOpen(false);
  });
  document.addEventListener('focusin', event => {
    if (!container.contains(event.target)) setOpen(false);
  });
}
