# Contributing to NewDeskTab

Thanks for helping NewDeskTab grow without losing its simplicity.

## Local setup

1. Use Node.js 24 or a compatible current LTS release.
2. Run `npm ci`.
3. Run `npm run check` before and after your change.
4. Load the repository folder from `chrome://extensions` or
   `brave://extensions` with Developer Mode enabled.

For browser journeys, install Chromium once with
`npx playwright install chromium`, then run `npm run test:e2e`.

## Design boundaries

* Keep persistence and the global store out of reusable UI components.
* Put bookmark and folder normalization and validation in their modules under
  `src/domain`; keep persisted-data migrations under `src/platform/storage`.
* Keep `src/state` limited to live state, transient history and persistence
  orchestration; feature and domain rules do not belong there.
* Colocate feature CSS with the module that owns its DOM. Keep only document-wide
  tokens, resets and utilities under `src/styles`.
* Treat imported and synchronized data as untrusted until it crosses
  `migratePersistedData()`.
* Use `BookmarkPreset` for appearance only. Never add identity, grid or timestamp
  fields to a preset.
* Reuse the production bookmark renderer for previews.
* Every event-owning component must clean up its listeners.
* Add a data migration when persisted structures change.
* Keep folders first-class: membership belongs in the model, not in DOM state.

## Tests

Choose the smallest useful layer:

* `node:test` for pure domain, schema, grid and storage behavior.
* Vitest + jsdom for component lifecycle and accessibility behavior.
* Playwright for user-visible journeys across modules.

Avoid asserting private implementation details or large visual snapshots.

## Commits and pull requests

Use focused conventional commits, for example:

```text
fix(editor): remove duplicate URL binding
feat(bookmarks): add named appearance presets
test(storage): cover synchronized quota failure
```

Keep refactors separate from behavior changes when possible. A pull request
should explain its user impact, data-migration impact and how it was tested.
