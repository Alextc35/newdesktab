import { DEFAULT_BOOKMARK_STYLE } from '../../domain/bookmarks/bookmarkDefaults.js';
import { DEFAULT_FOLDER_STYLE } from '../../domain/folders/folderDefaults.js';
import { VERSION } from '../../platform/browser/extensionMetadata.js';
import { applyI18n } from '../../platform/i18n/i18n.js';
import { createBookmarkElement } from '../bookmarks/bookmarkCard.js';
import { createFavicon } from '../bookmarks/bookmarkFavicon.js';
import { createFolderVisual } from '../folders/folderVisual.js';
import { createRecycleBinGlyph } from '../recycle-bin/recycleBinAppearance.js';
import { createLauncherPreview } from '../launcher/launcherVisual.js';
import { createOnboardingAnimation } from './onboardingAnimation.js';
import { initOnboardingFolderPreview } from './onboardingFolderPreview.js';
import { initOnboardingReadyPreview } from './onboardingReadyPreview.js';

const MAIL = { name: 'Gmail', icon: new URL('./assets/mail.svg', import.meta.url).href };
const VIDEO = { name: 'YouTube', icon: new URL('./assets/video.svg', import.meta.url).href };
const DESKTAB = { name: 'New DeskTab', icon: new URL('../../../assets/icons/brand-mark.svg', import.meta.url).href };
const MEDIA_IMAGE_STYLE = {
  ...DEFAULT_FOLDER_STYLE,
  backgroundColor: '#b497e5',
  backgroundImageUrl: new URL('./assets/multimedia-landscape.svg', import.meta.url).href
};

/** A local, inert example uses production artwork without creating workspace items. */
export function initOnboardingPreview(root) {
  root.querySelector('.onboarding-demo-version').textContent = `v${VERSION}`;
  root.querySelector('.onboarding-demo-dock')
    .append(createLauncherPreview(document.getElementById('floating-menu')));
  const grid = root.querySelector('.onboarding-demo-grid');
  const trash = createItem('onboarding-demo-trash', 'onboarding.demo.trash');
  trash.prepend(createRecycleBinGlyph());
  const media = createFolder('onboarding-demo-media', 'onboarding.demo.media', true, [VIDEO, DESKTAB]);
  grid.replaceChildren(
    trash,
    createBookmark(MAIL, 'onboarding-demo-favorite'),
    media,
    createFolder('onboarding-demo-work', 'onboarding.demo.work', false, [MAIL]),
    createBookmark(VIDEO, 'onboarding-demo-video'),
    createBookmark(DESKTAB, 'onboarding-demo-brand'),
    root.querySelector('.onboarding-demo-clock')
  );
  initOnboardingFolderPreview(root, [VIDEO, DESKTAB]);
  initOnboardingReadyPreview(root, [
    { name: MAIL.name, url: 'https://mail.google.com' },
    { name: VIDEO.name, url: 'https://youtube.com' },
    { name: DESKTAB.name, url: 'chrome://newtab' }
  ]);
  applyI18n(root);
  const animation = createOnboardingAnimation(root);
  let customized = false;
  return {
    ...animation,
    setStep(step) {
      const next = step === 'style' || step === 'ready';
      if (customized !== next) {
        media.querySelector('.folder-visual').replaceWith(createFolderArtwork(next
          ? MEDIA_IMAGE_STYLE : { ...DEFAULT_FOLDER_STYLE, noBackground: true }, [VIDEO, DESKTAB]));
        customized = next;
      }
      animation.setStep(step);
    }
  };
}

function createBookmark(sample, className = '') {
  const element = createBookmarkElement({
    ...DEFAULT_BOOKMARK_STYLE,
    name: sample.name,
    url: '#'
  }, { isPreview: true, faviconUrl: sample.icon });
  element.classList.add('onboarding-demo-item');
  if (className) element.classList.add(className);
  if (className === 'onboarding-demo-favorite') {
    const resize = document.createElement('i');
    resize.className = 'onboarding-demo-resize';
    element.append(resize);
    for (const direction of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
      const handle = document.createElement('span');
      handle.className = `resizer ${direction}`;
      handle.setAttribute('aria-hidden', 'true');
      element.append(handle);
    }
    const indicator = document.createElement('span');
    indicator.className = 'resize-indicator';
    element.append(indicator);
  }
  return element;
}

function createFolder(className, labelKey, transparent, samples) {
  const item = createItem(className, labelKey);
  item.prepend(createFolderArtwork({ ...DEFAULT_FOLDER_STYLE, noBackground: transparent }, samples));
  return item;
}

function createFolderArtwork(style, samples) {
  const visual = createFolderVisual(style);
  const previews = visual.querySelector('.folder-previews');
  for (const sample of samples) {
    const favicon = createFavicon(sample, { placeholderUrl: sample.icon });
    favicon.alt = '';
    previews.append(favicon);
  }
  return visual;
}

function createItem(className, labelKey) {
  const item = document.createElement('div');
  item.className = `onboarding-demo-item ${className}`;
  const label = document.createElement('span');
  label.className = 'onboarding-demo-label';
  label.dataset.i18n = labelKey;
  item.append(label);
  return item;
}
