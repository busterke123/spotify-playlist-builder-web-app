import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactElement } from "react";
import {
  createEmptyConfiguration,
  selectionModeLabels,
  validateConfiguration
} from "./lib/configuration";
import { createHistoryEntry, historySummary } from "./lib/history";
import { applyPreview, preparePreview } from "./lib/rebuildService";
import { createPlaylist, fetchCurrentUserPlaylists } from "./lib/spotifyApi";
import {
  beginSpotifyLogin,
  clearStoredSession,
  completeSpotifyLoginIfPresent,
  getRedirectURI,
  getSpotifyClientID,
  loadStoredSession,
  storeSession
} from "./lib/spotifyAuth";
import {
  createSnapshotBackup,
  loadSnapshot,
  parseSnapshotBackup,
  persistSnapshot,
  recordRebuildHistory,
  saveConfiguration,
  setArchiveState
} from "./lib/storage";
import type {
  ConfigurationRebuildState,
  ConfigurationStoreSnapshot,
  PlaylistConfigurationDraft,
  PlaylistRebuildPreview,
  PlaylistSummary,
  RebuildHistoryEntry,
  SpotifySession
} from "./lib/types";
import { clamp, formatDateTime } from "./lib/utils";

type PickerMode = "target" | "sources";

interface EditorState {
  draft: PlaylistConfigurationDraft;
  validationIssues: string[];
  saveError: string | null;
  pickerMode: PickerMode | null;
  isCreatingTargetPlaylist: boolean;
}

function initialEditorState(configuration?: PlaylistConfigurationDraft): EditorState {
  return {
    draft: configuration ? structuredClone(configuration) : createEmptyConfiguration(),
    validationIssues: [],
    saveError: null,
    pickerMode: null,
    isCreatingTargetPlaylist: false
  };
}

function byArchiveState(
  configurations: PlaylistConfigurationDraft[],
  isArchived: boolean
): PlaylistConfigurationDraft[] {
  return configurations.filter((configuration) => configuration.isArchived === isArchived);
}

function renderRebuildState(state: ConfigurationRebuildState): string | null {
  switch (state.type) {
    case "idle":
      return null;
    case "preparing-preview":
    case "rebuilding":
      return state.step;
    case "succeeded":
    case "failed":
      return state.message;
  }
}

function allocationWasRebalanced(allocation: PlaylistRebuildPreview["sourceAllocations"][number]): boolean {
  return allocation.requestedTrackCount !== null && allocation.requestedTrackCount !== allocation.selectedTrackCount;
}

