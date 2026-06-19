# Spotify Playlist Builder Web App

Static browser app version of Spotify Playlist Builder. It is designed to be deployable on GitHub Pages, so it uses Spotify Authorization Code with PKCE, calls Spotify APIs directly from the browser, and keeps saved configurations in browser storage.

This app intentionally supports Spotify playlist configuration and rebuild workflows only. It does not import Rekordbox or Traktor DJ library files. Use the local Flask app when you need DJ library import or saved local library paths.

Use this app when you need a hosted or browser-only playlist rebuild console:

- No backend service, database, or server-side token storage.
- Spotify access and refresh tokens stay in the browser's `localStorage`.
- Saved configurations and rebuild history stay in the browser's `localStorage` and can be exported as a JSON backup.

## Quickstart

Prerequisites:

- Node.js 24, matching the GitHub Pages workflow.
- A Spotify Developer Dashboard app with the local redirect URI registered exactly:

```text
http://localhost:5173/
```

Set up and run the app:

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local` and set `VITE_SPOTIFY_CLIENT_ID`.

Start the local web UI:

```bash
npm run dev
```

Open the Vite URL, usually:

```text
http://localhost:5173/
```

## Features

- Connect Spotify from the browser
- Browse current user playlists
- Create a private target playlist in Spotify
- Save editable playlist configurations
- Archive and restore configurations
- Rebuild previews before writing
- Export and import JSON backups of browser-saved data
- Random and percent selection modes
- Global deduplication across source playlists
- Skip local-only and unavailable Spotify tracks
- Rebuild history per configuration

## Non-goals

- Importing DJ library playlists from Rekordbox or Traktor.
- Reading saved local filesystem paths from the browser.
- Running the Python DJ library parser stack.
- Providing full feature parity with the local Flask app.

## Local persistence

- Configurations and rebuild history are stored under `spotify-playlist-builder.snapshot.v1` in `localStorage`.
- Spotify sessions are stored under `spotify-playlist-builder.spotify-session` in `localStorage`.
- Pending PKCE state is stored under `spotify-playlist-builder.auth-state` in `sessionStorage` while Spotify redirects back.
- Browser-saved data persists across logins on the same browser, but does not sync across browsers or devices.
- The Backup panel exports and imports a versioned JSON snapshot. Importing a backup replaces the current browser snapshot after confirmation.
- If Spotify rejects a refresh token with `invalid_grant`, the app clears the stored Spotify session and requires a fresh login.

## Spotify Authorization

The app uses Spotify Authorization Code with PKCE. It does not use a Spotify client secret.

Requested scopes are defined in `src/lib/spotifyAuth.ts`:

- `playlist-read-private`
- `playlist-read-collaborative`
- `playlist-modify-private`
- `playlist-modify-public`

## Setup

1. Create a Spotify app in the Spotify developer dashboard.
2. Add a redirect URI that matches the app URL exactly.
   - Local dev example: `http://localhost:5173/`
   - GitHub Pages example: `https://<user>.github.io/<repo>/`
3. Copy `.env.example` to `.env.local`.
4. Set `VITE_SPOTIFY_CLIENT_ID`.
5. Install dependencies and start the app:

```bash
npm install
npm run dev
```

## Development

Run tests:

```bash
npm test
```

Run a production build check:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

The Vite build uses `base: "./"` so the static output works under a GitHub Pages project path.

Shared rebuild behavior is checked against the local Flask app through mirrored fixtures:

- Local app fixture: `../spotify-playlist-builder/tests/fixtures/rebuild_contract_cases.json`
- Web app fixture: `src/lib/__fixtures__/rebuildContractCases.json`
- Web app contract test: `src/lib/rebuildContractCases.test.ts`

When changing shared rebuild selection behavior, update both fixtures and run tests in both repositories.

## Relationship To The Local App

The local Flask app is the full desktop-local version. It keeps the DJ library import workflow because that workflow needs filesystem access and Python parser dependencies.

This web app is the lightweight hosted version. Keep rebuild behavior aligned with the local app through contract tests, but keep the product promise narrower.

## Deployment

This repo includes a GitHub Actions workflow for GitHub Pages.

Required repository secret:

- `VITE_SPOTIFY_CLIENT_ID`

The workflow runs on pushes to `main`, installs dependencies with `npm ci`, runs `npm test`, builds with `npm run build`, uploads `dist`, and deploys with GitHub Pages.

Also make sure the Spotify app dashboard includes the final GitHub Pages URL as an allowed redirect URI, including the trailing slash.

## Documentation

- `CONTEXT.md`: project language and product boundaries.
- `AGENTS.md`: repository rules for coding agents.
- `docs/ARCHITECTURE.md`: current browser app architecture.
