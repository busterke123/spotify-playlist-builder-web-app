import type {
  ConfigurationStoreSnapshot,
  PlaylistConfigurationDraft,
  RebuildHistoryEntry
} from "./types";

const storageKey = "spotify-playlist-builder.snapshot.v1";
const maxHistoryEntriesPerConfiguration = 10;

function defaultSnapshot(): ConfigurationStoreSnapshot {
  return {
    configurations: [],
    rebuildHistoryByConfigurationID: {}
  };
}

export function loadSnapshot(): ConfigurationStoreSnapshot {
  const rawValue = window.localStorage.getItem(storageKey);
  if (!rawValue) {
    return defaultSnapshot();
  }

  try {
    const parsed = JSON.parse(rawValue) as ConfigurationStoreSnapshot;
    return {
      configurations: parsed.configurations ?? [],
      rebuildHistoryByConfigurationID: parsed.rebuildHistoryByConfigurationID ?? {}
    };
  } catch {
    return defaultSnapshot();
  }
}

export function persistSnapshot(snapshot: ConfigurationStoreSnapshot): void {
  window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
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
