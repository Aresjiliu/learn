# Repository Guidelines

## Project Structure

This repository is the native WeChat Mini Program for the “俄语7500” course app. App-wide files are `app.js`, `app.json`, and `app.wxss`; each screen keeps matching `.js`, `.wxml`, `.wxss`, and `.json` files under `pages/`. Shared HTTP behavior is in `utils/request.js`, runtime flags in `config.js`, and visual assets in `images/` or `static/`. Add routes and tab-bar entries in `app.json`.

## Build, Test, and Development

Run `npm ci --ignore-scripts --registry=https://registry.npmjs.org`, then `npm run build:ui` to generate the pinned native Vant components with embedded offline fonts. Import the project with the AppID in `project.config.json`, then use WeChat DevTools **Compile**, **Preview**, or **真机调试**. Do not substitute CLI `build-npm`: this installed version scans nested tooling dependencies.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check_phase1.ps1
```

Before the suite, install the isolated content API environment as documented in `docs/operations/dictionary-service.md`. The suite checks adapters, exams, media, routes, assets, configuration, HTTP contracts, and write guards. `content_server/` serves the indexed read-only dictionary on port 18092; `python scripts/serve_content_api.py` and `python scripts/serve_test_media.py` provide local fixtures only. Use **详情 → 本地设置 → 不校验合法域名** only for local HTTP testing.

## Coding Style and Naming

Use four-space indentation and ES2018-compatible JavaScript. Use `camelCase` for variables and handlers (`loadCourses`, `handleSearch`), lowercase page directories, and matching names such as `pages/course/detail/detail.js`. Keep WXML handlers and `data-*` attributes aligned with page methods.

## Testing

No coverage threshold is configured, but `check_phase1.ps1` must pass before handoff. Manually exercise affected pages and successful/failed network responses, including search, video playback, choice/fill-in exams, empty states, and retries.

## Commits and Pull Requests

Follow the existing short imperative subjects with scopes, such as `fix(course): handle empty results`. PRs should describe user-visible behavior, affected pages/endpoints, verification commands, UI screenshots, and required AppID, domain, or backend changes.

## Security and Configuration

Never commit tokens, private keys, or production credentials. Review `config.js` and `project.private.config.json` before sharing. Keep `enableRemoteWrites=false`; network writes must remain behind `utils/request.js`. Independently review mapping decisions before `prepareCourseWords`; never edit raw exports or production tables.
