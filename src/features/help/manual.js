import { subscribeLanguageChange, t } from '../../platform/i18n/i18n.js';
import { closeModal, isModalActive, openModal, registerModal, subscribeModalChanges } from '../../shared/ui/modalManager.js';
import { getManualTopic, MANUAL_GROUPS, MANUAL_TOPICS, searchManual } from './manualCatalog.js';
import { createManualDemo } from './manualDemo.js';
import { createManualIcon } from './manualIcons.js';

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
  let demo = null;

  registerModal({ id: 'manual', element: modal, initialFocus: search, independentViewport: true });

  function topicButton(id, showSummary = true, showAnswer = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'manual-topic';
    button.dataset.manualTopic = id;
    const title = textElement('strong', 'manual-topic-title', t(`manual.topics.${id}.${showAnswer ? 'question' : 'title'}`));
    title.prepend(createManualIcon(id));
    button.append(title);
    if (showSummary) button.append(textElement('span', 'manual-topic-summary', t(`manual.topics.${id}.${showAnswer ? 'tip' : 'summary'}`)));
    return button;
  }

  function renderIndex() {
    const matches = searchManual(search.value, t);
    count.textContent = t('manual.count', { count: matches.length });
    groups.replaceChildren();
    if (search.value.trim() && matches.length) {
      const section = document.createElement('section');
      section.className = 'manual-group manual-search-results';
      const heading = textElement('h3', 'manual-group-heading', t('manual.search.resultsLabel'));
      heading.prepend(createManualIcon('search'));
      section.append(heading,
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
      heading.prepend(createManualIcon(group), textElement('span', 'manual-group-number', `0${number + 1}`));
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
    article.querySelector('.manual-article-title').prepend(createManualIcon(topic.id));
    demo = createManualDemo(topic.id, t);
    article.append(demo.element);
    demo.setActive(isModalActive('manual'));
    const steps = document.createElement('ol');
    steps.className = 'manual-steps';
    for (let i = 0; i < 3; i++) steps.append(textElement('li', '', t(`${key}.steps.${i}`)));
    const note = document.createElement('aside');
    note.className = 'manual-note';
    note.append(textElement('strong', '', t('manual.remember')), textElement('p', '', t(`${key}.note`)));
    const navigation = document.createElement('nav');
    navigation.className = 'manual-sequence';
    navigation.setAttribute('aria-label', t('manual.demo.browse'));
    const position = MANUAL_TOPICS.findIndex(item => item.id === topic.id);
    const adjacent = [['previous', MANUAL_TOPICS[position - 1]], ['next', MANUAL_TOPICS[position + 1]]]
      .filter(([, item]) => item);
    for (const [direction, item] of adjacent) {
      const button = topicButton(item.id, false);
      button.className = `manual-sequence-${direction}`;
      button.prepend(textElement('span', '', t(`manual.demo.${direction}`)));
      navigation.append(button);
    }
    article.append(steps, note, navigation);
    const adjacentIds = new Set(adjacent.map(([, item]) => item.id));
    const relatedIds = topic.related.filter(id => !adjacentIds.has(id));
    if (relatedIds.length) {
      const related = document.createElement('nav');
      related.className = 'manual-related';
      related.setAttribute('aria-label', t('manual.related'));
      related.append(textElement('h4', '', t('manual.related')), ...relatedIds.map(id => topicButton(id, false)));
      article.append(related);
    }
  }

  function render() {
    demo?.destroy();
    demo = null;
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
  const unsubscribeModal = subscribeModalChanges(() => demo?.setActive(isModalActive('manual')));

  return {
    open(topic = null) {
      search.value = '';
      select(topic, false);
      openModal('manual', { onCancel: () => closeModal('manual'), initialFocus: selected ? back : search });
    },
    destroy() {
      events.abort();
      unsubscribe();
      unsubscribeModal();
      demo?.destroy();
      closeModal('manual');
    }
  };
}
