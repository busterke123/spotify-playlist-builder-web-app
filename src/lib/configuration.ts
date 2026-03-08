import type {
  PlaylistConfigurationDraft,
  SelectionMode,
  SourcePlaylistConfigurationDraft
} from "./types";
import { generateID, trim } from "./utils";

export const selectionModeLabels: Record<SelectionMode, string> = {
  random: "Random",
  percent: "Percent"
};

export function createEmptySourcePlaylist(): SourcePlaylistConfigurationDraft {
  return {
    id: generateID(),
    playlistName: "",
    playlistID: "",
    percentage: undefined
  };
}

export function createEmptyConfiguration(): PlaylistConfigurationDraft {
  return {
    id: generateID(),
    name: "",
    targetPlaylistName: "",
    targetPlaylistID: "",
    sourcePlaylists: [],
    targetTrackCount: 25,
    selectionMode: "random",
    isArchived: false
  };
}

function normalizedPlaylistID(value: string): string {
  return trim(value).toLowerCase();
}

export function validateConfiguration(draft: PlaylistConfigurationDraft): string[] {
  const issues: string[] = [];

  if (trim(draft.name) === "") {
    issues.push("Configuration name is required.");
  }

  if (trim(draft.targetPlaylistName) === "") {
    issues.push("Target playlist name is required.");
  }

  if (trim(draft.targetPlaylistID) === "") {
    issues.push("Select a target playlist.");
  }

  if (draft.targetTrackCount <= 0) {
    issues.push("Target track count must be greater than 0.");
  }

  if (draft.sourcePlaylists.length === 0) {
    issues.push("Add at least one source playlist.");
  }

  const normalizedTargetID = normalizedPlaylistID(draft.targetPlaylistID);
  const normalizedSourceIDs = draft.sourcePlaylists.map((source) =>
    normalizedPlaylistID(source.playlistID)
  );

  draft.sourcePlaylists.forEach((sourcePlaylist, index) => {
    const position = index + 1;

    if (trim(sourcePlaylist.playlistName) === "") {
      issues.push(`Source playlist ${position} needs a name.`);
    }

    if (trim(sourcePlaylist.playlistID) === "") {
      issues.push(`Source playlist ${position} must be selected from Spotify.`);
    }

    if (draft.selectionMode === "percent") {
      if (sourcePlaylist.percentage === undefined) {
        issues.push(`Source playlist ${position} needs a percentage.`);
      } else if (sourcePlaylist.percentage < 0 || sourcePlaylist.percentage > 100) {
        issues.push(`Source playlist ${position} percentage must be between 0 and 100.`);
      }
    }
  });

  if (normalizedTargetID !== "" && normalizedSourceIDs.includes(normalizedTargetID)) {
    issues.push("Target playlist cannot also be a source playlist.");
  }

  const duplicateSourceIDs = Object.values(
    normalizedSourceIDs
      .filter((playlistID) => playlistID !== "")
      .reduce<Record<string, number>>((accumulator, playlistID) => {
        accumulator[playlistID] = (accumulator[playlistID] ?? 0) + 1;
        return accumulator;
      }, {})
  ).some((count) => count > 1);

  if (duplicateSourceIDs) {
    issues.push("Each source playlist must be unique.");
  }

  if (draft.selectionMode === "percent") {
    const totalPercentage = draft.sourcePlaylists.reduce(
      (sum, sourcePlaylist) => sum + (sourcePlaylist.percentage ?? 0),
      0
    );

    if (totalPercentage !== 100) {
      issues.push("Percent mode requires source percentages to total 100.");
    }
  }

  return issues;
}
