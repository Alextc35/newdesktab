import { subscribeLanguageChange, t } from '../../platform/i18n/i18n.js';

/** The search example shares the real modal classes, with no controller or IDs. */
export function initOnboardingReadyPreview(root, samples) {
  const backdrop = document.createElement('div');
  backdrop.className = 'onboarding-demo-search-backdrop';
  const panel = document.createElement('div');
  panel.className = 'modal-card modal-search onboarding-demo-search';
  panel.innerHTML = `
    <strong class="onboarding-demo-search-title" data-i18n="search.title"></strong>
    <input class="onboarding-demo-search-input" type="search" readonly tabindex="-1"
      data-i18n="search.placeholder" data-i18n-aria-label="search.inputLabel">
    <div class="search-results"></div>
    <div class="modal-actions">
      <button class="btn btn-ghost" type="button" tabindex="-1" data-i18n="buttons.close"></button>
    </div>`;
  const results = panel.querySelector('.search-results');
  for (const sample of samples) {
    const link = document.createElement('a');
    link.className = 'search-result';
    link.href = '#';
    link.tabIndex = -1;
    link.dataset.searchName = sample.name.toLowerCase();
    const name = document.createElement('strong');
    name.textContent = sample.name;
    const detail = document.createElement('small');
    detail.dataset.demoUrl = sample.url;
    link.append(name, detail);
    results.append(link);
  }
  const localize = () => {
    for (const detail of results.querySelectorAll('small')) {
      detail.textContent = `${t('workspace.main')} · ${detail.dataset.demoUrl}`;
    }
  };
  localize();
  subscribeLanguageChange(localize);
  root.append(backdrop, panel);
}
