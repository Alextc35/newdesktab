import { beforeEach, describe, expect, test } from 'vitest';

import {
  createClockSettingsView
} from '../../src/widgets/builtin/clock/clockSettingsView.js';

beforeEach(() => {
  document.body.replaceChildren();
});

describe('clock settings view', () => {
  test('builds its complete modal without static page markup', () => {
    const view = createClockSettingsView();
    document.body.append(view.modal);

    expect(document.getElementById('clock-widget-modal')).toBe(view.modal);
    expect(view.modalTitle.dataset.i18n).toBe('clock.createTitle');
    expect(view.hourCycleSelect.options).toHaveLength(2);
    expect([...view.hourCycleSelect.options].map(option => option.value)).toEqual(['24', '12']);
    expect(view.showSecondsInput.type).toBe('checkbox');
    expect(view.modal.querySelector('.modal-overlay')).not.toBeNull();
    expect(view.modal.querySelector('.clock-widget-preview-time')).toBe(view.preview);
    expect(view.deleteButton.type).toBe('button');
    expect(view.cancelButton.type).toBe('button');
    expect(view.saveButton.type).toBe('button');
  });
});
