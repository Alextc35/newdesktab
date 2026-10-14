# Localization

The extension ships 52 locales in `src/domain/settings/languageCatalog.js`.
Language names are native names. The selector also searches localized language
and country names, English names, Spanish names and locale codes. English covers
its regional variants; Spanish, Portuguese and Chinese have separate regional
catalogs. Browser language detection also recognizes Norwegian and Filipino
aliases and Chinese script preferences.

Each locale includes the interface, welcome guide, release notes, manual and
Chrome manifest messages. Latin American Spanish shares the Spanish manual.
All dictionaries are bundled JSON; translating or switching languages never
contacts a translation service. Arabic, Hebrew and Persian use right-to-left
interface text; saved folder grid coordinates keep their physical ordering.

The 48 newly added catalogs were generated with machine translation. Their
completeness, variables and manual destinations are tested; native-speaker
review of wording is still recommended before publishing localized store copy.
Existing English, Spanish and Brazilian Portuguese translations are maintained
separately.

`node scripts/generate-locales.mjs` generates the additional catalogs from
English using Google Translate during development. It preserves brands,
variables and manual destinations, and caches translated strings under
`dist/translation-cache`. It requires network access and does not run in the
extension. Before regenerating a manually edited catalog, update its cached
translation or preserve the edit separately.

`--review` refreshes number templates with concrete example numbers so the
translator can interpret counters correctly, and retries phrases left in
English. Curated wording lives in `scripts/locale-overrides.json`. UI references
in the manual use the same localized names as the corresponding controls.
Invalid correction files or damaged caches stop generation; the Store description
limit is checked after applying curated corrections, before writing locale files.
Manual search uses Unicode word segmentation for Chinese, Japanese and Thai,
and preserves the vowel marks used by Indic scripts.

`npm run check` validates every dictionary and the searchable select behavior.
`npx playwright test tests/e2e/languageSearch.spec.js` also loads all 52 locales
with external requests blocked and checks country search, keyboard selection,
empty results, persistence and the popup layout in light and dark themes.
