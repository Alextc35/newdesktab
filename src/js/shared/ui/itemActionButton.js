/** Creates a reusable direct-action button for an editable grid item. */
export function createItemActionButton(text, type, themeClass, onClick) {
  const button = document.createElement('button');
  button.className = `item-action-button ${type} ${themeClass}`;
  button.type = 'button';
  button.textContent = text;
  button.addEventListener('click', event => {
    event.stopPropagation();
    onClick();
  });
  return button;
}
