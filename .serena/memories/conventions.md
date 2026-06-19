# Conventions

- Domain language from `CONTEXT.md` is authoritative in code, tests, docs, and UI copy.
- User-facing wording: say archive/restore for configurations. Storage uses `isArchived`.
- Product boundary:
  - Web app rebuilds Spotify playlists from Spotify source playlists only.
  - DJ library import from Rekordbox/Traktor belongs to the local Flask app in `../spotify-playlist-builder`.
  - Browser storage is local to the current browser; backups replace snapshots and do not merge.
- Preview vs rebuild:
  - Preview reads source playlist tracks and selects the target track set without writing.
  - Rebuild applies an accepted preview and replaces the target playlist contents.
- Percent mode requires source percentages to total 100 before largest-remainder integer allocation.
- Change ownership rules:
  - UI behavior/labels: update `src/App.tsx`, `src/styles.css`, affected tests, and README/docs if workflow changes.
  - Storage shape: update `src/lib/storage.ts`, `src/lib/storage.test.ts`, README, and `docs/ARCHITECTURE.md`.
  - Spotify scopes/OAuth: update `src/lib/spotifyAuth.ts`, README, and `docs/ARCHITECTURE.md`.
  - Spotify API behavior: update `src/lib/spotifyApi.ts`, affected service/UI tests, and docs when user-visible.
  - Rebuild selection behavior: update `src/lib/rebuildEngine.ts`, `src/lib/rebuildEngine.test.ts`, `src/lib/rebuildContractCases.test.ts`, `src/lib/__fixtures__/rebuildContractCases.json`, and local Flask fixture at `../spotify-playlist-builder/tests/fixtures/rebuild_contract_cases.json`.
- Keep docs concise and grounded in current files; prefer updating existing docs over adding overlapping pages.
- Never log, print, commit, or include real OAuth tokens, PKCE state, `.env` values, or browser storage exports in docs/examples.