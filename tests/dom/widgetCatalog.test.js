import { beforeEach, describe, expect, test } from 'vitest';

import { createWidgetCatalogView } from '../../src/widgets/widgetCatalogView.js';

beforeEach(() => {
  document.body.replaceChildren();
});

const translate = key => ({
  'widgets.title': 'Widgets',
  'widgets.description': 'Choose one',
  'widgets.empty': 'Nothing here',
  'buttons.close': 'Close',
  'clock.name': 'Clock',
  'clock.description': 'Local time'
}[key] ?? key);

describe('widget catalog view', () => {
  test('renders registered widget metadata as an accessible choice', () => {
    const view = createWidgetCatalogView([{
      type: 'clock',
      catalog: {
        nameKey: 'clock.name',
        descriptionKey: 'clock.description',
        icon: '◷'
      }
    }], translate);
    document.body.append(view.modal);

    const option = view.list.querySelector('[data-widget-type="clock"]');
    expect(view.modal.id).toBe('widget-catalog-modal');
    expect(view.list.getAttribute('role')).toBe('list');
    expect(option.closest('[role="listitem"]')).not.toBeNull();
    expect(option.textContent).toContain('Clock');
    expect(option.textContent).toContain('Local time');
    expect(option.textContent).toContain('◷');
    expect(view.closeButton.textContent).toBe('Close');
    expect(view.modal.querySelector('.widget-catalog-empty').hidden).toBe(true);
  });

  test('shows an empty state when no widget can be added', () => {
    const view = createWidgetCatalogView([], translate);
    document.body.append(view.modal);

    expect(view.list.children).toHaveLength(0);
    expect(view.modal.querySelector('.widget-catalog-empty').hidden).toBe(false);
  });
});
