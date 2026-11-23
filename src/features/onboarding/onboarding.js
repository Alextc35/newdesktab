import { subscribeLanguageChange, t } from '../../platform/i18n/i18n.js';
import { claimOnboarding, recordOnboarding } from '../../platform/storage/deviceOnboarding.js';
import { closeModal, hasOpenModal, openModal, registerModal, subscribeModalChanges } from '../../shared/ui/modalManager.js';
import { ensurePanelFits, isListView } from '../../shared/ui/viewportMode.js';
import { flashInfo } from '../../shared/ui/flash.js';
import { initOnboardingPreview } from './onboardingPreview.js';
import { renderLinkedManualText } from '../help/linkedManualText.js';
import { detectChromeBookmarks } from '../bookmarks/browserBookmarkImport.js';
import { offerWelcomeBookmarkImport } from '../bookmarks/browserBookmarkImportUI.js';

const STEPS = ['start', 'edit', 'organize', 'style', 'ready'];

/** Owns the short, optional welcome guide; application composition owns its CTA. */
export function initOnboarding({ onAddBookmark, onOpenManual }) {
  const modal = document.getElementById('onboarding-modal');
  const next = document.getElementById('onboarding-next');
  const back = document.getElementById('onboarding-back');
  const explore = document.getElementById('onboarding-explore');
  const title = document.getElementById('onboarding-title');
  const body = document.getElementById('onboarding-description');
  const hint = document.getElementById('onboarding-hint');
  const progress = document.getElementById('onboarding-progress');
  const copy = modal.querySelector('.onboarding-copy');
  const dots = [...modal.querySelectorAll('.onboarding-dots li')];
  const preview = initOnboardingPreview(modal.querySelector('.onboarding-demo'));
  let step = 0;
  let replay = false;
  let welcomeImportDetection = null;

  registerModal({ id: 'onboarding', element: modal, initialFocus: next,
    closeOnOverlay: false, requiresWideViewport: true });
  modal.setAttribute('aria-describedby', body.id);
  subscribeModalChanges(active => preview.setActive(active === modal));

  function render() {
    const id = STEPS[step];
    const last = step === STEPS.length - 1;
    modal.dataset.step = id;
    preview.setStep(id);
    title.textContent = t(`onboarding.steps.${id}.title`);
    renderLinkedManualText(body, t(`onboarding.steps.${id}.body`));
    renderLinkedManualText(hint, t(last && isListView() && !replay
      ? 'onboarding.compactHint' : `onboarding.steps.${id}.hint`));
    progress.textContent = t('onboarding.progress', { current: step + 1, total: STEPS.length });
    back.hidden = step === 0;
    explore.hidden = !last || replay || isListView();
    next.textContent = t(!last ? 'onboarding.next' : replay
      ? 'onboarding.finish' : isListView() ? 'onboarding.explore' : 'onboarding.addFirst');
    dots.forEach((dot, index) => dot.classList.toggle('is-current', index === step));
  }

  async function finish(status, addBookmark = false) {
    const detection = !replay ? welcomeImportDetection : null;
    welcomeImportDetection = null;
    closeModal('onboarding');
    void recordOnboarding(status).catch(error => {
      console.warn('[NewDeskTab] Could not save the welcome preference:', error);
    });
    const imported = detection ? await offerWelcomeBookmarkImport(detection) : false;
    if (addBookmark && !imported) onAddBookmark();
  }

  function open({ repeat = false } = {}) {
    if (!ensurePanelFits()) return;
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
  copy.addEventListener('click', event => {
    const link = event.target.closest('[data-manual-topic]');
    if (!link) return;
    event.preventDefault();
    onOpenManual?.(link.dataset.manualTopic);
  });
  document.getElementById('onboarding-skip').addEventListener('click', () => finish('dismissed'));
  document.getElementById('settings-open-guide').addEventListener('click', () => open({ repeat: true }));
  subscribeLanguageChange(render);
  window.addEventListener('resize', () => {
    if (modal.classList.contains('is-open')) render();
  });

  const available = () => !document.hidden && !hasOpenModal() && !isListView();
  const waitForAvailable = () => {
    if (available()) return Promise.resolve();
    if (isListView()) flashInfo('flash.viewport.tooNarrow');
    return new Promise(resolve => {
      const check = () => {
        if (!available()) return;
        unsubscribe();
        document.removeEventListener('visibilitychange', check);
        window.removeEventListener('resize', check);
        resolve();
      };
      const unsubscribe = subscribeModalChanges(check);
      document.addEventListener('visibilitychange', check);
      window.addEventListener('resize', check);
      check();
    });
  };

  async function offerWelcome() {
    try {
      let claimed = false;
      do {
        await waitForAvailable();
        claimed = await claimOnboarding({ canClaim: available });
      } while (!claimed && !available());
      if (!claimed) return;
      await waitForAvailable();
      // Detection never opens a dialog until the first guide is finished.
      welcomeImportDetection = detectChromeBookmarks().catch(error => {
        console.warn('[NewDeskTab] Could not detect welcome bookmarks:', error);
        return null;
      });
      open();
    } catch (error) {
      // Optional help must never prevent the workspace from loading.
      console.warn('[NewDeskTab] Could not load the welcome preference:', error);
    }
  }
  return { offerWelcome };
}
