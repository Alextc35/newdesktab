/** Builds the clock settings modal owned by the bundled widget. */
export function createClockSettingsView(translate = key => key) {
  const translated = (tagName, key) => translatedElement(tagName, key, translate);
  const modal = document.createElement('div');
  modal.id = 'clock-widget-modal';
  modal.className = 'modal';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const card = document.createElement('div');
  card.className = 'modal-card modal-sm clock-widget-modal-card';

  const modalTitle = translated('h2', 'clock.createTitle');
  modalTitle.id = 'clock-widget-modal-title';

  const description = translated('p', 'clock.description');
  description.className = 'clock-widget-modal-description';

  const previewWrapper = document.createElement('div');
  previewWrapper.className = 'clock-widget-preview';
  previewWrapper.setAttribute('aria-hidden', 'true');
  const preview = document.createElement('time');
  preview.id = 'clock-widget-preview-time';
  preview.className = 'clock-widget-preview-time';
  previewWrapper.append(preview);

  const hourCycleField = document.createElement('div');
  hourCycleField.className = 'modal-field';
  const hourCycleLabel = translated('label', 'clock.hourCycle');
  hourCycleLabel.htmlFor = 'clock-widget-hour-cycle';
  const hourCycleSelect = document.createElement('select');
  hourCycleSelect.id = 'clock-widget-hour-cycle';
  hourCycleSelect.append(
    translatedOption('24', 'clock.hour24', translate),
    translatedOption('12', 'clock.hour12', translate)
  );
  hourCycleField.append(hourCycleLabel, hourCycleSelect);

  const secondsField = document.createElement('div');
  secondsField.className = 'checkbox-wrapper clock-widget-seconds-option';
  const showSecondsInput = document.createElement('input');
  showSecondsInput.id = 'clock-widget-show-seconds';
  showSecondsInput.type = 'checkbox';
  const secondsLabel = translated('label', 'clock.showSeconds');
  secondsLabel.htmlFor = showSecondsInput.id;
  secondsField.append(showSecondsInput, secondsLabel);

  const actions = document.createElement('div');
  actions.className = 'modal-actions clock-widget-modal-actions';
  const deleteButton = translatedButton(
    'clock-widget-delete', 'clock.delete', 'btn btn-danger', translate
  );
  const spacer = document.createElement('span');
  spacer.className = 'clock-widget-modal-spacer';
  const cancelButton = translatedButton(
    'clock-widget-cancel', 'buttons.cancel', 'btn btn-ghost', translate
  );
  const saveButton = translatedButton(
    'clock-widget-save', 'buttons.add', 'btn btn-primary', translate
  );
  actions.append(deleteButton, spacer, cancelButton, saveButton);

  card.append(
    modalTitle,
    description,
    previewWrapper,
    hourCycleField,
    secondsField,
    actions
  );
  modal.append(overlay, card);

  return {
    modal,
    modalTitle,
    hourCycleSelect,
    showSecondsInput,
    preview,
    deleteButton,
    cancelButton,
    saveButton
  };
}

function translatedElement(tagName, key, translate) {
  const element = document.createElement(tagName);
  element.dataset.i18n = key;
  element.textContent = translate(key);
  return element;
}

function translatedOption(value, key, translate) {
  const option = translatedElement('option', key, translate);
  option.value = value;
  return option;
}

function translatedButton(id, key, className, translate) {
  const button = translatedElement('button', key, translate);
  button.id = id;
  button.type = 'button';
  button.className = className;
  return button;
}
