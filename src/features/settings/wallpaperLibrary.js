import { getLocalImageName } from '../../platform/images/localImages.js';
import { getLocalVideoName } from '../../platform/images/localVideos.js';
import { initCustomColorPicker } from '../../shared/ui/colorPicker.js';
import { resolveWallpaperItem } from '../../shared/ui/pageTheme.js';
import { t } from '../../platform/i18n/i18n.js';
import { setDraftThemeValue } from './settingsDraft.js';

/** Renders and edits the personal wallpaper list, including row previews. */
export function createWallpaperLibrary({ getTheme, setMedia, updatePreview, onRequestSaveStateUpdate, resetPreviewIndex }) {
  const mediaList = document.getElementById('settings-theme-media-list');
  function mediaLabel(item) {
    if (item.type === 'video') {
      return getLocalVideoName(item.local) ?? item.url ?? t('settingsModal.theme.unavailableLocal');
    }
    return getLocalImageName(item.backgroundImageLocal)
      ?? item.backgroundImageUrl ?? t('settingsModal.theme.unavailableLocal');
  }

  function placeWallpaperPeek(peek, anchor) {
    const anchorRect = anchor.getBoundingClientRect();
    const scrollArea = peek.closest('.settings-modal-tab-content');
    const scrollAreaRect = scrollArea?.getBoundingClientRect();
    const visibleTop = scrollAreaRect
      ? scrollAreaRect.top + scrollArea.clientTop
      : 0;
    const visibleBottom = scrollAreaRect
      ? visibleTop + scrollArea.clientHeight
      : window.innerHeight;
    const peekHeight = peek.getBoundingClientRect().height;
    const spaceAbove = anchorRect.top - visibleTop;
    const spaceBelow = visibleBottom - anchorRect.bottom;
    const placement = spaceAbove < peekHeight + 12 && spaceBelow > spaceAbove
      ? 'below' : 'above';

    peek.dataset.placement = placement;
  }

  function renderMediaList() {
    mediaList.querySelectorAll('video').forEach(video => video.pause());
    mediaList.replaceChildren();
    const entries = getTheme().backgroundMedia ?? [];
    entries.forEach((item, index) => {
      const updateItem = changes => {
        const next = [...(getTheme().backgroundMedia ?? [])];
        const position = next.findIndex(entry => entry.id === item.id);
        if (position < 0) return;
        next[position] = { ...next[position], ...changes };
        setMedia(next);
      };
      const row = document.createElement('div');
      row.className = 'theme-wallpaper-row';
      const label = document.createElement('span');
      label.className = 'theme-wallpaper-label';
      label.textContent = `${item.type === 'video' ? t('settingsModal.theme.video') : t('settingsModal.theme.image')} · ${mediaLabel(item)}`;
      label.title = mediaLabel(item);
      row.append(label);
      const localReference = item.type === 'video' ? item.local : item.backgroundImageLocal;
      const remoteUrl = item.type === 'video' ? item.url : item.backgroundImageUrl;
      if (localReference && remoteUrl) {
        const source = document.createElement('select');
        source.className = 'theme-wallpaper-source';
        source.setAttribute('aria-label', t('settingsModal.theme.activeSource'));
        for (const [value, text] of [
          ['local', t('localImage.sourceLocal')], ['url', t('localImage.sourceUrl')]
        ]) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = text;
          source.append(option);
        }
        source.value = item.type === 'video' ? item.source : item.backgroundImageSource;
        source.addEventListener('change', () => {
          updateItem({ [item.type === 'video' ? 'source' : 'backgroundImageSource']: source.value });
        });
        row.append(source);
      }
      const color = document.createElement('input');
      color.type = 'color';
      color.className = 'theme-wallpaper-color';
      color.value = item.backgroundColor ?? getTheme().backgroundImageColor;
      color.setAttribute('aria-label', t('settingsModal.theme.mediaColor'));
      color.addEventListener('input', () => {
        const next = [...(getTheme().backgroundMedia ?? [])];
        const position = next.findIndex(entry => entry.id === item.id);
        if (position < 0) return;
        next[position] = { ...next[position], backgroundColor: color.value };
        setDraftThemeValue('backgroundMedia', next);
        updatePreview();
        onRequestSaveStateUpdate();
      });
      row.append(color);
      initCustomColorPicker(color);

      const peekButton = document.createElement('button');
      peekButton.type = 'button';
      peekButton.className = 'theme-wallpaper-preview-trigger';
      peekButton.setAttribute('aria-label', t('settingsModal.theme.mediaPreview'));
      const peek = document.createElement('div');
      peek.className = 'theme-wallpaper-peek';
      peek.hidden = true;
      function showPeek() {
        const current = (getTheme().backgroundMedia ?? []).find(entry => entry.id === item.id) ?? item;
        const source = resolveWallpaperItem(current);
        peek.querySelector('video')?.pause();
        peek.replaceChildren();
        peek.style.backgroundImage = '';
        const color = current.backgroundColor ?? getTheme().backgroundImageColor;
        peek.style.backgroundColor = source?.type === 'video' ? '#000000' : color;
        if (source?.url) {
          if (source.type === 'video') {
            const media = document.createElement('video');
            media.muted = true;
            media.loop = true;
            media.playsInline = true;
            media.onloadeddata = () => {
              const reveal = () => {
                if (!peek.contains(media)) return;
                peek.style.backgroundColor = color;
                media.classList.add('is-ready');
              };
              if (typeof media.requestVideoFrameCallback === 'function') {
                media.requestVideoFrameCallback(reveal);
              } else reveal();
            };
            media.onerror = () => { if (peek.contains(media)) peek.style.backgroundColor = color; };
            peek.append(media);
            media.src = source.url;
            void media.play().catch(() => {});
          } else {
            peek.style.backgroundImage = `url(${JSON.stringify(source.url)})`;
          }
        } else {
          peek.textContent = t('settingsModal.theme.unavailableLocal');
        }
        peek.hidden = false;
        placeWallpaperPeek(peek, row);
      }
      function hidePeek() {
        const video = peek.querySelector('video');
        if (video) {
          video.pause();
          video.onloadeddata = null;
          video.onerror = null;
        }
        peek.replaceChildren();
        peek.style.backgroundImage = '';
        delete peek.dataset.placement;
        peek.hidden = true;
      }
      peekButton.addEventListener('mouseenter', showPeek);
      peekButton.addEventListener('mouseleave', hidePeek);
      peekButton.addEventListener('focus', showPeek);
      peekButton.addEventListener('blur', hidePeek);
      row.prepend(peekButton);
      row.append(peek);
      for (const [symbol, key, offset] of [
        ['↑', 'moveUp', -1], ['↓', 'moveDown', 1], ['×', 'remove', 0]
      ]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'theme-wallpaper-row-action';
        button.textContent = symbol;
        button.setAttribute('aria-label', t(`settingsModal.theme.${key}`));
        button.disabled = offset !== 0 && (index + offset < 0 || index + offset >= entries.length);
        button.addEventListener('click', () => {
          const next = [...(getTheme().backgroundMedia ?? [])];
          const position = next.findIndex(entry => entry.id === item.id);
          if (position < 0) return;
          if (offset === 0) next.splice(position, 1);
          else [next[position], next[position + offset]] = [next[position + offset], next[position]];
          resetPreviewIndex();
          setMedia(next);
        });
        row.append(button);
      }
      mediaList.append(row);
    });
  }

  return { render: renderMediaList, placePeek: placeWallpaperPeek };
}
