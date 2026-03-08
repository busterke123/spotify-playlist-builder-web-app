import type {
  PlaylistConfigurationDraft,
  PlaylistRebuildPreview,
  PlaylistRebuildSelectedTrack,
  PlaylistRebuildSelection,
  PlaylistRebuildSourceAllocation,
  PlaylistRebuildSourceTrack
} from "./types";
import { validateConfiguration } from "./configuration";

interface CandidateTrack {
  trackID: string;
  uri: string;
  sourcePlaylistIDs: Set<string>;
}

interface PreparedTracks {
  candidates: CandidateTrack[];
  skippedDuplicateTrackCount: number;
  skippedLocalTrackCount: number;
  skippedInvalidTrackCount: number;
}

export class PlaylistRebuildEngineError extends Error {
  static invalidConfiguration(message: string): PlaylistRebuildEngineError {
    return new PlaylistRebuildEngineError(message);
  }

  static insufficientUniqueTracks(requested: number, available: number): PlaylistRebuildEngineError {
    return new PlaylistRebuildEngineError(
      `The saved configuration asked for ${requested} tracks, but only ${available} unique Spotify tracks were available after filtering duplicates and local-only tracks.`
    );
  }
}

function normalizedValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function shuffle<T>(values: T[], random = Math.random): T[] {
  const clone = [...values];
  for (let index = clone.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [clone[index], clone[swapIndex]] = [clone[swapIndex], clone[index]];
  }
  return clone;
}

function prepareTracks(sourceTracks: PlaylistRebuildSourceTrack[]): PreparedTracks {
  const candidatesByTrackID = new Map<string, CandidateTrack>();
  let skippedDuplicateTrackCount = 0;
  let skippedLocalTrackCount = 0;
  let skippedInvalidTrackCount = 0;

  for (const sourceTrack of sourceTracks) {
    if (sourceTrack.isLocal) {
      skippedLocalTrackCount += 1;
      continue;
    }

    const trackID = normalizedValue(sourceTrack.trackID);
    const uri = normalizedValue(sourceTrack.uri);
    if (!trackID || !uri) {
      skippedInvalidTrackCount += 1;
      continue;
    }

    const existingTrack = candidatesByTrackID.get(trackID);
    if (existingTrack) {
      existingTrack.sourcePlaylistIDs.add(sourceTrack.sourcePlaylistID);
      skippedDuplicateTrackCount += 1;
      continue;
    }

    candidatesByTrackID.set(trackID, {
      trackID,
      uri,
      sourcePlaylistIDs: new Set([sourceTrack.sourcePlaylistID])
    });
  }

  return {
    candidates: [...candidatesByTrackID.values()].sort((lhs, rhs) =>
      lhs.trackID.localeCompare(rhs.trackID)
    ),
    skippedDuplicateTrackCount,
    skippedLocalTrackCount,
    skippedInvalidTrackCount
  };
}

export function requestedTrackCounts(configuration: PlaylistConfigurationDraft): Record<string, number> {
  const rawCounts = configuration.sourcePlaylists.map((sourcePlaylist) => {
    const percentage = Number(sourcePlaylist.percentage ?? 0);
    const exactCount = (configuration.targetTrackCount * percentage) / 100;
    const baseCount = Math.floor(exactCount);

    return {
      playlistID: sourcePlaylist.playlistID,
      baseCount,
      remainder: exactCount - baseCount
    };
  });

  const targetCounts = Object.fromEntries(rawCounts.map((entry) => [entry.playlistID, entry.baseCount]));
  const assignedCount = rawCounts.reduce((sum, entry) => sum + entry.baseCount, 0);
  const extraSlots = configuration.targetTrackCount - assignedCount;
  const priorityOrder = rawCounts
    .map((entry, index) => ({ ...entry, index }))
    .sort((lhs, rhs) => {
      if (lhs.remainder === rhs.remainder) {
        return lhs.index - rhs.index;
      }
      return rhs.remainder - lhs.remainder;
    })
    .map((entry) => entry.playlistID);

  for (const playlistID of priorityOrder.slice(0, extraSlots)) {
    targetCounts[playlistID] = (targetCounts[playlistID] ?? 0) + 1;
  }

  return targetCounts;
}

