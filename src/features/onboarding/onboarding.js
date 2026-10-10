import { subscribeLanguageChange, t } from '../../platform/i18n/i18n.js';
import { claimOnboarding, recordOnboarding } from '../../platform/storage/deviceOnboarding.js';
import { closeModal, hasOpenModal, openModal, registerModal, subscribeModalChanges } from '../../shared/ui/modalManager.js';
import { isListView } from '../../shared/ui/viewportMode.js';
import { initOnboardingPreview } from './onboardingPreview.js';

const STEPS = ['start', 'edit', 'organize', 'style', 'ready'];

/** Owns the short, optional welcome guide; application composition owns its CTA. */
export function initOnboarding({ onAddBookmark }) {
  const modal = document.getElementById('onboarding-modal');
  const next = document.getElementById('onboarding-next');
  const back = document.getElementById('onboarding-back');
  const explore = document.getElementById('onboarding-explore');
  const title = document.getElementById('onboarding-title');
  const body = document.getElementById('onboarding-description');
  const hint = document.getElementById('onboarding-hint');
  const progress = document.getElementById('onboarding-progress');
  const dots = [...modal.querySelectorAll('.onboarding-dots li')];
  const preview = initOnboardingPreview(modal.querySelector('.onboarding-demo'));
  let step = 0;
  let replay = false;

  registerModal({ id: 'onboarding', element: modal, initialFocus: next,
    closeOnOverlay: false });
  modal.setAttribute('aria-describedby', body.id);
  subscribeModalChanges(active => preview.setActive(active === modal));

  function render() {
    const id = STEPS[step];
    const last = step === STEPS.length - 1;
    modal.dataset.step = id;
    preview.setStep(id);
    title.textContent = t(`onboarding.steps.${id}.title`);
    body.textContent = t(`onboarding.steps.${id}.body`);
    hint.textContent = t(last && isListView() && !replay
      ? 'onboarding.compactHint' : `onboarding.steps.${id}.hint`);
    progress.textContent = t('onboarding.progress', { current: step + 1, total: STEPS.length });
    back.hidden = step === 0;
    explore.hidden = !last || replay || isListView();
    next.textContent = t(!last ? 'onboarding.next' : replay
      ? 'onboarding.finish' : isListView() ? 'onboarding.explore' : 'onboarding.addFirst');
    dots.forEach((dot, index) => dot.classList.toggle('is-current', index === step));
  }

  function finish(status, addBookmark = false) {
    closeModal('onboarding');
    void recordOnboarding(status).catch(error => {
      console.warn('[NewDeskTab] Could not save the welcome preference:', error);
    });
    if (addBookmark) onAddBookmark();
  }

  function open({ repeat = false } = {}) {
    step = 0;
    replay = repeat;
    render();
    openModal('onboarding', { onCancel: () => finish('dismissed') });
  }

  next.addEventListener('click', () => {
    if (step === STEPS.length - 1) {
      finish('completed', !replay && !isListView());
      return;
    }
    step++;
    render();
  });
  back.addEventListener('click', () => {
    step = Math.max(0, step - 1);
    render();
    if (step === 0) next.focus({ preventScroll: true });
  });
  explore.addEventListener('click', () => finish('completed'));
  document.getElementById('onboarding-skip').addEventListener('click', () => finish('dismissed'));
  document.getElementById('settings-open-guide').addEventListener('click', () => open({ repeat: true }));
  subscribeLanguageChange(render);
  window.addEventListener('resize', () => {
    if (modal.classList.contains('is-open')) render();
  });

  return {
    async offerWelcome() {
      try {
        if (await claimOnboarding() && !hasOpenModal()) open();
      } catch (error) {
        // Optional help must never prevent the workspace from loading.
        console.warn('[NewDeskTab] Could not load the welcome preference:', error);
      }
    }
  };
}
