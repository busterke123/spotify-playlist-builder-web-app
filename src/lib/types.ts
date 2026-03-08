export type SelectionMode = "random" | "percent";

export interface SourcePlaylistConfigurationDraft {
  id: string;
  playlistName: string;
  playlistID: string;
  percentage?: number;
}

export interface PlaylistConfigurationDraft {
  id: string;
  name: string;
  targetPlaylistName: string;
  targetPlaylistID: string;
  sourcePlaylists: SourcePlaylistConfigurationDraft[];
  targetTrackCount: number;
  selectionMode: SelectionMode;
  isArchived: boolean;
}

export interface PlaylistSummary {
  id: string;
  name: string;
  ownerDisplayName: string;
  trackCount: number;
  isPublic: boolean | null;
}

export interface SpotifySession {
  accessToken: string;
  refreshToken: string;
  expiryDate: string;
  scopeString: string;
}

export interface PlaylistRebuildSourceTrack {
  sourcePlaylistID: string;
  trackID: string | null;
  uri: string | null;
  isLocal: boolean;
}

export interface PlaylistRebuildSelectedTrack {
  trackID: string;
  uri: string;
  creditedSourcePlaylistID: string;
}

export interface PlaylistRebuildSelection {
  selectedTracks: PlaylistRebuildSelectedTrack[];
  skippedDuplicateTrackCount: number;
  skippedLocalTrackCount: number;
  skippedInvalidTrackCount: number;
}

export interface PlaylistRebuildSourceAllocation {
  sourcePlaylistID: string;
  sourcePlaylistName: string;
  requestedTrackCount: number | null;
  selectedTrackCount: number;
}

export interface PlaylistRebuildPreview {
  targetPlaylistID: string;
  targetPlaylistName: string;
  requestedTrackCount: number;
  selection: PlaylistRebuildSelection;
  sourceAllocations: PlaylistRebuildSourceAllocation[];
}

export type RebuildHistoryStatus = "succeeded" | "failed";

export interface RebuildHistoryEntry {
  id: string;
  configurationID: string;
  finishedAt: string;
  status: RebuildHistoryStatus;
  rebuiltTrackCount: number;
  skippedDuplicateTrackCount: number;
  skippedLocalTrackCount: number;
  skippedInvalidTrackCount: number;
  sourceAllocations: PlaylistRebuildSourceAllocation[];
  errorMessage: string | null;
}

export interface ConfigurationStoreSnapshot {
  configurations: PlaylistConfigurationDraft[];
  rebuildHistoryByConfigurationID: Record<string, RebuildHistoryEntry[]>;
}

export interface ConfigurationRebuildStateIdle {
  type: "idle";
}

export interface ConfigurationRebuildStatePreparingPreview {
  type: "preparing-preview";
  step: string;
}

export interface ConfigurationRebuildStateRebuilding {
  type: "rebuilding";
  step: string;
}

export interface ConfigurationRebuildStateSucceeded {
  type: "succeeded";
  message: string;
  rebuiltAt: string;
}

export interface ConfigurationRebuildStateFailed {
  type: "failed";
  message: string;
}

export type ConfigurationRebuildState =
  | ConfigurationRebuildStateIdle
  | ConfigurationRebuildStatePreparingPreview
  | ConfigurationRebuildStateRebuilding
  | ConfigurationRebuildStateSucceeded
  | ConfigurationRebuildStateFailed;