function buildRandomSelection(
  candidates: CandidateTrack[],
  targetTrackCount: number,
  random = Math.random
): PlaylistRebuildSelectedTrack[] {
  return shuffle(candidates, random)
    .slice(0, targetTrackCount)
    .map((candidate) => ({
      trackID: candidate.trackID,
      uri: candidate.uri,
      creditedSourcePlaylistID: [...candidate.sourcePlaylistIDs].sort()[0] ?? ""
    }));
}

function prioritizedSourcePlaylistID(
  sourceOrder: string[],
  availableSourceIDs: string[],
  remainingCounts: Record<string, number>,
  remainingCandidates: CandidateTrack[]
): string | null {
  if (availableSourceIDs.length === 0) {
    return null;
  }

  const sourcesWithPositiveDemand = availableSourceIDs.filter(
    (sourcePlaylistID) => (remainingCounts[sourcePlaylistID] ?? 0) > 0
  );

  if (sourcesWithPositiveDemand.length > 0) {
    return sourcesWithPositiveDemand.sort((lhs, rhs) => {
      const leftCount = remainingCounts[lhs] ?? 0;
      const rightCount = remainingCounts[rhs] ?? 0;
      if (leftCount === rightCount) {
        return sourceOrder.indexOf(lhs) - sourceOrder.indexOf(rhs);
      }
      return rightCount - leftCount;
    })[0];
  }

  return availableSourceIDs.sort((lhs, rhs) => {
    const leftCount = remainingCandidates.filter((candidate) =>
      candidate.sourcePlaylistIDs.has(lhs)
    ).length;
    const rightCount = remainingCandidates.filter((candidate) =>
      candidate.sourcePlaylistIDs.has(rhs)
    ).length;
    if (leftCount === rightCount) {
      return sourceOrder.indexOf(lhs) - sourceOrder.indexOf(rhs);
    }
    return rightCount - leftCount;
  })[0];
}

function prioritizedCandidateIndex(
  sourcePlaylistID: string,
  remainingCandidates: CandidateTrack[],
  remainingCounts: Record<string, number>,
  random = Math.random
): number | null {
  const eligibleCandidates = remainingCandidates
    .map((candidate, offset) => ({ candidate, offset }))
    .filter(({ candidate }) => candidate.sourcePlaylistIDs.has(sourcePlaylistID));

  if (eligibleCandidates.length === 0) {
    return null;
  }

  const scoredCandidates = eligibleCandidates.map(({ candidate, offset }) => ({
    offset,
    sharedDemandCount: [...candidate.sourcePlaylistIDs].reduce((count, playlistID) => {
      return count + ((remainingCounts[playlistID] ?? 0) > 0 ? 1 : 0);
    }, 0),
    sourceCount: candidate.sourcePlaylistIDs.size
  }));

  scoredCandidates.sort((lhs, rhs) => {
    if (lhs.sharedDemandCount === rhs.sharedDemandCount) {
      return lhs.sourceCount - rhs.sourceCount;
    }
    return lhs.sharedDemandCount - rhs.sharedDemandCount;
  });

  const bestScore = scoredCandidates[0];
  const bestOffsets = scoredCandidates
    .filter(
      (candidate) =>
        candidate.sharedDemandCount === bestScore.sharedDemandCount &&
        candidate.sourceCount === bestScore.sourceCount
    )
    .map((candidate) => candidate.offset);

  return bestOffsets[Math.floor(random() * bestOffsets.length)] ?? null;
}

