import { subscribeLanguageChange, t } from '../../platform/i18n/i18n.js';
import { getManualTopic, searchManual } from './manualCatalog.js';

const COMMON_TOPICS = ['keyboard', 'movement', 'backup'];

/** Offers concise answers from the manual while the user describes a need. */
export function createHelpSearch(form, onOpenManual) {
  const events = new AbortController();
  const input = form.querySelector('input');
  const status = form.querySelector('.help-search-status');
  const results = form.querySelector('.settings-help-results');

  function render() {
    const searching = Boolean(input.value.trim());
    const matches = searching ? searchManual(input.value, t).slice(0, 3) : COMMON_TOPICS.map(getManualTopic);
    status.textContent = t(searching ? matches.length ? 'manual.search.found' : 'manual.search.empty'
      : 'manual.search.common', { count: matches.length });
    results.replaceChildren(...matches.map(topic => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'settings-help-result';
      button.dataset.manualTopic = topic.id;
      const question = document.createElement('strong');
      question.textContent = t(`manual.topics.${topic.id}.question`);
      button.append(question);
      if (searching) {
        const answer = document.createElement('span');
        answer.textContent = t(`manual.topics.${topic.id}.tip`);
        button.append(answer);
      }
      return button;
    }));
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const first = results.querySelector('button');
    if (first) onOpenManual(first.dataset.manualTopic);
  }, { signal: events.signal });
  input.addEventListener('input', () => {
    render();
    (results.firstElementChild ?? status).scrollIntoView?.({ block: 'nearest' });
  }, { signal: events.signal });
  results.addEventListener('click', event => {
    const button = event.target.closest('[data-manual-topic]');
    if (button) onOpenManual(button.dataset.manualTopic);
  }, { signal: events.signal });
  form.addEventListener('keydown', event => {
    if (form.closest('[inert], [hidden]')) return;
    if (event.key === 'Escape' && input.value) {
      event.preventDefault();
      input.value = '';
      render();
      input.focus();
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const buttons = [...results.querySelectorAll('button')];
      const index = buttons.indexOf(document.activeElement);
      const target = event.key === 'ArrowDown' ? buttons[index + 1] : index <= 0 ? input : buttons[index - 1];
      if (target) { event.preventDefault(); target.focus(); }
    }
  }, { signal: events.signal });
  const unsubscribe = subscribeLanguageChange(render);
  render();
  return { destroy() { events.abort(); unsubscribe(); } };
}
