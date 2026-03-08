import { describe, expect, test } from "vitest";
import { createSnapshotBackup, parseSnapshotBackup } from "./storage";
import type { ConfigurationStoreSnapshot } from "./types";

function makeSnapshot(): ConfigurationStoreSnapshot {
  return {
    configurations: [
      {
        id: "config-1",
        name: "Road Trip",
        targetPlaylistName: "Road Trip Mix",
        targetPlaylistID: "target-1",
        sourcePlaylists: [
          { id: "source-1", playlistName: "Indie", playlistID: "playlist-1", percentage: 60 },
          { id: "source-2", playlistName: "Dance", playlistID: "playlist-2", percentage: 40 }
        ],
        targetTrackCount: 25,
        selectionMode: "percent",
        isArchived: false
      }
    ],
    rebuildHistoryByConfigurationID: {
      "config-1": [
        {
          id: "history-1",
          configurationID: "config-1",
          finishedAt: "2026-03-08T12:00:00.000Z",
          status: "succeeded",
          rebuiltTrackCount: 25,
          skippedDuplicateTrackCount: 1,
          skippedLocalTrackCount: 0,
          skippedInvalidTrackCount: 0,
          sourceAllocations: [
            {
              sourcePlaylistID: "playlist-1",
              sourcePlaylistName: "Indie",
              requestedTrackCount: 15,
              selectedTrackCount: 15
            }
          ],
          errorMessage: null
        }
      ]
    }
  };
}

describe("storage backup", () => {
  test("round-trips a versioned backup file", () => {
    const snapshot = makeSnapshot();

    const backup = createSnapshotBackup(snapshot);

    expect(parseSnapshotBackup(backup)).toEqual(snapshot);
  });

  test("supports importing a raw snapshot file", () => {
    const snapshot = makeSnapshot();

    expect(parseSnapshotBackup(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  test("rejects malformed backup content", () => {
    expect(() =>
      parseSnapshotBackup('{"version":1,"exportedAt":"2026-03-08T12:00:00.000Z","snapshot":{"configurations":"bad","rebuildHistoryByConfigurationID":{}}}')
    ).toThrow("Backup configurations are invalid.");
  });
});
