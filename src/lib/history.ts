import type {
  PlaylistRebuildPreview,
  RebuildHistoryEntry,
  RebuildHistoryStatus
} from "./types";
import { generateID } from "./utils";

export function historySummary(entry: RebuildHistoryEntry): string {
  const duplicatePart =
    entry.skippedDuplicateTrackCount === 0
      ? "no duplicates skipped"
      : `${entry.skippedDuplicateTrackCount} duplicates skipped`;
  const localPart =
    entry.skippedLocalTrackCount === 0
      ? "no local-only tracks skipped"
      : `${entry.skippedLocalTrackCount} local-only tracks skipped`;
  const invalidPart =
    entry.skippedInvalidTrackCount === 0
      ? "no unavailable tracks skipped"
      : `${entry.skippedInvalidTrackCount} unavailable tracks skipped`;

  return entry.status === "succeeded"
    ? `Rebuilt ${entry.rebuiltTrackCount} tracks. ${duplicatePart}, ${localPart}, ${invalidPart}.`
    : entry.errorMessage ?? "Rebuild failed.";
}

export function createHistoryEntry(params: {
  configurationID: string;
  preview: PlaylistRebuildPreview;
  finishedAt: string;
  errorMessage?: string | null;
}): RebuildHistoryEntry {
  const status: RebuildHistoryStatus = params.errorMessage ? "failed" : "succeeded";

  return {
    id: generateID(),
    configurationID: params.configurationID,
    finishedAt: params.finishedAt,
    status,
    rebuiltTrackCount: params.preview.selection.selectedTracks.length,
    skippedDuplicateTrackCount: params.preview.selection.skippedDuplicateTrackCount,
    skippedLocalTrackCount: params.preview.selection.skippedLocalTrackCount,
    skippedInvalidTrackCount: params.preview.selection.skippedInvalidTrackCount,
    sourceAllocations: params.preview.sourceAllocations,
    errorMessage: params.errorMessage ?? null
  };
}
