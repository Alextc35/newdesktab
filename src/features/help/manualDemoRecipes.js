import { demoElement, DEMO_DURATION } from './manualDemoScene.js';
import { createClockTimeElement, updateClockTimeElement } from '../../widgets/builtin/clock/clockView.js';
import { loadTranslations } from '../../lang/index.js';
import { resolveLanguage } from '../../domain/settings/interfacePreferences.js';

/** Read example languages without changing the application's i18n or settings. */
export async function prepareManualDataDemo(t) {
  const alternate = document.documentElement.lang.startsWith('en') ? 'es' : 'en';
  const system = resolveLanguage('system', globalThis.chrome?.i18n?.getUILanguage?.() || navigator.language);
  const [before, after] = await Promise.all([loadTranslations(alternate), loadTranslations(system)]);
  const translate = tree => key => key.split('.').reduce((value, part) => value?.[part], tree) ?? t(key);
  return { before: translate(before), after: translate(after), systemLight: !matchMedia('(prefers-color-scheme: dark)').matches };
}

export function getManualDemoVariants(topic) {
  if (topic === 'resizing') return ['none', 'smooth'];
  if (topic === 'drag-modes') return ['none', 'relocate', 'cascade'];
  return [];
}

/** Each recipe illustrates actual controls; none sends input to the application. */
export function buildManualDemo(topic, v, t, variant = 'none', dataLocale = null) {
  const label = key => t(`manual.demo.labels.${key}`);
  const title = key => t(`manual.topics.${key}.title`);
  const edit = (start = 1000, end = DEMO_DURATION + 1) => {
    v.during(v.scene, 'is-demo-editing', [[start, end]]);
    v.during(v.edit, 'is-demo-active', [[start, end]]);
    v.during(v.grid, 'is-demo-visible', [[start, end]]);
  };
  const saved = (from = 10200, x = 360, y = 222) => {
    const message = v.place(demoElement('span', 'manual-demo-saved', label('saved')), x, y, 205);
    v.show(message, from);
  };
  const settings = (section, start = 1600, end = DEMO_DURATION) => {
    const panel = v.panel(`${label('settings')} › ${t(`settingsModal.sections.${section}`)}`);
    v.show(panel.node, start, end);
    return panel;
  };
  const addMenu = (item, start = 1600, end = 3500) => {
    const menu = v.panel('+', 48, 91, 153);
    const bookmark = v.row(menu, t('launcher.bookmark'), '↗').parentElement;
    const folder = v.row(menu, t('launcher.folder'), '▱').parentElement;
    const widgets = v.row(menu, t('launcher.widgets'), '◷').parentElement;
    v.show(menu.node, start, end);
    return item === 'bookmarks' ? bookmark : item === 'folders' ? folder : widgets;
  };
  const editor = (start = 4000, end = 9700) => {
    const panel = v.panel(title('bookmarks'));
    const name = v.row(panel, t('editModal.name'));
    const url = v.row(panel, t('editModal.url'));
    const button = v.action(panel, t('buttons.add'));
    v.show(panel.node, start, end);
    return { panel, name, url, button };
  };

  switch (topic) {
    case 'bookmarks': {
      const menuItem = addMenu(topic);
      const { name, url, button } = editor();
      v.type(name, 'New DeskTab', 4200, 5400);
      v.type(url, 'https://newdesktab.com', 5500, 6900);
      const added = v.bookmark('New DeskTab', 398, 26);
      v.show(added, 10200);
      v.cursor([[650, 4, 132], [1400, v.add], [2650, menuItem], [4200, name],
        [7000, url], [9400, button], [10800, 447, 56], [11500, 525, 125, 0]],
      [[1600, v.add], [2900, menuItem], [9500, button]]);
      saved();
      break;
    }
    case 'quick-save': {
      const chrome = v.place(demoElement('div', 'manual-demo-browser', 'https://newdesktab.com'), 26, 12, 548, 31);
      const icon = demoElement('img', '');
      icon.src = new URL('../../../assets/icons/brand-mark.svg', import.meta.url).href;
      icon.alt = '';
      chrome.append(icon);
      const panel = v.panel('New DeskTab', 270, 52, 292);
      v.row(panel, t('editModal.name'), 'New DeskTab');
      v.row(panel, t('editModal.url'), 'https://newdesktab.com');
      v.row(panel, t('workspace.current'), t('workspace.main'));
      const save = v.action(panel, t('buttons.save'));
      v.show(panel.node, 3000, 9300);
      const added = v.bookmark('New DeskTab', 398, 26);
      v.show(added, 10000);
      v.show(chrome, 0, 9600);
      v.cursor([[650, 400, 25], [2400, icon], [4200, 460, 150], [8500, save], [11100, 448, 55, 0]],
        [[2800, icon], [9200, save]]);
      saved();
      break;
    }
    case 'keyboard': {
      v.keys([[1100, 3000, 'Tab'], [4200, 5100, '→'], [5700, 6600, '↓'], [7000, 9000, 'Enter'], [10200, 11800, 'Esc']]);
      v.during(v.trash, 'is-demo-focused', [[1400, 4200]]);
      v.during(v.a, 'is-demo-focused', [[4200, 5700]]);
      v.during(v.b, 'is-demo-focused', [[5700, 10200]]);
      const opened = v.panel('YouTube');
      v.row(opened, label('page'), 'https://youtube.com');
      v.show(opened.node, 7800, 9400);
      break;
    }
    case 'shortcuts': {
      const panel = settings('shortcuts');
      const key = v.row(panel, t('settingsModal.shortcuts.actions.toggleEditing.title'), 'E');
      v.row(panel, t('launcher.bookmark'), 'B');
      const save = v.action(panel, t('buttons.save'));
      v.during(key, 'is-demo-focused', [[4000, 6900]]);
      v.type(key, 'Ctrl + E', 5300, 6500);
      v.keys([[5400, 7500, 'Ctrl + E']]);
      v.cursor([[900, v.settings], [2900, key], [4100, key], [9200, save], [11200, 560, 220, 0]],
        [[4000, key], [9800, save]]);
      saved();
      break;
    }
    case 'search': {
      const panel = v.panel(t('search.title'));
      const input = v.row(panel, t('search.inputLabel'));
      v.type(input, 'gmail', 4200, 6000);
      const result = v.row(panel, 'Gmail', `mail.google.com · ${t('workspace.main')}`);
      v.show(result.parentElement, 6300);
      v.during(result.parentElement, 'is-demo-active', [[7600]]);
      v.show(panel.node, 1800, 10500);
      v.keys([[1100, 3200, '/'], [8300, 10100, 'Enter'], [10800, 11900, 'Esc']]);
      v.cursor([[800, v.search], [3500, input], [8000, result.parentElement], [11000, 460, 180, 0]],
        [[1700, v.search], [9500, result.parentElement]]);
      break;
    }
    case 'editing': {
      edit(2000, 10500);
      const panel = v.panel(t('editModal.title'));
      const name = v.row(panel, t('editModal.name'), 'Gmail');
      v.row(panel, t('editModal.url'), 'https://mail.google.com');
      const save = v.action(panel, t('buttons.save'));
      const updatedName = `Gmail · ${t('workspace.main')}`;
      v.show(panel.node, 4400, 9000);
      v.type(name, updatedName, 5700, 7100);
      v.textAt(v.a.querySelector('.bookmark-title'), [[0, 'Gmail'], [9250, updatedName]]);
      const pencil = v.a.querySelector('.manual-demo-pencil');
      v.cursor([[800, v.edit], [2300, v.edit], [4200, pencil], [5000, name],
        [7100, name], [8500, save], [10100, v.edit], [11300, 70, 140, 0]],
      [[2000, v.edit], [4400, pencil], [5500, name], [9000, save], [10500, v.edit]]);
      saved(10900);
      break;
    }
    case 'movement': {
      edit();
      v.during(v.a, 'is-demo-grabbed', [[2700, 7500]]);
      v.move(v.a, [[0, 0, 0], [3000, 0, 0], [6900, 224, 148], [12000, 224, 148]]);
      v.cursor([[600, v.edit], [1800, 222, 55], [3000, 222, 55], [6900, 446, 203], [8100, 446, 203], [11000, 540, 233, 0]],
        [[1000, v.edit], [2800, 222, 55], [7500, 446, 203]]);
      saved(9000);
      break;
    }
    case 'resizing': {
      edit();
      for (const item of [v.b, v.c, v.folder]) item.remove();
      // The cursor crosses both half-cell thresholds at the same instant.
      const frames = variant === 'smooth'
        ? [[0, { width: '98px', height: '62px' }], [4200, { width: '98px', height: '62px', easing: 'linear' }],
          [7200, { width: '210px', height: '136px' }], [12000, { width: '210px', height: '136px' }]]
        : [[0, { width: '98px', height: '62px' }], [4200, { width: '98px', height: '62px', easing: 'steps(1, end)' }],
          [5700, { width: '210px', height: '136px' }], [12000, { width: '210px', height: '136px' }]];
      v.track(v.a, frames, 'resize');
      v.during(v.scene, 'is-demo-resizing', [[3500, 7800]]);
      v.cursor([[700, v.edit], [2900, 272, 88], [4200, 272, 88, 1, true],
        [7200, 384, 162, 1, true], [7800, 384, 162], [10800, 430, 191, 0]],
      [[1000, v.edit], [4200, 272, 88], [7800, 384, 162]]);
      saved(9700);
      break;
    }
    case 'drag-modes': {
      edit();
      Object.assign(v.a.style, { left: '62px', top: '100px' });
      Object.assign(v.c.style, { left: '174px', top: '100px' });
      Object.assign(v.b.style, { left: '286px', top: '100px' });
      const endX = variant === 'none' ? 0 : 224;
      const endY = variant === 'none' ? 74 : 0;
      const path = variant === 'relocate'
        ? [[3200, 0, 0], [4800, 0, 74], [6200, 224, 74], [7200, 224, 0]]
        : [[3200, 0, 0], [4700, 112, 0], [5400, 112, 0], [7200, endX, endY]];
      v.move(v.a, [[0, 0, 0], ...path, [12000, endX, endY]]);
      v.during(v.a, 'is-demo-grabbed', [[3200, 8000]]);
      if (variant === 'none') v.during(v.a, 'is-demo-blocked', [[4600, 5600]]);
      if (variant === 'relocate') v.move(v.b, [[0, 0, 0], [5900, 0, 0], [6200, 0, 74],
        [6800, -224, 74], [7500, -224, 0], [12000, -224, 0]]);
      if (variant === 'cascade') {
        v.move(v.c, [[0, 0, 0], [3700, 0, 0], [4700, -112, 0], [12000, -112, 0]]);
        v.move(v.b, [[0, 0, 0], [5500, 0, 0], [7200, -112, 0], [12000, -112, 0]]);
      }
      v.cursor([[700, v.edit], [2600, 110, 131], ...path.map(([time, x, y]) => [time, 110 + x, 131 + y]),
        [8200, 110 + endX, 131 + endY], [11000, 550, 220, 0]],
      [[1000, v.edit], [3200, 110, 131], [8000, 110 + endX, 131 + endY]]);
      saved(9600);
      break;
    }
    case 'folders': {
      const creation = v.panel(title('folders'), 220, 57, 330);
      const name = v.row(creation, t('editModal.name'));
      const add = v.action(creation, t('buttons.add'));
      v.type(name, t('onboarding.demo.work'), 1000, 2200);
      v.show(creation.node, 800, 3000);
      v.show(v.folder, 3300);
      edit(3800);
      v.move(v.a, [[0, 0, 0], [4200, 0, 0], [6600, 112, 0, .6], [12000, 112, 0, .6]]);
      v.show(v.a, 0, 6800);
      v.show(v.folderCount, 7000);
      const panel = v.panel(t('onboarding.demo.work'), 205, 54, 340);
      const folderGrid = demoElement('div', 'manual-demo-folder-grid');
      for (let i = 0; i < 18; i++) folderGrid.append(demoElement('span', 'manual-demo-cell'));
      panel.body.append(folderGrid);
      const contained = v.bookmark('Gmail', 0, 0, new URL('../onboarding/assets/mail.svg', import.meta.url).href);
      contained.classList.add('is-demo-folder-content');
      contained.style.width = '46px';
      contained.style.height = '44px';
      folderGrid.append(contained);
      v.show(panel.node, 9300);
      v.show(contained, 9500);
      v.cursor([[650, v.add], [1800, name], [2800, add], [3800, 222, 55], [6600, 334, 55], [9100, 334, 55], [11200, 500, 220, 0]],
        [[700, v.add], [3000, add], [4200, 222, 55], [6900, 334, 55], [9300, 334, 55]]);
      break;
    }
    case 'workspaces': {
      const panel = v.panel(t('workspace.prompt'), 239, 82, 310);
      const name = v.row(panel, t('editModal.name'));
      v.type(name, t('onboarding.demo.work'), 1300, 2900);
      const add = v.action(panel, t('buttons.add'));
      v.show(panel.node, 900, 3500);
      v.textAt(v.workspace, [[0, t('workspace.main')], [4000, t('onboarding.demo.work')],
        [8500, t('workspace.main')], [10400, t('onboarding.demo.work')]]);
      for (const node of [v.a, v.b, v.c, v.folder, v.trash]) v.track(node, [[0, { opacity: 1 }], [3900, { opacity: 1 }],
        [4200, { opacity: 0 }], [8300, { opacity: 0 }], [8600, { opacity: 1 }], [10200, { opacity: 1 }],
        [10500, { opacity: 0 }], [12000, { opacity: 0 }]]);
      const work = v.bookmark('New DeskTab', 174, 26);
      v.track(work, [[0, { opacity: 0 }], [5900, { opacity: 0 }], [6300, { opacity: 1 }], [8300, { opacity: 1 }],
        [8600, { opacity: 0 }], [10200, { opacity: 0 }], [10500, { opacity: 1 }], [12000, { opacity: 1 }]]);
      v.keys([[8100, 9800, 'Alt + ↑'], [10400, 11800, 'Alt + ↓']]);
      v.cursor([[600, v.plus], [1800, name], [2900, add], [6000, 225, 55], [7500, 470, 190, 0]],
        [[900, v.plus], [3400, add]]);
      v.during(v.workspace, 'is-demo-active', [[4200]]);
      break;
    }
    case 'selection': {
      edit();
      v.during(v.a, 'is-demo-selected', [[2600]]);
      v.during(v.b, 'is-demo-selected', [[4400]]);
      const panel = v.panel(label('selection'), 320, 114, 250);
      v.row(panel, '2', label('selected'));
      const clone = v.action(panel, t('bulk.duplicate'));
      v.show(panel.node, 5200, 9600);
      const a2 = v.bookmark('Gmail', 398, 26, new URL('../onboarding/assets/mail.svg', import.meta.url).href);
      const b2 = v.bookmark('YouTube', 398, 100, new URL('../onboarding/assets/video.svg', import.meta.url).href);
      v.show(a2, 10100); v.show(b2, 10400);
      v.cursor([[650, v.edit], [2200, 222, 55], [4200, 222, 131], [8400, clone], [11100, 551, 220, 0]],
        [[1000, v.edit], [2600, 222, 55], [4400, 222, 131], [9500, clone]]);
      saved(11000);
      break;
    }
    case 'history': {
      edit();
      v.move(v.a, [[0, 0, 0], [800, 0, 0], [2600, 224, 148], [4700, 224, 148],
        [6100, 0, 0], [8600, 0, 0], [10300, 224, 148], [12000, 224, 148]]);
      v.during(v.undo, 'is-demo-active', [[4700, 6700]]);
      v.during(v.redo, 'is-demo-active', [[8600, 11000]]);
      v.keys([[4800, 6700, 'Ctrl / ⌘ + Z'], [8600, 11100, 'Ctrl / ⌘ + Shift + Z']]);
      v.cursor([[600, 222, 55], [2600, 446, 203], [4500, v.undo], [8300, v.redo], [11200, 480, 233, 0]],
        [[4700, v.undo], [8600, v.redo]]);
      break;
    }
    case 'appearance': {
      edit();
      const panel = v.panel(title('appearance'), 140, 32, 415);
      panel.node.classList.add('has-demo-preview');
      const swatches = v.row(panel, label('color'), '●  ●  ●');
      const preview = v.bookmark('Gmail', 436, 112, new URL('../onboarding/assets/mail.svg', import.meta.url).href);
      preview.style.zIndex = '7';
      const previewTrack = [[0, { backgroundColor: '#17263b' }], [4200, { backgroundColor: '#17263b' }],
        [6200, { backgroundColor: '#6a3db0' }], [12000, { backgroundColor: '#6a3db0' }]];
      v.track(preview, previewTrack, 'style-preview');
      v.show(panel.node, 2900, 9900);
      v.show(preview, 3300, 9900);
      v.row(panel, t('editModal.name'), 'Gmail');
      const save = v.action(panel, t('buttons.save'));
      v.during(swatches, 'is-demo-active', [[5000]]);
      v.track(v.a, [[0, { backgroundColor: '#17263b' }], [10000, { backgroundColor: '#17263b' }],
        [10400, { backgroundColor: '#6a3db0' }], [12000, { backgroundColor: '#6a3db0' }]], 'saved-style');
      const pencil = v.a.querySelector('.manual-demo-pencil');
      v.cursor([[800, v.edit], [2400, pencil], [4600, swatches], [8500, save], [11200, 555, 225, 0]],
        [[1000, v.edit], [2800, pencil], [5400, swatches], [9800, save]]);
      saved(10800);
      break;
    }
    case 'presets': {
      const general = settings('bookmark', 1200, 3700);
      const configure = v.action(general, t('settingsModal.bookmark.configure'));
      const library = v.panel(t('settingsModal.bookmark.presets.title'), 140, 32, 415);
      library.node.classList.add('has-demo-preview');
      const name = v.row(library, t('settingsModal.bookmark.presets.name'));
      v.type(name, label('styleName'), 4300, 5500);
      const saveStyle = v.action(library, t('settingsModal.bookmark.presets.save'));
      v.show(library.node, 3900, 8600);
      const preview = v.bookmark('Gmail', 436, 101, new URL('../onboarding/assets/mail.svg', import.meta.url).href);
      preview.style.zIndex = '7';
      v.track(preview, [[0, { backgroundColor: '#6a3db0' }], [12000, { backgroundColor: '#6a3db0' }]]);
      v.show(preview, 3900, 8600);
      const loadPanel = v.panel(t('settingsModal.bookmark.presets.saved'));
      v.row(loadPanel, label('styleName'), '●');
      const load = v.action(loadPanel, t('settingsModal.bookmark.presets.apply'), false);
      const save = v.action(loadPanel, t('buttons.save'));
      v.show(loadPanel.node, 8900, 10600);
      const next = v.bookmark('New DeskTab', 398, 26);
      v.track(next, [[0, { backgroundColor: '#6a3db0' }], [12000, { backgroundColor: '#6a3db0' }]]);
      v.show(next, 11100);
      v.cursor([[600, v.settings], [2900, configure], [4700, name], [7200, saveStyle], [9200, load],
        [10000, save], [11600, 555, 225, 0]],
      [[1200, v.settings], [3600, configure], [7500, saveStyle], [9500, load], [10500, save]]);
      break;
    }
    case 'wallpapers': {
      const panel = settings('theme', 1400, 9600);
      const wallpapers = v.row(panel, label('wallpaper'), '●  ●  ●');
      const rotation = v.row(panel, label('rotation'), '30 s');
      const save = v.action(panel, t('buttons.save'));
      v.track(v.wallpaper, [[0, { opacity: 0 }], [4800, { opacity: 0 }], [6600, { opacity: 1 }],
        [12000, { opacity: 1 }]], 'wallpaper');
      v.cursor([[650, v.settings], [2800, wallpapers], [6100, rotation], [8800, save], [11100, 550, 225, 0]],
        [[1300, v.settings], [4700, wallpapers], [9500, save]]);
      saved();
      break;
    }
    case 'clock': {
      const menuItem = addMenu(topic);
      const panel = v.panel(t('clock.name'));
      v.row(panel, label('format'), '24 h');
      const seconds = v.row(panel, label('seconds'), '✓');
      v.row(panel, t('settingsModal.bookmark.preview'), '14:32:08');
      const add = v.action(panel, t('buttons.add'));
      v.show(panel.node, 3800, 9500);
      const clock = v.place(demoElement('div', 'manual-demo-clock clock-widget'), 286, 174, 210, 62);
      const face = demoElement('div', 'clock-widget-face');
      const config = { hourCycle: '24', showSeconds: true };
      const time = createClockTimeElement(config);
      updateClockTimeElement(time, config, new Date(2026, 0, 1, 14, 32, 8));
      face.append(time);
      clock.append(face);
      v.show(clock, 10100);
      v.cursor([[650, v.add], [2400, menuItem], [5300, seconds], [8400, add], [11000, 550, 222, 0]],
        [[1400, v.add], [2900, menuItem], [9500, add]]);
      saved(10800, 62, 203);
      break;
    }
    case 'interface': {
      const panel = settings('general', 1400, 10000);
      const language = v.row(panel, label('language'), label('system'));
      v.type(language, label('currentLanguage'), 2300, 3300);
      const theme = v.row(panel, t('settingsModal.general.appearance.title'));
      theme.className = 'manual-demo-choice-group';
      const light = demoElement('button', 'manual-demo-choice', t('settingsModal.general.appearance.light'));
      const dark = demoElement('button', 'manual-demo-choice', t('settingsModal.general.appearance.dark'));
      light.type = dark.type = 'button';
      theme.append(light, dark);
      v.during(dark, 'is-demo-active', [[0, 5600]]);
      v.during(light, 'is-demo-active', [[5600]]);
      const save = v.action(panel, t('buttons.save'));
      v.during(panel.node, 'is-demo-light', [[5600]]);
      v.during(v.scene, 'is-demo-light', [[5600]]);
      v.cursor([[650, v.settings], [2500, language], [5100, light], [5800, light], [9100, save], [11100, 550, 222, 0]],
        [[1300, v.settings], [2900, language], [5600, light], [9900, save]]);
      saved(10500);
      break;
    }
    case 'trash': {
      v.show(v.a, 0, 1);
      const panel = v.panel(t('onboarding.demo.trash'));
      const item = v.row(panel, 'Gmail', 'mail.google.com');
      const restore = v.action(panel, label('restore'));
      v.show(panel.node, 1700, 7400);
      v.during(item.parentElement, 'is-demo-selected', [[4200]]);
      // A separate item appears only after the illustrated Restore action.
      const restored = v.bookmark('Gmail', 174, 26, new URL('../onboarding/assets/mail.svg', import.meta.url).href);
      v.show(restored, 7700);
      const retention = settings('general', 9100);
      v.row(retention, t('settingsModal.general.recycleBin.retentionLabel'), t('settingsModal.general.recycleBin.retentionOptions.sevenDays'));
      v.cursor([[650, v.trash], [2500, item.parentElement], [4100, item.parentElement], [6600, restore], [8300, v.settings], [10900, 490, 110, 0]],
        [[1600, v.trash], [4200, item.parentElement], [7300, restore], [9000, v.settings]]);
      break;
    }
    case 'backup': {
      const panel = settings('general', 1200);
      const exportButton = v.action(panel, t('settingsModal.general.export'));
      const importButton = v.action(panel, t('settingsModal.general.import'), false);
      const zip = v.place(demoElement('div', 'manual-demo-file', 'NewDeskTab.zip'), 324, 197, 218, 41);
      v.show(zip, 5800, 9000);
      v.during(exportButton, 'is-demo-active', [[4000, 6500]]);
      const confirm = v.panel(label('restoreCopy'), 156, 89, 370);
      v.row(confirm, label('copy'), 'NewDeskTab.zip');
      v.action(confirm, t('buttons.cancel'), false);
      v.action(confirm, t('buttons.accept'));
      v.show(confirm.node, 10100);
      v.cursor([[650, v.settings], [2700, exportButton], [4400, exportButton], [7900, importButton], [11000, 410, 159, 0]],
        [[1200, v.settings], [4900, exportButton], [9400, importButton]]);
      break;
    }
    case 'sync': {
      const panel = settings('sync', 1200);
      const local = v.row(panel, t('settingsModal.sync.usage.local'), '◉');
      const synced = v.row(panel, t('settingsModal.sync.synced.title'), '○');
      v.during(local.parentElement, 'is-demo-active', [[1200, 9000]]);
      v.during(synced.parentElement, 'is-demo-active', [[9000]]);
      const confirm = v.panel(label('switchSync'), 160, 83, 380);
      v.row(confirm, label('applyNow'), '✓');
      const accept = v.action(confirm, t('buttons.accept'));
      v.show(confirm.node, 4300, 8300);
      v.type(local, '○', 9000, 9001);
      v.type(synced, '◉', 9000, 9001);
      const status = v.row(panel, label('status'), label('synchronized'));
      v.show(status.parentElement, 9300);
      v.cursor([[650, v.settings], [2900, synced.parentElement], [5200, accept], [7800, accept], [10900, 550, 224, 0]],
        [[1200, v.settings], [4200, synced.parentElement], [8200, accept]]);
      saved(10300);
      break;
    }
    case 'compact': {
      v.scene.classList.add('is-demo-compact');
      const window = v.place(demoElement('div', 'manual-demo-compact-window'), 0, 0, 600, 300);
      const surface = demoElement('div', 'manual-demo-compact-surface');
      const items = [v.trash, v.folder, v.a, v.b, v.c];
      items.forEach((item, index) => item.style.setProperty('--manual-list-row', index));
      surface.append(v.wallpaper, v.grid, v.brand, ...items, v.dock, v.toolbar,
        demoElement('strong', 'manual-demo-compact-heading', t('workspace.main')));
      window.append(surface);
      v.track(window, [[0, { left: '0px', width: '600px' }], [2000, { left: '0px', width: '600px' }],
        [4200, { left: '150px', width: '300px' }], [7600, { left: '150px', width: '300px' }],
        [10000, { left: '0px', width: '600px' }], [12000, { left: '0px', width: '600px' }]], 'window-width');
      v.during(v.scene, 'is-demo-window-resizing', [[2000, 4200], [7600, 10000]]);
      v.cursor([[700, 595, 150], [2000, 595, 150], [4200, 450, 150], [7600, 450, 150],
        [10000, 595, 150], [11300, 550, 200, 0]], [[2000, 595, 150], [7600, 450, 150]]);
      break;
    }
    case 'data': {
      const before = dataLocale?.before ?? t;
      const after = dataLocale?.after ?? t;
      const resetAt = 4800;
      const deleteAt = 9950;
      const lightWindows = dataLocale?.systemLight ? [[0]] : [[0, resetAt]];
      v.scene.classList.add('is-demo-data');
      v.during(v.scene, 'is-demo-light', lightWindows);
      v.track(v.wallpaper, [[0, { opacity: 1 }], [resetAt, { opacity: 1 }],
        [5350, { opacity: 0 }], [12000, { opacity: 0 }]], 'reset-wallpaper');
      v.track(v.brand, [[0, { opacity: 0 }], [resetAt, { opacity: 0 }],
        [5350, { opacity: .45 }], [12000, { opacity: .45 }]], 'default-wordmark');
      const cards = [[v.a, 174, 26, 210, 62, { backgroundImageUrl: new URL('../onboarding/assets/multimedia-landscape.svg', import.meta.url).href }],
        [v.b, 174, 100, 98, 136, { backgroundImageUrl: new URL('../../assets/images/information-cosmos.png', import.meta.url).href }],
        [v.c, 286, 100, 98, 62, { backgroundColor: '#6a3db0' }]];
      for (const [original, x, y, width, height, style] of cards) {
        const card = v.bookmark(original.dataset.demoItem, x, y, original.querySelector('img').src, style);
        Object.assign(card.style, { width: `${width}px`, height: `${height}px`, backgroundColor: 'var(--color-bg-bookmark)' });
        card.style.setProperty('--bookmark-context-text', '#f1f5f9');
        if (style.backgroundImageUrl) card.style.backgroundImage = 'linear-gradient(#0005, #0005), var(--bookmark-bg-image)';
        original.remove();
        v.show(card, 0, deleteAt);
      }
      v.folder.style.left = '62px';
      v.folder.style.top = '100px';
      v.show(v.folder, 0, deleteAt);
      for (const [node, key] of [[v.trash.lastElementChild, 'onboarding.demo.trash'], [v.workspace, 'workspace.main']]) {
        v.textAt(node, [[0, before(key)], [resetAt, after(key)]]);
      }
      const general = v.panel('', 220, 34, 365);
      const translated = (node, key) => v.textAt(node, [[0, before(key)], [resetAt, after(key)]]);
      v.textAt(general.node.querySelector('.manual-demo-panel-title'),
        [[0, `${before('manual.demo.labels.settings')} › ${before('settingsModal.sections.general')}`],
          [resetAt, `${after('manual.demo.labels.settings')} › ${after('settingsModal.sections.general')}`]]);
      const language = v.row(general, '');
      translated(language.parentElement.firstElementChild, 'settingsModal.sections.language');
      v.textAt(language, [[0, before('manual.demo.labels.currentLanguage')], [resetAt, after('settingsModal.languages.system')]]);
      const theme = v.row(general, '');
      translated(theme.parentElement.firstElementChild, 'settingsModal.general.appearance.title');
      theme.className = 'manual-demo-choice-group';
      const system = demoElement('span', 'manual-demo-choice');
      const light = demoElement('span', 'manual-demo-choice');
      translated(system, 'settingsModal.general.appearance.system');
      translated(light, 'settingsModal.general.appearance.light');
      theme.append(system, light);
      v.during(light, 'is-demo-active', [[0, resetAt]]);
      v.during(system, 'is-demo-active', [[resetAt]]);
      const reset = v.action(general, '', false);
      const remove = v.action(general, '', false);
      translated(reset, 'settingsModal.general.resetSettings');
      translated(remove, 'settingsModal.general.deleteAllData');
      v.track(general.node, [[0, { opacity: 0 }], [1550, { opacity: 0 }], [1800, { opacity: 1 }],
        [5200, { opacity: 1 }], [5450, { opacity: 0 }], [7000, { opacity: 0 }], [7250, { opacity: 1 }],
        [10100, { opacity: 1 }], [10350, { opacity: 0 }], [12000, { opacity: 0 }]], 'data-settings');
      v.during(general.node, 'is-demo-light', lightWindows);
      const confirmation = (translate, action, message, start, end, lightWindows) => {
        const panel = v.panel(translate(`settingsModal.general.${action}`), 166, 74, 370);
        panel.body.append(demoElement('p', 'manual-demo-confirm-message', message));
        v.action(panel, translate('buttons.cancel'), false);
        const accept = v.action(panel, translate('buttons.accept'));
        v.show(panel.node, start, end);
        v.during(panel.node, 'is-demo-light', lightWindows);
        return accept;
      };
      const acceptReset = confirmation(before, 'resetSettings', before('alert.settings.reset'), 3900, resetAt, lightWindows);
      const acceptDelete = confirmation(after, 'deleteAllData', after('manual.demo.labels.deleteExample'),
        8800, deleteAt, dataLocale?.systemLight ? [[0]] : []);
      v.cursor([[650, v.settings], [1400, v.settings], [3000, reset], [3700, reset], [4500, acceptReset],
        [resetAt, acceptReset], [6100, 540, 230], [7000, v.settings], [7800, remove], [8500, remove],
        [9500, acceptDelete], [deleteAt, acceptDelete], [11100, 510, 220, 0]],
      [[1400, v.settings], [3700, reset], [resetAt, acceptReset], [7000, v.settings], [8500, remove], [deleteAt, acceptDelete]]);
      break;
    }
    case 'learning': {
      const tip = v.panel(t('manual.daily.eyebrow'), 290, 129, 280);
      v.row(tip, title('keyboard'), 'Tab → Enter');
      const read = v.action(tip, t('manual.daily.read'));
      v.show(tip.node, 750, 4550);
      v.move(tip.node, [[0, 310, 0], [750, 0, 0], [3800, 0, 0], [4800, 310, 0], [12000, 310, 0]]);
      // The click belongs to the resting tip, even when seeking past its slide-out.
      const readPoint = () => ({ x: tip.node.offsetLeft + tip.node.clientLeft + read.offsetLeft + read.offsetWidth / 2,
        y: tip.node.offsetTop + tip.node.clientTop + read.offsetTop + read.offsetHeight / 2 });
      const manual = v.panel(t('manual.title'), 150, 38, 385);
      const search = v.row(manual, t('manual.searchLabel'));
      const query = label('keyboardQuery').slice(0, 4);
      v.type(search, query, 5400, 7100);
      const result = v.row(manual, title('keyboard'), '↗').parentElement;
      // Typing rounds the character count: reveal the result after the fourth character.
      v.show(result, 5400 + (7100 - 5400) * 3.5 / query.length + 250);
      v.during(result, 'is-demo-active', [[9700, 9950]]);
      v.show(manual.node, 5200, 9700);
      const article = v.panel(title('keyboard'), 150, 38, 385);
      article.body.append(demoElement('p', 'manual-demo-confirm-message', t('manual.topics.keyboard.steps.0')));
      v.show(article.node, 10100);
      v.cursor([[1000, readPoint], [3000, readPoint], [3800, readPoint], [4300, 240, 220],
        [5400, search], [7100, search], [9000, result], [9700, result], [11000, 505, 223, 0]],
      [[3800, readPoint], [5400, search], [9700, result]]);
      break;
    }
  }
}

