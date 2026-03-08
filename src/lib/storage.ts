import type {
  ConfigurationStoreSnapshot,
  PlaylistConfigurationDraft,
  RebuildHistoryEntry,
  SourcePlaylistConfigurationDraft
} from "./types";

const storageKey = "spotify-playlist-builder.snapshot.v1";
const maxHistoryEntriesPerConfiguration = 10;
const backupVersion = 1;

interface SnapshotBackupFile {
  version: number;
  exportedAt: string;
  snapshot: ConfigurationStoreSnapshot;
}

function defaultSnapshot(): ConfigurationStoreSnapshot {
  return {
    configurations: [],
    rebuildHistoryByConfigurationID: {}
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSourcePlaylist(value: unknown, index: number): SourcePlaylistConfigurationDraft {
  if (!isRecord(value)) {
    throw new Error(`Source playlist ${index + 1} is invalid.`);
  }

  if (typeof value.id !== "string" || typeof value.playlistName !== "string" || typeof value.playlistID !== "string") {
    throw new Error(`Source playlist ${index + 1} is missing required fields.`);
  }

  if (value.percentage !== undefined && typeof value.percentage !== "number") {
    throw new Error(`Source playlist ${index + 1} percentage is invalid.`);
  }

  return {
    id: value.id,
    playlistName: value.playlistName,
    playlistID: value.playlistID,
    percentage: value.percentage
  };
}

function parseConfiguration(value: unknown, index: number): PlaylistConfigurationDraft {
  if (!isRecord(value)) {
    throw new Error(`Configuration ${index + 1} is invalid.`);
  }

  if (
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.targetPlaylistName !== "string" ||
    typeof value.targetPlaylistID !== "string" ||
    typeof value.targetTrackCount !== "number" ||
    (value.selectionMode !== "random" && value.selectionMode !== "percent") ||
    typeof value.isArchived !== "boolean" ||
    !Array.isArray(value.sourcePlaylists)
  ) {
    throw new Error(`Configuration ${index + 1} is missing required fields.`);
  }

  return {
    id: value.id,
    name: value.name,
    targetPlaylistName: value.targetPlaylistName,
    targetPlaylistID: value.targetPlaylistID,
    sourcePlaylists: value.sourcePlaylists.map((sourcePlaylist, sourceIndex) =>
      parseSourcePlaylist(sourcePlaylist, sourceIndex)
    ),
    targetTrackCount: value.targetTrackCount,
    selectionMode: value.selectionMode,
    isArchived: value.isArchived
  };
}

function parseHistoryEntry(value: unknown): RebuildHistoryEntry {
  if (!isRecord(value)) {
    throw new Error("A rebuild history entry is invalid.");
  }

  if (
    typeof value.id !== "string" ||
    typeof value.configurationID !== "string" ||
    typeof value.finishedAt !== "string" ||
    (value.status !== "succeeded" && value.status !== "failed") ||
    typeof value.rebuiltTrackCount !== "number" ||
    typeof value.skippedDuplicateTrackCount !== "number" ||
    typeof value.skippedLocalTrackCount !== "number" ||
    typeof value.skippedInvalidTrackCount !== "number" ||
    !Array.isArray(value.sourceAllocations) ||
    (value.errorMessage !== null && typeof value.errorMessage !== "string")
  ) {
    throw new Error("A rebuild history entry is missing required fields.");
  }

  const sourceAllocations = value.sourceAllocations.map((allocation, index) => {
    if (
      !isRecord(allocation) ||
      typeof allocation.sourcePlaylistID !== "string" ||
      typeof allocation.sourcePlaylistName !== "string" ||
      (allocation.requestedTrackCount !== null && typeof allocation.requestedTrackCount !== "number") ||
      typeof allocation.selectedTrackCount !== "number"
    ) {
      throw new Error(`Source allocation ${index + 1} is invalid.`);
    }

    return {
      sourcePlaylistID: allocation.sourcePlaylistID,
      sourcePlaylistName: allocation.sourcePlaylistName,
      requestedTrackCount: allocation.requestedTrackCount,
      selectedTrackCount: allocation.selectedTrackCount
    };
  });

  return {
    id: value.id,
    configurationID: value.configurationID,
    finishedAt: value.finishedAt,
    status: value.status,
    rebuiltTrackCount: value.rebuiltTrackCount,
    skippedDuplicateTrackCount: value.skippedDuplicateTrackCount,
    skippedLocalTrackCount: value.skippedLocalTrackCount,
    skippedInvalidTrackCount: value.skippedInvalidTrackCount,
    sourceAllocations,
    errorMessage: value.errorMessage
  };
}

function normalizeSnapshot(value: unknown): ConfigurationStoreSnapshot {
  if (!isRecord(value)) {
    throw new Error("Backup content is invalid.");
  }

  if (!Array.isArray(value.configurations)) {
    throw new Error("Backup configurations are invalid.");
  }

  if (!isRecord(value.rebuildHistoryByConfigurationID)) {
    throw new Error("Backup rebuild history is invalid.");
  }

  return {
    configurations: value.configurations.map((configuration, index) => parseConfiguration(configuration, index)),
    rebuildHistoryByConfigurationID: Object.fromEntries(
      Object.entries(value.rebuildHistoryByConfigurationID).map(([configurationID, entries]) => {
        if (!Array.isArray(entries)) {
          throw new Error(`Rebuild history for ${configurationID} is invalid.`);
        }

        return [configurationID, entries.map((entry) => parseHistoryEntry(entry))];
      })
    )
  };
}

export function loadSnapshot(): ConfigurationStoreSnapshot {
  const rawValue = window.localStorage.getItem(storageKey);
  if (!rawValue) {
    return defaultSnapshot();
  }

  try {
    return normalizeSnapshot(JSON.parse(rawValue));
  } catch {
    return defaultSnapshot();
  }
}

export function persistSnapshot(snapshot: ConfigurationStoreSnapshot): void {
  window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
}

export function createSnapshotBackup(snapshot: ConfigurationStoreSnapshot): string {
  const backupFile: SnapshotBackupFile = {
    version: backupVersion,
    exportedAt: new Date().toISOString(),
    snapshot
  };

  return JSON.stringify(backupFile, null, 2);
}

export function parseSnapshotBackup(rawValue: string): ConfigurationStoreSnapshot {
  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(rawValue);
  } catch {
    throw new Error("Backup file is not valid JSON.");
  }

  if (isRecord(parsedValue) && "snapshot" in parsedValue) {
    if (parsedValue.version !== backupVersion) {
      throw new Error("Backup file version is not supported.");
    }

    if (typeof parsedValue.exportedAt !== "string") {
      throw new Error("Backup export date is invalid.");
    }

    return normalizeSnapshot(parsedValue.snapshot);
  }

  return normalizeSnapshot(parsedValue);
}

export function saveConfiguration(
  snapshot: ConfigurationStoreSnapshot,
  draft: PlaylistConfigurationDraft
): ConfigurationStoreSnapshot {
  const configurations = snapshot.configurations.filter((configuration) => configuration.id !== draft.id);
  return {
    ...snapshot,
    configurations: [draft, ...configurations]
  };
}

export function setArchiveState(
  snapshot: ConfigurationStoreSnapshot,
  configurationID: string,
  isArchived: boolean
): ConfigurationStoreSnapshot {
  return {
    ...snapshot,
    configurations: snapshot.configurations.map((configuration) =>
      configuration.id === configurationID ? { ...configuration, isArchived } : configuration
    )
  };
}

export function recordRebuildHistory(
  snapshot: ConfigurationStoreSnapshot,
  entry: RebuildHistoryEntry
): ConfigurationStoreSnapshot {
  const existingEntries = snapshot.rebuildHistoryByConfigurationID[entry.configurationID] ?? [];
  return {
    ...snapshot,
    rebuildHistoryByConfigurationID: {
      ...snapshot.rebuildHistoryByConfigurationID,
      [entry.configurationID]: [entry, ...existingEntries].slice(0, maxHistoryEntriesPerConfiguration)
    }
  };
}
