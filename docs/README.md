# New DeskTab documentation

[Project home](../README.md) · [User guide](guide/USER_GUIDE.md) · [Contributing](../CONTRIBUTING.md)

Start here for a closer look at the extension. The main README introduces the
product; these guides explain everyday use, implementation, maintenance and
release procedures. All documentation is maintained in English.

The current release is **1.1.0**, with public data schema **2**. Its user guide
covers Chrome/HTML import into Main, nested folders and navigation for large
collections. The schema-1 migration is automatic; versioned audit reports below
retain their original findings.

## Find what you need

| I want to… | Read this |
| --- | --- |
| Organize and personalize my new tab | [User guide](guide/USER_GUIDE.md) |
| Understand the code and find where to make a change | [Technical project guide](architecture/PROJECT_GUIDE.md) |
| Check responsibilities, contracts and dependency rules | [Architecture reference](architecture/ARCHITECTURE.md) |
| Set up development, run tests or diagnose a problem | [Development and diagnostics](development/DEVELOPMENT.md) |
| Maintain interface and manual translations | [Localization](development/LOCALIZATION.md) |
| Package the extension and prepare its store listing | [Chrome Web Store submission](releases/CHROME_WEB_STORE.md) |
| Add release notes displayed inside the app | [Release notes maintenance](releases/RELEASE_NOTES.md) |
| Understand how data is handled | [Privacy policy](../PRIVACY.md) |

## Documentation layout

```text
docs/
├── guide/          Using the extension, customization and data
├── architecture/   Runtime, models and boundaries between layers
├── development/    Setup, tests, diagnostics and localization
├── releases/       Packaging, release notes and release reviews
└── benchmarks/     Methods, measurements and historical audit reports
```

Commands and code paths are relative to the repository root unless a guide says
otherwise. The project guide walks through the runtime and common changes;
the architecture reference describes module contracts in greater detail.

## Performance and evidence

| Document | Contents |
| --- | --- |
| [UI performance](benchmarks/UI_PERFORMANCE.md) | Scenarios, methodology and benchmark reproduction. |
| [Action audit](benchmarks/ACTION_AUDIT.md) | Timings, observed coverage and source-cleanup review. |
| [Media backups](benchmarks/BACKUP_MEDIA.md) | JSON and ZIP comparison, timings and sampled memory. |
| [Historical 1.0.0 audit](benchmarks/RELEASE_1_0_0_AUDIT.md) | Product review and results recorded on its stated date. |
| [Structured audit results](benchmarks/RELEASE_1_0_0_RESULTS.json) | Recorded data for inspection and comparison. |

The backup study retains its measurements for the [original JSON format](benchmarks/backup-media.json),
[ZIP format](benchmarks/backup-media-zip.json) and
[ZIP with two videos](benchmarks/backup-media-zip-2-videos.json).

## Release records

- [Changelog](../CHANGELOG.md): the project's recorded changes.
- [Release checklist](releases/RELEASE_CHECKLIST.md): completed release work and
  its recorded verification.
- [Release review](releases/RELEASE_REVIEW.md): the documented 1.0.0 package review
  and supporting evidence.

Dated reports and completed checklist items are historical records. Their numbers
describe the cited run. To validate later changes, run the checks in the
[development guide](development/DEVELOPMENT.md) and follow the
[release procedure](releases/CHROME_WEB_STORE.md#release-procedure).

## Maintaining these guides

Update the guide that owns a behavior when that behavior changes. Link new topics
from this index. Keep measurement dates, source data and limitations visible;
do not replace historical counts with current test results. Keep the main README
focused on what the extension offers and how to get started, with implementation
details in these guides.
