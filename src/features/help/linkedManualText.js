import { getManualTopic } from './manualCatalog.js';

/** Localized text with explicit manual destinations; labels are always plain text. */
export function renderLinkedManualText(element, text) {
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  for (const match of text.matchAll(/\[\[([a-z-]+)\|([^\]]+)\]\]/gu)) {
    fragment.append(document.createTextNode(text.slice(cursor, match.index)));
    if (getManualTopic(match[1])) {
      const link = document.createElement('a');
      link.href = `#manual-${match[1]}`;
      link.className = 'onboarding-manual-link';
      link.dataset.manualTopic = match[1];
      link.setAttribute('aria-haspopup', 'dialog');
      link.textContent = match[2];
      fragment.append(link);
    } else fragment.append(document.createTextNode(match[2]));
    cursor = match.index + match[0].length;
  }
  fragment.append(document.createTextNode(text.slice(cursor)));
  element.replaceChildren(fragment);
}
