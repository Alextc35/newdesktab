/** Build-time translation helper. The extension only reads the resulting local JSON. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LANGUAGE_CATALOG } from '../src/domain/settings/languageCatalog.js';

const root = resolve(import.meta.dirname, '..');
const read = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const save = async (path, value) => {
  const target = resolve(root, path);
  await mkdir(resolve(target, '..'), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};
const ui = await read('src/lang/en.json');
const manual = await read('src/lang/manual/en.json');
const metadata = await read('_locales/en/messages.json');
const overrides = await read('scripts/locale-overrides.json');
const review = process.argv.includes('--review');
const sourceStrings = new Set();
const walk = (value, fn) => typeof value === 'string' ? fn(value)
  : Array.isArray(value) ? value.map(child => walk(child, fn))
    : Object.fromEntries(Object.entries(value).map(([key, child]) => [key, walk(child, fn)]));

for (const tree of [ui, manual, metadata]) walk(tree, text => {
  sourceStrings.add(text);
  for (const match of text.matchAll(/\[\[([a-z-]+)\|([^\]]+)\]\]/gu)) sourceStrings.add(match[2]);
});
sourceStrings.add('Customizable new tab for bookmarks and folders.');
sourceStrings.add('Organize your bookmarks.');
const separator = '\n\uE000\n';
const tokenNames = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE'];
const tokenMarker = index => `__NDT_PLACEHOLDER_${tokenNames[index] ?? index}__`;
const protectionPattern = /\[\[([a-z-]+)\|([^\]]+)\]\]|\{\{\w+\}\}|https?:\/\/[^\s]+|New DeskTab|NewDeskTab|Google Chrome|Twitch|Just Chatting/gu;
const numericVariable = /^\{\{(?:count|\w+Count|current|total|capacity|step|days|used|free|percent|width|height)\}\}$/u;
const digitBases = [0x30, 0x660, 0x6f0, 0x966, 0x9e6, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66, 0xe50, 0xff10];
const normalizeDigits = text => text.replace(/\p{Nd}/gu, digit => {
  const point = digit.codePointAt(0);
  const base = digitBases.find(base => point >= base && point < base + 10);
  return base === undefined ? digit : String(point - base);
});
const markerRegex = marker => new RegExp(/^\d+$/u.test(marker)
  ? marker.split('').join("[\\s,.'’\\u066c]*") : marker, 'giu');

function protect(source) {
  const tokens = [];
  const markers = [];
  const text = source.replace(protectionPattern, value => {
    // Concrete numbers give the translator enough context to translate counters.
    const token = numericVariable.test(value) ? String(90237 + tokens.length * 101) : tokenMarker(tokens.length);
    tokens.push(value);
    markers.push(token);
    return token;
  });
  return { source, text, tokens, markers };
}

async function request(text, target) {
  const params = new URLSearchParams({ client: 'gtx', sl: 'en', tl: target, dt: 't', q: text });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(`https://translate.googleapis.com/translate_a/single?${params}`, {
        signal: AbortSignal.timeout(30_000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      return result[0].map(segment => segment[0] ?? '').join('');
    } catch (error) {
      if (attempt === 4) throw error;
      await new Promise(resolve => setTimeout(resolve, 1500 * 2 ** attempt));
    }
  }
}

async function translateBatch(batch, target, cache) {
  const output = await request(batch.map(entry => entry.text).join(separator), target);
  const parts = output.split(/\s*\uE000\s*/u);
  if (parts.length !== batch.length) {
    if (batch.length === 1) throw new Error(`Invalid translation boundary for ${target}`);
    const middle = Math.ceil(batch.length / 2);
    await translateBatch(batch.slice(0, middle), target, cache);
    await translateBatch(batch.slice(middle), target, cache);
    return;
  }
  for (const [index, entry] of batch.entries()) {
    let translated = normalizeDigits(parts[index].trim());
    for (const [tokenIndex, token] of entry.tokens.entries()) {
      const marker = markerRegex(entry.markers[tokenIndex]);
      if ([...translated.matchAll(marker)].length !== 1) {
        if (batch.length === 1) {
          const pieces = entry.text.split(new RegExp(`(${entry.markers.join('|')})`, 'gu'));
          const translatedPieces = [];
          for (const piece of pieces) {
            const protectedIndex = entry.markers.indexOf(piece);
            translatedPieces.push(protectedIndex >= 0 ? entry.tokens[protectedIndex]
              : piece.trim() ? `${piece.match(/^\s*/u)[0]}${(await request(piece.trim(), target)).trim()}${piece.match(/\s*$/u)[0]}` : piece);
          }
          cache[entry.source] = translatedPieces.join('');
          translated = null;
          break;
        }
        await translateBatch([entry], target, cache);
        translated = null;
        break;
      }
      translated = translated.replace(marker, token);
    }
    if (translated !== null) {
      if (!translated) throw new Error(`Empty translation in ${target}: ${entry.source}`);
      cache[entry.source] = translated;
    }
  }
}

