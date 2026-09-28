/** Builds a catalog from registered definitions without knowing widget types. */
export function createWidgetCatalogView(definitions, translate = key => key) {
  const modal = document.createElement('div');
  modal.id = 'widget-catalog-modal';
  modal.className = 'modal';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const card = document.createElement('section');
  card.className = 'modal-card widget-catalog-card';

  const heading = document.createElement('header');
  heading.className = 'widget-catalog-header';
  const title = translatedElement('h2', 'widgets.title', translate);
  title.id = 'widget-catalog-title';
  const description = translatedElement('p', 'widgets.description', translate);
  heading.append(title, description);

  const list = document.createElement('div');
  list.className = 'widget-catalog-list custom-scrollbar';
  list.setAttribute('role', 'list');

  for (const definition of definitions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'widget-catalog-item';
    button.dataset.widgetType = definition.type;

    const icon = document.createElement('span');
    icon.className = 'widget-catalog-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = definition.catalog.icon;

    const copy = document.createElement('span');
    copy.className = 'widget-catalog-copy';
    const itemName = translatedElement('strong', definition.catalog.nameKey, translate);
    const itemDescription = translatedElement(
      'span', definition.catalog.descriptionKey, translate
    );
    copy.append(itemName, itemDescription);

    const arrow = document.createElement('span');
    arrow.className = 'widget-catalog-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '›';
    button.append(icon, copy, arrow);
    const item = document.createElement('div');
    item.setAttribute('role', 'listitem');
    item.append(button);
    list.append(item);
  }

  const empty = translatedElement('p', 'widgets.empty', translate);
  empty.className = 'widget-catalog-empty';
  empty.hidden = definitions.length > 0;

  const actions = document.createElement('div');
  actions.className = 'modal-actions widget-catalog-actions';
  const closeButton = translatedElement('button', 'buttons.close', translate);
  closeButton.id = 'widget-catalog-close';
  closeButton.type = 'button';
  closeButton.className = 'btn btn-ghost';
  actions.append(closeButton);

  card.append(heading, list, empty, actions);
  modal.append(overlay, card);
  return { modal, list, closeButton };
}

function translatedElement(tagName, key, translate) {
  const element = document.createElement(tagName);
  element.dataset.i18n = key;
  element.textContent = translate(key);
  return element;
}
