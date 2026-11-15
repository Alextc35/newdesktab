import { hasOpenModal } from '../../shared/ui/modalManager.js';
import { createCatalogIcon } from '../../shared/ui/catalogIcon.js';

export function initFloatingMenu() {
  const container = document.querySelector('.floating-add');
  const toggle = document.getElementById('add-toggle');
  const options = document.getElementById('add-options');
  const buttons = [...options.querySelectorAll('button')];
  for (const [id, iconId] of [['add-bookmark', 'ui-bookmark'], ['add-folder', 'ui-folders']]) {
    document.getElementById(id).querySelector('.launcher-option-icon').replaceChildren(createCatalogIcon(iconId));
  }

  options.hidden = false;

  function isOpen() {
    return toggle.getAttribute('aria-expanded') === 'true';
  }

  function setOpen(open) {
    toggle.setAttribute('aria-expanded', String(open));
    options.toggleAttribute('inert', !open);
    options.setAttribute('aria-hidden', String(!open));
  }

  setOpen(false);
  toggle.addEventListener('click', () => setOpen(!isOpen()));

  // Native activations return to the visible + button when the dialog closes.
  // Shortcut clicks return to the grid so the launcher does not retain focus.
  options.addEventListener('click', event => {
    if (!event.target.closest('button')) return;
    const returnTarget = event.isTrusted ? toggle : document.getElementById('bookmark-container');
    returnTarget?.focus({ preventScroll: true });
    setOpen(false);
  }, true);

  container.addEventListener('keydown', event => {
    if (hasOpenModal()) return;
    event.stopPropagation();
    if (event.key === 'Escape' && isOpen()) {
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