async function generate(language) {
  const { code } = language;
  if (['en', 'es', 'es_419', 'pt_BR'].includes(code)) return;
  const target = ({ zh_CN: 'zh-CN', zh_TW: 'zh-TW', pt_PT: 'pt', fil: 'tl' })[code] ?? code;
  const cachePath = `dist/translation-cache/${code}.json`;
  let cache;
  try { cache = await read(cachePath); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    cache = {};
  }
  if (review) {
    for (const source of sourceStrings) {
      const readable = source.replace(/\{\{\w+\}\}|New DeskTab|Google Chrome|NewDeskTab/gu, '');
      if (/\{\{(?:count|\w+Count|current|total|capacity|step|days|used|free|percent|width|height)\}\}/u.test(source)
        || (cache[source] === source && (readable.match(/[a-z]/giu)?.length ?? 0) > 12)) delete cache[source];
    }
  }
  const pending = [...sourceStrings].filter(text => !cache[text]).map(protect);
  while (pending.length) {
    const batch = [];
    let length = 0;
    while (pending.length && (length + pending[0].text.length < 2800 || !batch.length)) {
      const entry = pending.shift();
      length += entry.text.length + separator.length;
      batch.push(entry);
    }
    await translateBatch(batch, target, cache);
    await save(cachePath, cache);
  }
  Object.assign(cache, overrides[code]?.phrases ?? {});
  await save(cachePath, cache);
  const translate = source => {
    const translated = cache[source];
    if (!translated) throw new Error(`Missing ${code}: ${source}`);
    return translated.replace(/\[\[([a-z-]+)\|([^\]]+)\]\]/gu,
      (_, id, label) => `[[${id}|${cache[label]}]]`);
  };
  const translatedManual = walk(manual, translate);
  translatedManual.demo.labels.currentLanguage = language.name;
  const translatedMetadata = walk(metadata, translate);
  translatedMetadata.extensionName.message = metadata.extensionName.message;
  for (const shorter of ['Customizable new tab for bookmarks and folders.', 'Organize your bookmarks.']) {
    if (translatedMetadata.extensionDescription.message.length <= 132) break;
    translatedMetadata.extensionDescription.message = translate(shorter);
  }
  const translatedUi = walk(ui, translate);
  for (const [section, tree] of [['ui', translatedUi], ['manual', translatedManual], ['metadata', translatedMetadata]]) {
    for (const [path, text] of Object.entries(overrides[code]?.[section] ?? {})) {
      const parts = path.split('.');
      const key = parts.pop();
      const parent = parts.reduce((value, key) => value[key], tree);
      if (typeof parent[key] !== 'string') throw new Error(`Invalid override: ${code}/${path}`);
      parent[key] = text;
    }
  }
  if (translatedMetadata.extensionDescription.message.length > 132) throw new Error(`Long description: ${code}`);
  const terms = {
    Save: 'buttons.save', Cancel: 'buttons.cancel', Close: 'buttons.close', Accept: 'buttons.accept',
    Delete: 'bulk.delete', Main: 'workspace.main', Local: 'localImage.sourceLocal',
    Synced: 'settingsModal.sync.synced.title', Widgets: 'launcher.widgets', Clock: 'clock.name',
    Settings: 'settingsModal.general.subtitle', Theme: 'settingsModal.sections.theme',
    Help: 'settingsModal.sections.help', General: 'settingsModal.general.title',
    Synchronization: 'settingsModal.sections.sync', Bookmarks: 'settingsModal.sections.bookmark',
    None: 'settingsModal.bookmark.drag.none.title', Smooth: 'settingsModal.bookmark.resize.smooth.title',
    Relocation: 'settingsModal.bookmark.drag.relocate.title', Cascade: 'settingsModal.bookmark.drag.cascade.title',
    Undo: 'workspace.undo', Redo: 'workspace.redo', Move: 'itemEditor.icons.ui-movement'
  };
  terms['Reset shortcuts'] = 'settingsModal.shortcuts.reset';
  terms.Sync = 'settingsModal.sections.sync';
  const glossary = Object.entries(terms).map(([term, path]) => [term,
    path.split('.').reduce((value, key) => value?.[key], translatedUi)]).filter(([term, text]) => text && text !== term);
  if (translatedManual.daily.read !== 'Show me how') glossary.unshift(['Show me how', translatedManual.daily.read]);
  const harmonize = text => text.split(/(\{\{\w+\}\}|\[\[[a-z-]+\|)/gu).map(piece => {
    if (/^(?:\{\{|\[\[)/u.test(piece)) return piece;
    for (const [term, translation] of glossary) {
      piece = piece.replace(new RegExp(`(?<![A-Za-z-])${term}(?![A-Za-z-])`, 'gu'), translation);
    }
    return piece;
  }).join('');
  const finalUi = walk(translatedUi, harmonize);
  const finalManual = walk(translatedManual, harmonize);
  finalManual.demo.topics.learning[1] = finalManual.demo.topics.learning[1]
    .replace(/keyb/gu, finalManual.demo.labels.keyboardQuery);
  await save(`src/lang/${code}.json`, finalUi);
  await save(`src/lang/manual/${code}.json`, finalManual);
  await save(`_locales/${code}/messages.json`, translatedMetadata);
  console.log(`${code}: interface, manual and metadata complete (${Object.keys(cache).length} strings)`);
}

const queue = [...LANGUAGE_CATALOG];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) await generate(queue.shift());
}));
