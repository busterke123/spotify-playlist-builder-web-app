# Spotify Playlist Builder Web App

Static browser app version of Spotify Playlist Builder. It is designed to be deployable on GitHub Pages, so it uses Spotify Authorization Code with PKCE, calls Spotify APIs directly from the browser, and keeps saved configurations in browser storage.

This app intentionally supports Spotify playlist configuration and rebuild workflows only. It does not import Rekordbox or Traktor DJ library files. Use the local Flask app when you need DJ library import or saved local library paths.

## Features

- Connect Spotify from the browser
- Browse current user playlists
- Create a private target playlist in Spotify
- Save editable playlist configurations
- Archive and restore configurations
- Rebuild previews before writing
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

- Configurations and rebuild history are stored in `localStorage`
- They persist across logins on the same browser
- They do not sync across browsers or devices

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

## Relationship To The Local App

The local Flask app is the full desktop-local version. It keeps the DJ library import workflow because that workflow needs filesystem access and Python parser dependencies.

This web app is the lightweight hosted version. Keep rebuild behavior aligned with the local app through contract tests, but keep the product promise narrower.

## Deployment

This repo includes a GitHub Actions workflow for GitHub Pages.

Required repository secret:

- `VITE_SPOTIFY_CLIENT_ID`

Also make sure the Spotify app dashboard includes the final GitHub Pages URL as an allowed redirect URI.