export function App(): ReactElement {
  const [snapshot, setSnapshot] = useState<ConfigurationStoreSnapshot>(() => loadSnapshot());
  const [session, setSession] = useState<SpotifySession | null>(() => loadStoredSession());
  const [isResolvingSession, setIsResolvingSession] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [playlistCache, setPlaylistCache] = useState<PlaylistSummary[]>([]);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [previewState, setPreviewState] = useState<{
    configuration: PlaylistConfigurationDraft;
    preview: PlaylistRebuildPreview;
    isApplying: boolean;
    progressMessage: string | null;
  } | null>(null);
  const [historyConfigurationID, setHistoryConfigurationID] = useState<string | null>(null);
  const [statesByConfigurationID, setStatesByConfigurationID] = useState<Record<string, ConfigurationRebuildState>>({});
  const [activeConfigurationID, setActiveConfigurationID] = useState<string | null>(null);
  const [showsAccountPanel, setShowsAccountPanel] = useState(false);
  const backupImportInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    persistSnapshot(snapshot);
  }, [snapshot]);

  useEffect(() => {
    void (async () => {
      try {
        const nextSession = await completeSpotifyLoginIfPresent();
        if (nextSession) {
          setSession(nextSession);
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Spotify sign-in failed.");
      } finally {
        setIsResolvingSession(false);
      }
    })();
  }, []);

  const activeConfigurations = useMemo(
    () => byArchiveState(snapshot.configurations, false),
    [snapshot.configurations]
  );
  const archivedConfigurations = useMemo(
    () => byArchiveState(snapshot.configurations, true),
    [snapshot.configurations]
  );

  const configurationHistory = (configurationID: string): RebuildHistoryEntry[] =>
    snapshot.rebuildHistoryByConfigurationID[configurationID] ?? [];

  const loadPlaylists = async (): Promise<PlaylistSummary[]> => {
    if (!session) {
      throw new Error("Connect Spotify first.");
    }

    const response = await fetchCurrentUserPlaylists(session);
    setSession(response.session);
    storeSession(response.session);
    setPlaylistCache(response.playlists);
    return response.playlists;
  };

  const handleConnectSpotify = async () => {
    setErrorMessage(null);
    setIsWorking(true);
    try {
      getSpotifyClientID();
      await beginSpotifyLogin();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not start Spotify login.");
      setIsWorking(false);
    }
  };

  const handleSignOut = () => {
    clearStoredSession();
    setSession(null);
    setPlaylistCache([]);
    setShowsAccountPanel(false);
  };

  const handleExportBackup = () => {
    try {
      const backup = createSnapshotBackup(snapshot);
      const blob = new Blob([backup], { type: "application/json" });
      const objectURL = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const datePart = new Date().toISOString().slice(0, 10);

      anchor.href = objectURL;
      anchor.download = `spotify-playlist-builder-backup-${datePart}.json`;
      anchor.click();
      window.URL.revokeObjectURL(objectURL);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not export backup.");
    }
  };

  const handleImportBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const importedSnapshot = parseSnapshotBackup(await file.text());
      const nextConfigurationCount = importedSnapshot.configurations.length;
      const shouldReplace = window.confirm(
        `Replace this device's saved data with ${nextConfigurationCount} imported configuration${nextConfigurationCount === 1 ? "" : "s"}?`
      );

      if (!shouldReplace) {
        return;
      }

      setSnapshot(importedSnapshot);
      setEditorState(null);
      setPreviewState(null);
      setHistoryConfigurationID(null);
      setStatesByConfigurationID({});
      setActiveConfigurationID(null);
      setShowsAccountPanel(false);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not import backup.");
    }
  };

  const saveDraft = () => {
    if (!editorState) {
      return;
    }

    const issues = validateConfiguration(editorState.draft);
    if (issues.length > 0) {
      setEditorState({
        ...editorState,
        validationIssues: issues
      });
      return;
    }

    setSnapshot((currentSnapshot) => saveConfiguration(currentSnapshot, editorState.draft));
    setEditorState(null);
  };

  const updateDraft = (updater: (draft: PlaylistConfigurationDraft) => PlaylistConfigurationDraft) => {
    setEditorState((currentState) => {
      if (!currentState) {
        return currentState;
      }

      return {
        ...currentState,
        draft: updater(currentState.draft),
        validationIssues: [],
        saveError: null
      };
    });
  };

  const openPicker = async (pickerMode: PickerMode) => {
    if (!editorState) {
      return;
    }

    try {
      setIsWorking(true);
      await loadPlaylists();
      setEditorState({
        ...editorState,
        pickerMode
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load playlists.");
    } finally {
      setIsWorking(false);
    }
  };

  const handleCreateTargetPlaylist = async () => {
    if (!editorState || !session) {
      return;
    }

    try {
      setEditorState({
        ...editorState,
        isCreatingTargetPlaylist: true,
        saveError: null
      });
      const response = await createPlaylist(session, editorState.draft.targetPlaylistName);
      setSession(response.session);
      storeSession(response.session);
      setPlaylistCache((currentPlaylists) => {
        const nextPlaylists = [response.playlist, ...currentPlaylists.filter((playlist) => playlist.id !== response.playlist.id)];
        return nextPlaylists.sort((lhs, rhs) => lhs.name.localeCompare(rhs.name));
      });
      setEditorState((currentState) => {
        if (!currentState) {
          return currentState;
        }

        return {
          ...currentState,
          isCreatingTargetPlaylist: false,
          draft: {
            ...currentState.draft,
            targetPlaylistID: response.playlist.id,
            targetPlaylistName: response.playlist.name
          }
        };
      });
    } catch (error) {
      setEditorState((currentState) =>
        currentState
          ? {
              ...currentState,
              isCreatingTargetPlaylist: false,
              saveError: error instanceof Error ? error.message : "Could not create playlist."
            }
          : currentState
      );
    }
  };

  const handlePreparePreview = async (configuration: PlaylistConfigurationDraft) => {
    if (activeConfigurationID) {
      setErrorMessage("A rebuild is already running. Wait for it to finish before starting another one.");
      return;
    }

    if (!session) {
      setErrorMessage("Connect Spotify first.");
      return;
    }

    setActiveConfigurationID(configuration.id);
    setStatesByConfigurationID((currentState) => ({
      ...currentState,
      [configuration.id]: { type: "preparing-preview", step: "Preparing rebuild preview…" }
    }));

    try {
      const result = await preparePreview({
        configuration,
        session,
        onProgress: (step) => {
          setStatesByConfigurationID((currentState) => ({
            ...currentState,
            [configuration.id]: { type: "preparing-preview", step }
          }));
        }
      });
      setSession(result.session);
      storeSession(result.session);
      setStatesByConfigurationID((currentState) => ({
        ...currentState,
        [configuration.id]: { type: "idle" }
      }));
      setPreviewState({
        configuration,
        preview: result.preview,
        isApplying: false,
        progressMessage: null
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not prepare rebuild preview.";
      setStatesByConfigurationID((currentState) => ({
        ...currentState,
        [configuration.id]: { type: "failed", message }
      }));
      setErrorMessage(message);
    } finally {
      setActiveConfigurationID(null);
    }
  };

  const handleApplyPreview = async () => {
    if (!previewState || !session) {
      return;
    }

    if (activeConfigurationID) {
      setErrorMessage("A rebuild is already running. Wait for it to finish before starting another one.");
      return;
    }

    const configurationID = previewState.configuration.id;
    setActiveConfigurationID(configurationID);
    setPreviewState({
      ...previewState,
      isApplying: true,
      progressMessage: "Preparing rebuild…"
    });
    setStatesByConfigurationID((currentState) => ({
      ...currentState,
      [configurationID]: { type: "rebuilding", step: "Preparing rebuild…" }
    }));

    try {
      const result = await applyPreview({
        preview: previewState.preview,
        session,
        onProgress: (step) => {
          setPreviewState((currentState) =>
            currentState
              ? {
                  ...currentState,
                  progressMessage: step
                }
              : currentState
          );
          setStatesByConfigurationID((currentState) => ({
            ...currentState,
            [configurationID]: { type: "rebuilding", step }
          }));
        }
      });
      setSession(result.session);
      storeSession(result.session);
      const historyEntry = createHistoryEntry({
        configurationID,
        preview: previewState.preview,
        finishedAt: result.rebuiltAt
      });
      setSnapshot((currentSnapshot) => recordRebuildHistory(currentSnapshot, historyEntry));
      setStatesByConfigurationID((currentState) => ({
        ...currentState,
        [configurationID]: {
          type: "succeeded",
          message: historySummary(historyEntry),
          rebuiltAt: result.rebuiltAt
        }
      }));
      setPreviewState(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not rebuild playlist.";
      const historyEntry = createHistoryEntry({
        configurationID,
        preview: previewState.preview,
        finishedAt: new Date().toISOString(),
        errorMessage: message
      });
      setSnapshot((currentSnapshot) => recordRebuildHistory(currentSnapshot, historyEntry));
      setStatesByConfigurationID((currentState) => ({
        ...currentState,
        [configurationID]: { type: "failed", message }
      }));
      setPreviewState((currentState) =>
        currentState
          ? {
              ...currentState,
              isApplying: false,
              progressMessage: null
            }
          : currentState
      );
      setErrorMessage(message);
    } finally {
      setActiveConfigurationID(null);
    }
  };

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero__copy">
          <div className="hero__title-row">
            <h1>Spotify Playlist Builder</h1>
            {session ? (
              <button
                className="button button--ghost icon-button hero__icon-button"
                onClick={() => setShowsAccountPanel(true)}
                aria-label="Open Spotify account"
                title="Spotify account"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M19.14 12.94c.04-.31.06-.62.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.27 7.27 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.89 2h-3.78a.5.5 0 0 0-.49.42l-.36 2.54c-.58.23-1.13.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.72 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.62-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.4 1.05.71 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.78a.5.5 0 0 0 .49-.42l.36-2.54c.58-.23 1.13-.54 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z" />
                </svg>
              </button>
            ) : null}
          </div>
          <p className="hero__text">
            Your configurations stay in this browser.
          </p>
          {!session ? (
            <div className="hero__actions">
              <button className="button button--primary" onClick={() => void handleConnectSpotify()} disabled={isWorking}>
                Connect Spotify
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {errorMessage ? (
        <div className="notice notice--error">
          <span>{errorMessage}</span>
          <button className="notice__dismiss" onClick={() => setErrorMessage(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {isResolvingSession ? (
        <section className="empty-state">
          <h2>Restoring Spotify session…</h2>
        </section>
      ) : !session ? (
        <section className="empty-state">
          <h2>Spotify login required</h2>
          <p>
            Set <code>VITE_SPOTIFY_CLIENT_ID</code>, register <code>{getRedirectURI()}</code> in the
            Spotify app dashboard, then connect.
          </p>
        </section>
      ) : (
        <main className="workspace">
          <section className="panel">
            <div className="panel__header">
              <h2>Configurations</h2>
              <button className="button button--ghost" onClick={() => setEditorState(initialEditorState())}>
                New
              </button>
            </div>
            {activeConfigurations.length === 0 ? (
              <div className="panel__empty">
                Create a saved setup with one target playlist and one or more source playlists.
              </div>
            ) : (
              <div className="configuration-grid">
                {activeConfigurations.map((configuration) => {
                  const rebuildState = statesByConfigurationID[configuration.id] ?? { type: "idle" as const };
                  const latestHistoryEntry = configurationHistory(configuration.id)[0];
                  const statusMessage = renderRebuildState(rebuildState) ?? (latestHistoryEntry ? historySummary(latestHistoryEntry) : null);
                  return (
                    <article className="configuration-card" key={configuration.id}>
                      <div className="configuration-card__top">
                        <div>
                          <h3>{configuration.name}</h3>
                          <p>Target: {configuration.targetPlaylistName}</p>
                        </div>
                      </div>
                      <p className="configuration-summary">
                        <span>{configuration.targetTrackCount} tracks</span>
                        <span>{selectionModeLabels[configuration.selectionMode]}</span>
                      </p>
                      <ul className="configuration-source-list">
                        {configuration.sourcePlaylists.map((sourcePlaylist) => (
                          <li className="configuration-source-item" key={sourcePlaylist.id}>
                            <span>{sourcePlaylist.playlistName}</span>
                            {configuration.selectionMode === "percent" ? (
                              <span className="configuration-source-share">{sourcePlaylist.percentage ?? 0}%</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                      {statusMessage ? <p className="status-text">{statusMessage}</p> : null}
                      <div className="card-actions">
                        <button
                          className="button button--primary"
                          onClick={() => void handlePreparePreview(configuration)}
                          disabled={activeConfigurationID !== null && activeConfigurationID !== configuration.id}
                        >
                          Rebuild
                        </button>
                        <button
                          className="button button--secondary icon-button"
                          onClick={() => setEditorState(initialEditorState(configuration))}
                          aria-label="Edit configuration"
                          title="Edit configuration"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25Zm2.92 2.33H5v-.92l9.06-9.06.92.92L5.92 19.58ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.13 1.13 3.75 3.75 1.13-1.13Z" />
                          </svg>
                        </button>
                        <button
                          className="button button--ghost icon-button"
                          onClick={() => setHistoryConfigurationID(configuration.id)}
                          aria-label="Show rebuild history"
                          title="Show rebuild history"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M13 3a9 9 0 1 0 8.95 10h-2.02A7 7 0 1 1 13 5c1.93 0 3.68.78 4.95 2.05L15 10h7V3l-2.63 2.63A8.96 8.96 0 0 0 13 3Zm-1 5v5.41l3.29 3.29 1.42-1.41L14 12.59V8h-2Z" />
                          </svg>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel__header">
              <h2>Archived</h2>
            </div>
            {archivedConfigurations.length === 0 ? (
              <div className="panel__empty">Archived configurations will show up here.</div>
            ) : (
              <div className="archived-list">
                {archivedConfigurations.map((configuration) => (
                  <article className="archived-row" key={configuration.id}>
                    <div>
                      <h3>{configuration.name}</h3>
                      <p>{configuration.targetPlaylistName}</p>
                    </div>
                    <button
                      className="button button--secondary"
                      onClick={() =>
                        setSnapshot((currentSnapshot) =>
                          setArchiveState(currentSnapshot, configuration.id, false)
                        )
                      }
                    >
                      Restore
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </main>
      )}

      {showsAccountPanel && session ? (
        <div className="modal-backdrop" onClick={() => setShowsAccountPanel(false)}>
          <section className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel__header">
              <h2>Spotify account</h2>
              <button className="button button--ghost" onClick={() => setShowsAccountPanel(false)}>
                Close
              </button>
            </div>
            <dl className="account-grid">
              <div>
                <dt>Connected</dt>
                <dd>Yes</dd>
              </div>
              <div>
                <dt>Expires</dt>
                <dd>{formatDateTime(session.expiryDate)}</dd>
              </div>
              <div>
                <dt>Scopes</dt>
                <dd>{session.scopeString || "playlist-read/private + modify"}</dd>
              </div>
            </dl>
            <section className="subpanel backup-panel">
              <div className="panel__header">
                <h3>Backup</h3>
              </div>
              <p className="inline-note">
                Save a JSON backup to Files and import it later if Safari clears this browser&apos;s data.
              </p>
              <div className="card-actions">
                <button className="button button--secondary" onClick={handleExportBackup}>
                  Export backup
                </button>
                <button
                  className="button button--ghost"
                  onClick={() => backupImportInputRef.current?.click()}
                >
                  Import backup
                </button>
              </div>
              <input
                ref={backupImportInputRef}
                type="file"
                accept="application/json,.json"
                className="visually-hidden"
                onChange={(event) => void handleImportBackup(event)}
              />
            </section>
            <div className="card-actions">
              <button className="button button--secondary" onClick={() => void handleConnectSpotify()}>
                Reconnect Spotify
              </button>
              <button className="button button--ghost" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {editorState ? (
        <div className="modal-backdrop" onClick={() => setEditorState(null)}>
          <section className="modal modal--large" onClick={(event) => event.stopPropagation()}>
            <div className="panel__header">
              <h2>{snapshot.configurations.some((configuration) => configuration.id === editorState.draft.id) ? "Edit configuration" : "New configuration"}</h2>
              <button className="button button--ghost" onClick={() => setEditorState(null)}>
                Close
              </button>
            </div>
            <div className="editor-grid">
              <div className="field">
                <label>Configuration name</label>
                <input
                  value={editorState.draft.name}
                  onChange={(event) => updateDraft((draft) => ({ ...draft, name: event.target.value }))}
                />
              </div>
              <div className="field">
                <label>Selection mode</label>
                <select
                  value={editorState.draft.selectionMode}
                  onChange={(event) =>
                    updateDraft((draft) => ({
                      ...draft,
                      selectionMode: event.target.value as PlaylistConfigurationDraft["selectionMode"],
                      sourcePlaylists:
                        event.target.value === "percent"
                          ? draft.sourcePlaylists.map((sourcePlaylist) => ({
                              ...sourcePlaylist,
                              percentage: sourcePlaylist.percentage ?? 0
                            }))
                          : draft.sourcePlaylists
                    }))
                  }
                >
                  <option value="random">Random</option>
                  <option value="percent">Percent</option>
                </select>
              </div>
              <div className="field">
                <label>Target track count</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={editorState.draft.targetTrackCount}
                  onChange={(event) =>
                    updateDraft((draft) => ({
                      ...draft,
                      targetTrackCount: clamp(Number(event.target.value) || 1, 1, 500)
                    }))
                  }
                />
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={editorState.draft.isArchived}
                  onChange={(event) =>
                    updateDraft((draft) => ({
                      ...draft,
                      isArchived: event.target.checked
                    }))
                  }
                />
                Archive configuration
              </label>
            </div>

            <section className="subpanel">
              <div className="panel__header">
                <h3>Target playlist</h3>
              </div>
              <div className="editor-grid">
                <div className="field field--full">
                  <label>Target playlist name</label>
                  <input
                    value={editorState.draft.targetPlaylistName}
                    onChange={(event) =>
                      updateDraft((draft) => ({
                        ...draft,
                        targetPlaylistName: event.target.value
                      }))
                    }
                  />
                </div>
                <div className="card-actions">
                  <button className="button button--secondary" onClick={() => void openPicker("target")}>
                    Browse Spotify playlists
                  </button>
                  <button
                    className="button button--ghost"
                    onClick={() => void handleCreateTargetPlaylist()}
                    disabled={editorState.isCreatingTargetPlaylist || editorState.draft.targetPlaylistName.trim() === ""}
                  >
                    {editorState.isCreatingTargetPlaylist ? "Creating…" : "Create target playlist in Spotify"}
                  </button>
                </div>
              </div>
              {editorState.draft.targetPlaylistID ? (
                <p className="inline-note">Selected target: {editorState.draft.targetPlaylistName}</p>
              ) : (
                <p className="inline-note">Pick an existing Spotify playlist or create a new private one.</p>
              )}
            </section>

            <section className="subpanel">
              <div className="panel__header">
                <h3>Source playlists</h3>
                <button className="button button--secondary" onClick={() => void openPicker("sources")}>
                  Add source playlist
                </button>
              </div>
              {editorState.draft.sourcePlaylists.length === 0 ? (
                <div className="panel__empty">No source playlists selected.</div>
              ) : (
                <div className="source-list">
                  {editorState.draft.sourcePlaylists.map((sourcePlaylist) => (
                    <div className="source-row" key={sourcePlaylist.id}>
                      <div className="field field--grow">
                        <label>Source playlist name</label>
                        <input value={sourcePlaylist.playlistName} readOnly />
                      </div>
                      {editorState.draft.selectionMode === "percent" ? (
                        <div className="field">
                          <label>Contribution %</label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={sourcePlaylist.percentage ?? 0}
                            onChange={(event) =>
                              updateDraft((draft) => ({
                                ...draft,
                                sourcePlaylists: draft.sourcePlaylists.map((item) =>
                                  item.id === sourcePlaylist.id
                                    ? {
                                        ...item,
                                        percentage: clamp(Number(event.target.value) || 0, 0, 100)
                                      }
                                    : item
                                )
                              }))
                            }
                          />
                        </div>
                      ) : null}
                      <button
                        className="button button--ghost"
                        onClick={() =>
                          updateDraft((draft) => ({
                            ...draft,
                            sourcePlaylists: draft.sourcePlaylists.filter((item) => item.id !== sourcePlaylist.id)
                          }))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {editorState.validationIssues.length > 0 ? (
              <section className="notice notice--error">
                <div>
                  <strong>Fix before saving</strong>
                  <ul className="issue-list">
                    {editorState.validationIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </div>
              </section>
            ) : null}
            {editorState.saveError ? <div className="notice notice--error">{editorState.saveError}</div> : null}

            <div className="modal__footer">
              <button className="button button--ghost" onClick={() => setEditorState(null)}>
                Cancel
              </button>
              <button className="button button--primary" onClick={saveDraft}>
                Save
              </button>
            </div>

            {editorState.pickerMode ? (
              <div className="picker">
                <div className="panel__header">
                  <h3>{editorState.pickerMode === "target" ? "Target playlist" : "Source playlists"}</h3>
                  <button
                    className="button button--ghost"
                    onClick={() => setEditorState({ ...editorState, pickerMode: null })}
                  >
                    Done
                  </button>
                </div>
                <div className="picker-list">
                  {playlistCache.map((playlist) => {
                    const targetDisabled =
                      editorState.pickerMode === "target" &&
                      editorState.draft.sourcePlaylists.some((sourcePlaylist) => sourcePlaylist.playlistID === playlist.id);
                    const sourceDisabled =
                      editorState.pickerMode === "sources" &&
                      editorState.draft.targetPlaylistID === playlist.id;
                    const isDisabled = targetDisabled || sourceDisabled;

                    return (
                      <button
                        className="picker-row"
                        key={playlist.id}
                        disabled={isDisabled}
                        onClick={() => {
                          if (editorState.pickerMode === "target") {
                            setEditorState({
                              ...editorState,
                              pickerMode: null,
                              draft: {
                                ...editorState.draft,
                                targetPlaylistID: playlist.id,
                                targetPlaylistName: playlist.name
                              }
                            });
                            return;
                          }

                          if (
                            editorState.draft.sourcePlaylists.some(
                              (sourcePlaylist) => sourcePlaylist.playlistID === playlist.id
                            )
                          ) {
                            return;
                          }

                          setEditorState({
                            ...editorState,
                            draft: {
                              ...editorState.draft,
                              sourcePlaylists: [
                                ...editorState.draft.sourcePlaylists,
                                {
                                  id: playlist.id,
                                  playlistID: playlist.id,
                                  playlistName: playlist.name,
                                  percentage: editorState.draft.selectionMode === "percent" ? 0 : undefined
                                }
                              ]
                            }
                          });
                        }}
                      >
                        <span>{playlist.name}</span>
                        <span className="picker-row__meta">
                          {playlist.ownerDisplayName} • {playlist.trackCount} tracks
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {previewState ? (
        <div className="modal-backdrop" onClick={() => !previewState.isApplying && setPreviewState(null)}>
          <section className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel__header">
              <h2>Rebuild preview</h2>
              <button className="button button--ghost" onClick={() => setPreviewState(null)} disabled={previewState.isApplying}>
                Close
              </button>
            </div>
            <dl className="account-grid">
              <div>
                <dt>Target playlist</dt>
                <dd>{previewState.preview.targetPlaylistName}</dd>
              </div>
              <div>
                <dt>Tracks to write</dt>
                <dd>{previewState.preview.selection.selectedTracks.length}</dd>
              </div>
              <div>
                <dt>Duplicates skipped</dt>
                <dd>{previewState.preview.selection.skippedDuplicateTrackCount}</dd>
              </div>
              <div>
                <dt>Local-only skipped</dt>
                <dd>{previewState.preview.selection.skippedLocalTrackCount}</dd>
              </div>
              <div>
                <dt>Unavailable skipped</dt>
                <dd>{previewState.preview.selection.skippedInvalidTrackCount}</dd>
              </div>
            </dl>
            <div className="allocation-list">
              {previewState.preview.sourceAllocations.map((allocation) => (
                <article className="allocation-card" key={allocation.sourcePlaylistID}>
                  <h3>{allocation.sourcePlaylistName}</h3>
                  <p className={allocationWasRebalanced(allocation) ? "allocation-card__warn" : ""}>
                    {allocation.requestedTrackCount === null
                      ? `Selected ${allocation.selectedTrackCount}`
                      : `Requested ${allocation.requestedTrackCount} • actual ${allocation.selectedTrackCount}`}
                  </p>
                </article>
              ))}
            </div>
            <p className="inline-note">
              Confirming will replace the current contents of {previewState.preview.targetPlaylistName}.
            </p>
            {previewState.isApplying ? <div className="notice">{previewState.progressMessage ?? "Updating target playlist…"}</div> : null}
            <div className="modal__footer">
              <button className="button button--ghost" onClick={() => setPreviewState(null)} disabled={previewState.isApplying}>
                Cancel
              </button>
              <button className="button button--primary" onClick={() => void handleApplyPreview()} disabled={previewState.isApplying}>
                {previewState.isApplying ? "Rebuilding…" : "Confirm rebuild"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {historyConfigurationID ? (
        <div className="modal-backdrop" onClick={() => setHistoryConfigurationID(null)}>
          <section className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel__header">
              <h2>Rebuild history</h2>
              <button className="button button--ghost" onClick={() => setHistoryConfigurationID(null)}>
                Close
              </button>
            </div>
            {configurationHistory(historyConfigurationID).length === 0 ? (
              <div className="panel__empty">Confirmed rebuilds for this configuration will appear here.</div>
            ) : (
              <div className="history-list">
                {configurationHistory(historyConfigurationID).map((entry) => (
                  <article className="history-card" key={entry.id}>
                    <h3>{historySummary(entry)}</h3>
                    <p>{formatDateTime(entry.finishedAt)}</p>
                    {entry.sourceAllocations.map((allocation) => (
                      <p className="history-card__detail" key={allocation.sourcePlaylistID}>
                        {allocation.sourcePlaylistName}:{" "}
                        {allocation.requestedTrackCount === null
                          ? `${allocation.selectedTrackCount} selected`
                          : `requested ${allocation.requestedTrackCount}, actual ${allocation.selectedTrackCount}`}
                      </p>
                    ))}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
