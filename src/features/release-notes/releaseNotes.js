import { VERSION } from '../../platform/browser/extensionMetadata.js';
import { subscribeLanguageChange, t } from '../../platform/i18n/i18n.js';
import { claimReleaseNotes } from '../../platform/storage/deviceReleaseNotes.js';
import { closeModal, hasOpenModal, openModal, registerModal, subscribeModalChanges } from '../../shared/ui/modalManager.js';
import { ensurePanelFits, isListView } from '../../shared/ui/viewportMode.js';
import { flashInfo } from '../../shared/ui/flash.js';
import { getReleaseNotes } from './releaseCatalog.js';

/** Local release history and a once-per-version introduction to the installed build. */
export function initReleaseNotes() {
  const modal = document.getElementById('release-notes-modal');
  const content = document.getElementById('release-notes-content');
  const reading = modal.querySelector('.release-notes-reading');
  const history = document.getElementById('release-notes-history');
  const continueButton = document.getElementById('release-notes-continue');
  const entries = getReleaseNotes(VERSION);
  let selected = entries[0];
  let automatic = false;
  let settle;

  registerModal({ id: 'release-notes', element: modal, initialFocus: continueButton,
    requiresWideViewport: true });
  modal.setAttribute('aria-describedby', 'release-notes-intro');

  function render() {
    const prefix = selected.translation;
    document.getElementById('release-notes-title').textContent = t(`${prefix}.title`);
    document.getElementById('release-notes-intro').textContent = t(`${prefix}.${selected.paragraphs[0]}`);
    document.getElementById('release-notes-version').textContent = `v${selected.version}`;
    const date = document.getElementById('release-notes-date');
    date.hidden = !selected.date;
    date.dateTime = selected.date ?? '';
    date.textContent = selected.date ? new Intl.DateTimeFormat(document.documentElement.lang,
      { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${selected.date}T12:00:00Z`)) : '';
    content.replaceChildren();
    for (const key of selected.paragraphs.slice(1)) {
      const paragraph = document.createElement('p');
      paragraph.textContent = t(`${prefix}.${key}`);
      content.append(paragraph);
    }
    if (selected.highlights.length) {
      const heading = document.createElement('h3');
      heading.textContent = t('releaseNotes.highlights');
      const list = document.createElement('ul');
      for (const key of selected.highlights) {
        const item = document.createElement('li');
        item.textContent = t(`${prefix}.highlights.${key}`);
        list.append(item);
      }
      const signature = document.createElement('p');
      signature.className = 'release-notes-signature';
      signature.textContent = 'Alejandro · @alextc35';
      content.append(heading, list, signature);
    }
    history.hidden = automatic;
    history.replaceChildren(...entries.map(entry => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `v${entry.version}`;
      button.setAttribute('aria-pressed', String(entry === selected));
      button.addEventListener('click', () => {
        selected = entry;
        render();
        reading.scrollTop = 0;
        history.querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
      });
      return button;
    }));
    continueButton.textContent = t(automatic ? 'releaseNotes.continue' : 'releaseNotes.back');
  }

  function close() {
    automatic = false;
    closeModal('release-notes');
    settle?.(true);
    settle = null;
  }

  function open({ startup = false } = {}) {
    if (!ensurePanelFits()) return;
    automatic = startup;
    selected = entries[0];
    render();
    openModal('release-notes', { onCancel: close });
    reading.scrollTop = 0;
  }

  continueButton.addEventListener('click', close);
  document.getElementById('release-notes-close').addEventListener('click', close);
  document.getElementById('settings-open-release-notes').addEventListener('click', () => open());
  subscribeLanguageChange(render);

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

  return {
    async offerUpdate() {
      try {
        let claimed = false;
        do {
          await waitForAvailable();
          claimed = await claimReleaseNotes(VERSION, { canClaim: available });
        } while (!claimed && !available());
        if (!claimed) return false;
        await waitForAvailable();
        const dismissed = new Promise(resolve => { settle = resolve; });
        open({ startup: true });
        return dismissed;
      } catch (error) {
        console.warn('[NewDeskTab] Could not offer release notes:', error);
        return false;
      }
    }
  };
}