function buildPercentSelection(
  configuration: PlaylistConfigurationDraft,
  candidates: CandidateTrack[],
  random = Math.random
): PlaylistRebuildSelectedTrack[] {
  const remainingCandidates = [...candidates];
  const sourceOrder = configuration.sourcePlaylists.map((sourcePlaylist) => sourcePlaylist.playlistID);
  const remainingCounts = requestedTrackCounts(configuration);
  const selectedTracks: PlaylistRebuildSelectedTrack[] = [];

  while (selectedTracks.length < configuration.targetTrackCount) {
    const availableSourceIDs = sourceOrder.filter((sourcePlaylistID) =>
      remainingCandidates.some((candidate) => candidate.sourcePlaylistIDs.has(sourcePlaylistID))
    );

    const sourcePlaylistID = prioritizedSourcePlaylistID(
      sourceOrder,
      availableSourceIDs,
      remainingCounts,
      remainingCandidates
    );

    if (!sourcePlaylistID) {
      break;
    }

    const candidateIndex = prioritizedCandidateIndex(
      sourcePlaylistID,
      remainingCandidates,
      remainingCounts,
      random
    );

    if (candidateIndex === null) {
      break;
    }

    const [candidate] = remainingCandidates.splice(candidateIndex, 1);
    selectedTracks.push({
      trackID: candidate.trackID,
      uri: candidate.uri,
      creditedSourcePlaylistID: sourcePlaylistID
    });
    remainingCounts[sourcePlaylistID] = (remainingCounts[sourcePlaylistID] ?? 0) - 1;
  }

  if (selectedTracks.length !== configuration.targetTrackCount) {
    throw PlaylistRebuildEngineError.insufficientUniqueTracks(
      configuration.targetTrackCount,
      selectedTracks.length
    );
  }

  return selectedTracks;
}

export function buildSelection(
  configuration: PlaylistConfigurationDraft,
  sourceTracks: PlaylistRebuildSourceTrack[],
  random = Math.random
): PlaylistRebuildSelection {
  const firstIssue = validateConfiguration(configuration)[0];
  if (firstIssue) {
    throw PlaylistRebuildEngineError.invalidConfiguration(firstIssue);
  }

  const preparedTracks = prepareTracks(sourceTracks);
  if (preparedTracks.candidates.length < configuration.targetTrackCount) {
    throw PlaylistRebuildEngineError.insufficientUniqueTracks(
      configuration.targetTrackCount,
      preparedTracks.candidates.length
    );
  }

  const selectedTracks =
    configuration.selectionMode === "random"
      ? buildRandomSelection(preparedTracks.candidates, configuration.targetTrackCount, random)
      : buildPercentSelection(configuration, preparedTracks.candidates, random);

  return {
    selectedTracks,
    skippedDuplicateTrackCount: preparedTracks.skippedDuplicateTrackCount,
    skippedLocalTrackCount: preparedTracks.skippedLocalTrackCount,
    skippedInvalidTrackCount: preparedTracks.skippedInvalidTrackCount
  };
}

export function selectedCountsBySourcePlaylistID(
  selection: PlaylistRebuildSelection
): Record<string, number> {
  return selection.selectedTracks.reduce<Record<string, number>>((accumulator, track) => {
    accumulator[track.creditedSourcePlaylistID] =
      (accumulator[track.creditedSourcePlaylistID] ?? 0) + 1;
    return accumulator;
  }, {});
}

export function buildPreview(
  configuration: PlaylistConfigurationDraft,
  selection: PlaylistRebuildSelection
): PlaylistRebuildPreview {
  const requestedCounts =
    configuration.selectionMode === "percent" ? requestedTrackCounts(configuration) : {};
  const selectedCounts = selectedCountsBySourcePlaylistID(selection);

  return {
    targetPlaylistID: configuration.targetPlaylistID,
    targetPlaylistName: configuration.targetPlaylistName,
    requestedTrackCount: configuration.targetTrackCount,
    selection,
    sourceAllocations: configuration.sourcePlaylists.map<PlaylistRebuildSourceAllocation>((sourcePlaylist) => ({
      sourcePlaylistID: sourcePlaylist.playlistID,
      sourcePlaylistName: sourcePlaylist.playlistName,
      requestedTrackCount:
        configuration.selectionMode === "percent"
          ? (requestedCounts[sourcePlaylist.playlistID] ?? 0)
          : null,
      selectedTrackCount: selectedCounts[sourcePlaylist.playlistID] ?? 0
    }))
  };
}
