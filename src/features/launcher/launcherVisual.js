/** Copies launcher artwork and labels without its IDs, listeners or live actions. */
export function createLauncherPreview(source) {
  const preview = source.cloneNode(true);
  for (const element of [preview, ...preview.querySelectorAll('[id]')]) {
    element.removeAttribute('id');
  }
  for (const button of preview.querySelectorAll('button')) {
    button.tabIndex = -1;
    button.removeAttribute('aria-controls');
  }
  preview.inert = true;
  preview.setAttribute('aria-hidden', 'true');
  const edit = preview.querySelector('.launcher-edit');
  edit.classList.remove('is-editing');
  edit.setAttribute('aria-pressed', 'false');
  preview.querySelector('.launcher-add').setAttribute('aria-expanded', 'false');
  const options = preview.querySelector('.launcher-options');
  options.hidden = false;
  options.inert = true;
  options.setAttribute('aria-hidden', 'true');
  return preview;
}
