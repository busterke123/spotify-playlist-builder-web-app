# Spotify Playlist Builder Web App Context

This repository has one domain context: a static browser tool that turns saved playlist-building intent into Spotify playlist writes. Use these terms consistently in code, tests, docs, and UI copy.

## Language

### Playlist Building

**Configuration**:
A saved browser-side rebuild setup. It contains one target playlist, one or more source playlists, a requested track count, a selection mode, optional source percentages, and archive state.
_Avoid_: recipe, job, server config.

**Active configuration**:
A configuration whose `isArchived` flag is false. Active configurations can be edited, previewed, and rebuilt.
_Avoid_: enabled config.

**Archived configuration**:
A configuration whose `isArchived` flag is true. Archived configurations remain in the browser snapshot and can be restored.
_Avoid_: deleted config.

**Target playlist**:
The Spotify playlist that a rebuild will replace. The app can also create a new private target playlist before saving a configuration.
_Avoid_: destination playlist unless describing a generic data flow.

**Source playlist**:
A Spotify playlist that contributes tracks to a rebuild configuration. One configuration has one or more source playlists.
_Avoid_: input playlist.

**Rebuild preview**:
The browser-side result produced after reading source playlist tracks and selecting the target track set, before writing to Spotify.
_Avoid_: dry run when referring to the UI object.

**Rebuild**:
The operation that applies a rebuild preview by replacing the target Spotify playlist contents.
_Avoid_: sync, import.

**Selection mode**:
The configured strategy used to choose rebuild tracks. Supported values are `random` and `percent`.
_Avoid_: algorithm when referring to the user-facing option.

**Source percentages**:
Per-source numeric weights used by `percent` selection mode. The app requires the percentages to total 100 and converts them into integer track counts with largest-remainder allocation.
_Avoid_: exact counts.

**Rebuild history**:
The per-configuration list of the most recent rebuild outcomes stored in browser storage. The app keeps up to 10 history entries per configuration.
_Avoid_: audit log; it is local browser state, not durable server history.

### Browser State And Authorization

**Browser snapshot**:
The JSON object stored under `spotify-playlist-builder.snapshot.v1` in `localStorage`. It contains configurations and rebuild history.
_Avoid_: database, backend state.

**Snapshot backup**:
A versioned JSON file exported from the browser snapshot and imported later to replace the current browser snapshot after confirmation.
_Avoid_: sync file; backups do not merge across devices.

**Spotify session**:
The access token, refresh token, expiry, and scope string stored under `spotify-playlist-builder.spotify-session` in `localStorage`.
_Avoid_: server session.

**Pending auth state**:
The PKCE state and verifier stored under `spotify-playlist-builder.auth-state` in `sessionStorage` while Spotify redirects back.
_Avoid_: token cache.

**PKCE authorization**:
The Spotify Authorization Code with PKCE flow used by the browser app. It does not use a Spotify client secret.
_Avoid_: client credentials, implicit auth.

**Static deployment**:
A browser-only deployment, usually GitHub Pages, where compiled files in `dist/` are served without an application server.
_Avoid_: hosted backend.

### App Boundary

**Local Flask app**:
The separate full local product in `../spotify-playlist-builder`. It owns DJ library import, filesystem paths, local token files, file locks, logs, and Flask API routes.
_Avoid_: upstream service; the browser app does not call it.

**Rebuild contract fixture**:
The mirrored JSON fixture used by both apps to keep shared rebuild selection behavior aligned.
_Avoid_: product parity test; DJ library import is intentionally outside the contract.

## Flagged Ambiguities

**Rebuild vs import**:
The web app only rebuilds Spotify playlists from Spotify source playlists. DJ library import from Rekordbox or Traktor belongs to the local Flask app.

**Archive vs delete**:
The web app stores archived configurations with `isArchived: true`. User-facing docs and UI should say archive/restore because records remain recoverable.

**Preview vs rebuild**:
Preview reads sources and selects tracks without writing. Rebuild applies an accepted preview and replaces the target playlist contents.

**Browser storage vs account storage**:
Configurations, rebuild history, and sessions are stored in the current browser, not in Spotify and not in a backend. Backups replace snapshots; they do not merge.

**Playlist ID vs playlist reference**:
The web app stores Spotify playlist IDs selected from the user's account playlists. The local Flask app accepts broader playlist references such as URLs, URIs, and IDs.

## Example Dialogue

Developer: "Can we add Rekordbox import to the web app?"

Domain expert: "Not in the current product boundary. The static app cannot read saved local library paths or run the Python parser stack. Use the local Flask app for DJ library import."

Developer: "When a user starts a rebuild, do we write immediately?"

Domain expert: "No. First prepare a rebuild preview from source playlist tracks. The user applies that preview to replace the target playlist."

Developer: "Are configurations saved to Spotify?"

Domain expert: "No. Configurations and rebuild history live in browser storage. Export a snapshot backup when the user needs a portable copy."

Developer: "Should percent mode accept totals other than 100?"

Domain expert: "No. The browser app validates that source percentages total 100, then allocates integer track counts with largest-remainder rounding."
