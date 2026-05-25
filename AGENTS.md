# Agent Instructions

Spotify Playlist Builder Web App is the static React/Vite browser version of the playlist builder. Optimize for small, evidence-backed changes that preserve browser-only operation, Spotify PKCE authorization, browser storage, and alignment with the local Flask app's rebuild contract.

## Response Style

Default response style is caveman lite.

- Use concise full sentences.
- Remove filler and vague hedging.
- Preserve exact technical substance.
- Keep code, commands, commits, and PR text normal unless the user asks otherwise.
- Stop only when the user says `stop caveman` or `normal mode`.

## Rules

- Keep the app static and browser-only. Do not add a backend service, server-side token store, database, or server-side user account model unless the user explicitly asks for that direction.
- Keep Spotify OAuth on Authorization Code with PKCE. Do not add a Spotify client secret.
- Never log, print, commit, or include real OAuth tokens, PKCE state, `.env` values, or browser storage exports in docs or examples.
- Keep Spotify auth and token refresh in `src/lib/spotifyAuth.ts`.
- Keep Spotify Web API calls in `src/lib/spotifyApi.ts`.
- Keep shared rebuild selection behavior in `src/lib/rebuildEngine.ts` and preserve contract alignment with the local Flask app.
- Keep browser snapshot parsing, persistence, backup export, and backup import in `src/lib/storage.ts`.
- Do not add DJ library import to this app without an explicit product decision. Rekordbox and Traktor parsing remain local Flask app responsibilities.
- Do not edit generated or dependency output by hand: `dist/`, `node_modules/`, `.pytest_cache/`, coverage output, and `*.tsbuildinfo`.
- Prefer updating existing docs over adding overlapping pages.

## Repo Map

- `src/App.tsx`: single-page React UI, Spotify session orchestration, configuration editing, previews, rebuild writes, history, and backup import/export.
- `src/main.tsx`: React entry point.
- `src/styles.css`: application styling.
- `src/lib/types.ts`: shared TypeScript domain types.
- `src/lib/configuration.ts`: configuration defaults and validation.
- `src/lib/storage.ts`: browser snapshot storage, backup export/import parsing, archive state, and rebuild history persistence.
- `src/lib/spotifyAuth.ts`: Spotify Authorization Code with PKCE, token storage, token refresh, and redirect handling.
- `src/lib/spotifyApi.ts`: Spotify Web API calls for account playlists, target playlist creation, source track reads, and target playlist writes.
- `src/lib/rebuildEngine.ts`: random and percent rebuild selection, deduplication, local/unavailable track skipping, allocation counts, and previews.
- `src/lib/rebuildService.ts`: source playlist loading, preview preparation, and target playlist replacement coordination.
- `src/lib/history.ts`: rebuild history entries and user-facing summaries.
- `src/lib/__fixtures__/rebuildContractCases.json`: mirrored rebuild contract fixture shared with the local Flask app.
- `src/lib/*.test.ts`: Vitest coverage for storage, rebuild behavior, and contract fixtures.
- `.github/workflows/deploy.yml`: GitHub Pages build and deploy workflow.
- `vite.config.ts`: Vite and Vitest configuration, including relative static asset base.
- `package.json`: npm scripts and dependency manifest.
- `README.md`: human setup, usage, development, deployment, and app-boundary notes.
- `CONTEXT.md`: project language and product boundaries.
- `docs/ARCHITECTURE.md`: current architecture and runtime assumptions.

## Common Commands

Install dependencies:

```bash
npm install
```

Run the local dev server:

```bash
npm run dev
```

Run tests:

```bash
npm test
```

Run a production build check:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

Run the rebuild contract test only:

```bash
npm run test -- src/lib/rebuildContractCases.test.ts
```

## Runtime State And No-Touch Files

Do not commit secrets, browser exports, generated output, or dependencies:

- `.env`
- `.env.local`
- downloaded `spotify-playlist-builder-backup-*.json` files
- `dist/`
- `node_modules/`
- `coverage/`
- `.pytest_cache/`
- `*.tsbuildinfo`
- `.DS_Store`

Tracked examples and generated manifests are safe to edit intentionally:

- `.env.example`
- `package-lock.json`

## Change Notes

- When changing UI behavior or labels, update `src/App.tsx`, `src/styles.css`, tests when behavior changes, and `README.md` or `docs/ARCHITECTURE.md` if the workflow changes.
- When changing browser storage shape, update `src/lib/storage.ts`, `src/lib/storage.test.ts`, `README.md`, and `docs/ARCHITECTURE.md`.
- When changing Spotify scopes or OAuth behavior, update `src/lib/spotifyAuth.ts`, `README.md`, and `docs/ARCHITECTURE.md`.
- When changing Spotify API behavior, update `src/lib/spotifyApi.ts`, affected UI/service tests, and docs when user-visible behavior changes.
- When changing rebuild selection behavior, update `src/lib/rebuildEngine.ts`, `src/lib/rebuildEngine.test.ts`, `src/lib/rebuildContractCases.test.ts`, `src/lib/__fixtures__/rebuildContractCases.json`, and the local Flask fixture at `../spotify-playlist-builder/tests/fixtures/rebuild_contract_cases.json`.
- After changing the mirrored rebuild fixture, run `npm test` here and `python3 -m pytest tests/test_rebuild_contract.py tests/test_rebuild_contract_fixture_sync.py -q` in `../spotify-playlist-builder`.
- Keep documentation concise and grounded in current repo files. Prefer updating existing docs over adding overlapping pages.
