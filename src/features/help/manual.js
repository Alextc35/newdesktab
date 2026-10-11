import { subscribeLanguageChange, t } from '../../platform/i18n/i18n.js';
import { closeModal, isModalActive, openModal, registerModal } from '../../shared/ui/modalManager.js';
import { getManualTopic, MANUAL_GROUPS, searchManual } from './manualCatalog.js';

function textElement(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

export function createManual(modal) {
  const events = new AbortController();
  const index = modal.querySelector('.manual-index');
  const search = modal.querySelector('#manual-search');
  const groups = modal.querySelector('.manual-groups');
  const count = modal.querySelector('.manual-count');
  const article = modal.querySelector('.manual-article');
  const reader = modal.querySelector('.manual-reader');
  const back = modal.querySelector('#manual-back');
  let selected = null;

  registerModal({ id: 'manual', element: modal, initialFocus: search, independentViewport: true });

  function topicButton(id, showSummary = true, showAnswer = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'manual-topic';
    button.dataset.manualTopic = id;
    button.append(textElement('strong', '', t(`manual.topics.${id}.${showAnswer ? 'question' : 'title'}`)));
    if (showSummary) button.append(textElement('span', '', t(`manual.topics.${id}.${showAnswer ? 'tip' : 'summary'}`)));
    return button;
  }

  function renderIndex() {
    const matches = searchManual(search.value, t);
    count.textContent = t('manual.count', { count: matches.length });
    groups.replaceChildren();
    if (search.value.trim() && matches.length) {
      const section = document.createElement('section');
      section.className = 'manual-group manual-search-results';
      section.append(textElement('h3', 'manual-group-heading', t('manual.search.resultsLabel')),
        ...matches.map(topic => topicButton(topic.id, true, true)));
      groups.append(section);
      return;
    }
    for (const [number, group] of MANUAL_GROUPS.entries()) {
      const topics = matches.filter(topic => topic.group === group);
      if (!topics.length) continue;
      const section = document.createElement('section');
      section.className = 'manual-group';
      const heading = textElement('h3', 'manual-group-heading', t(`manual.groups.${group}`));
      heading.prepend(textElement('span', 'manual-group-number', `0${number + 1}`));
      section.append(heading, ...topics.map(topic => topicButton(topic.id)));
      groups.append(section);
    }
    if (!matches.length) groups.append(textElement('p', 'manual-empty', t('manual.empty')));
  }

  function renderArticle() {
    const topic = getManualTopic(selected);
    if (!topic) return;
    const key = `manual.topics.${topic.id}`;
    article.dataset.topic = topic.id;
    article.replaceChildren(
      textElement('p', 'manual-eyebrow', t(`manual.groups.${topic.group}`)),
      textElement('h3', 'manual-article-title', t(`${key}.title`)),
      textElement('p', 'manual-summary', t(`${key}.summary`))
    );
    const steps = document.createElement('ol');
    steps.className = 'manual-steps';
    for (let i = 0; i < 3; i++) steps.append(textElement('li', '', t(`${key}.steps.${i}`)));
    const note = document.createElement('aside');
    note.className = 'manual-note';
    note.append(textElement('strong', '', t('manual.remember')), textElement('p', '', t(`${key}.note`)));
    const related = document.createElement('nav');
    related.className = 'manual-related';
    related.setAttribute('aria-label', t('manual.related'));
    related.append(textElement('h4', '', t('manual.related')), ...topic.related.map(id => topicButton(id, false)));
    article.append(steps, note, related);
  }

  function render() {
    index.hidden = Boolean(selected);
    reader.hidden = !selected;
    if (selected) renderArticle();
    else renderIndex();
  }

  function select(id, focus = true) {
    selected = getManualTopic(id)?.id ?? null;
    render();
    modal.querySelector('.manual-body').scrollTop = 0;
    if (focus) (selected ? back : search).focus({ preventScroll: true });
  }

  modal.addEventListener('click', event => {
    const button = event.target.closest('[data-manual-topic]');
    if (button) select(button.dataset.manualTopic);
  }, { signal: events.signal });
  search.addEventListener('input', renderIndex, { signal: events.signal });
  back.addEventListener('click', () => select(null), { signal: events.signal });
  modal.querySelector('#manual-close').addEventListener('click', () => closeModal('manual'), { signal: events.signal });
  const unsubscribe = subscribeLanguageChange(() => {
    if (isModalActive('manual')) render();
  });

  return {
    open(topic = null) {
      search.value = '';
      select(topic, false);
      openModal('manual', { onCancel: () => closeModal('manual'), initialFocus: selected ? back : search });
    },
    destroy() {
      events.abort();
      unsubscribe();
      closeModal('manual');
    }
  };
}
