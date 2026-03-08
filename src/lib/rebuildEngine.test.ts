import { describe, expect, test } from "vitest";
import { buildPreview, buildSelection, requestedTrackCounts } from "./rebuildEngine";
import type { PlaylistConfigurationDraft, PlaylistRebuildSourceTrack } from "./types";

function makeConfiguration(overrides: Partial<PlaylistConfigurationDraft> = {}): PlaylistConfigurationDraft {
  return {
    id: "config-1",
    name: "Test",
    targetPlaylistName: "Target",
    targetPlaylistID: "target",
    sourcePlaylists: [
      { id: "source-a", playlistName: "A", playlistID: "a" },
      { id: "source-b", playlistName: "B", playlistID: "b" }
    ],
    targetTrackCount: 2,
    selectionMode: "random",
    isArchived: false,
    ...overrides
  };
}

describe("rebuild engine", () => {
  test("random selection skips invalid and duplicate tracks", () => {
    const configuration = makeConfiguration();
    const sourceTracks: PlaylistRebuildSourceTrack[] = [
      { sourcePlaylistID: "a", trackID: "1", uri: "spotify:track:1", isLocal: false },
      { sourcePlaylistID: "a", trackID: "2", uri: "spotify:track:2", isLocal: false },
      { sourcePlaylistID: "b", trackID: "1", uri: "spotify:track:1", isLocal: false },
      { sourcePlaylistID: "b", trackID: null, uri: "spotify:track:3", isLocal: false },
      { sourcePlaylistID: "b", trackID: "4", uri: "spotify:track:4", isLocal: true }
    ];

    const selection = buildSelection(configuration, sourceTracks, () => 0);

    expect(selection.selectedTracks).toHaveLength(2);
    expect(new Set(selection.selectedTracks.map((track) => track.uri)).size).toBe(2);
    expect(selection.skippedDuplicateTrackCount).toBe(1);
    expect(selection.skippedInvalidTrackCount).toBe(1);
    expect(selection.skippedLocalTrackCount).toBe(1);
  });

  test("percent selection rebalances when one source runs out", () => {
    const configuration = makeConfiguration({
      selectionMode: "percent",
      targetTrackCount: 4,
      sourcePlaylists: [
        { id: "source-a", playlistName: "A", playlistID: "a", percentage: 50 },
        { id: "source-b", playlistName: "B", playlistID: "b", percentage: 50 }
      ]
    });

    const sourceTracks: PlaylistRebuildSourceTrack[] = [
      { sourcePlaylistID: "a", trackID: "1", uri: "spotify:track:1", isLocal: false },
      { sourcePlaylistID: "b", trackID: "2", uri: "spotify:track:2", isLocal: false },
      { sourcePlaylistID: "b", trackID: "3", uri: "spotify:track:3", isLocal: false },
      { sourcePlaylistID: "b", trackID: "4", uri: "spotify:track:4", isLocal: false }
    ];

    const selection = buildSelection(configuration, sourceTracks, () => 0);

    expect(selection.selectedTracks).toHaveLength(4);
    expect(selection.selectedTracks.filter((track) => track.creditedSourcePlaylistID === "a")).toHaveLength(1);
    expect(selection.selectedTracks.filter((track) => track.creditedSourcePlaylistID === "b")).toHaveLength(3);
  });

  test("requested track counts use largest remainder allocation", () => {
    const configuration = makeConfiguration({
      selectionMode: "percent",
      targetTrackCount: 5,
      sourcePlaylists: [
        { id: "source-a", playlistName: "A", playlistID: "a", percentage: 34 },
        { id: "source-b", playlistName: "B", playlistID: "b", percentage: 33 },
        { id: "source-c", playlistName: "C", playlistID: "c", percentage: 33 }
      ]
    });

    const counts = requestedTrackCounts(configuration);
    expect(counts).toEqual({ a: 2, b: 2, c: 1 });
  });

  test("preview captures requested and actual source allocation", () => {
    const configuration = makeConfiguration({
      selectionMode: "percent",
      targetTrackCount: 4,
      sourcePlaylists: [
        { id: "source-a", playlistName: "A", playlistID: "a", percentage: 50 },
        { id: "source-b", playlistName: "B", playlistID: "b", percentage: 50 }
      ]
    });

    const selection = {
      selectedTracks: [
        { trackID: "1", uri: "spotify:track:1", creditedSourcePlaylistID: "a" },
        { trackID: "2", uri: "spotify:track:2", creditedSourcePlaylistID: "b" },
        { trackID: "3", uri: "spotify:track:3", creditedSourcePlaylistID: "b" },
        { trackID: "4", uri: "spotify:track:4", creditedSourcePlaylistID: "b" }
      ],
      skippedDuplicateTrackCount: 1,
      skippedLocalTrackCount: 2,
      skippedInvalidTrackCount: 0
    };

    const preview = buildPreview(configuration, selection);

    expect(preview.sourceAllocations[0]).toMatchObject({
      requestedTrackCount: 2,
      selectedTrackCount: 1
    });
    expect(preview.sourceAllocations[1]).toMatchObject({
      requestedTrackCount: 2,
      selectedTrackCount: 3
    });
  });
});
