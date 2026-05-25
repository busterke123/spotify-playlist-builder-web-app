import { describe, expect, test } from "vitest";
import contractData from "./__fixtures__/rebuildContractCases.json";
import { buildSelection } from "./rebuildEngine";
import type {
  PlaylistConfigurationDraft,
  PlaylistRebuildSourceTrack,
  SelectionMode
} from "./types";

interface ContractSourcePlaylist {
  playlistID: string;
  percentage: number;
}

interface ContractTrack {
  trackID: string;
  uri: string;
}

interface ContractCase {
  name: string;
  selectionMode: SelectionMode;
  targetTrackCount: number;
  sourcePlaylists: ContractSourcePlaylist[];
  tracksByPlaylistID: Record<string, ContractTrack[]>;
  expectedSelectedCount: number;
  expectedUniqueURI?: boolean;
  expectedSourcePrefixCounts?: Record<string, number>;
  expectedErrorIncludes?: string;
}

const cases = contractData.cases as ContractCase[];

function makeConfiguration(contractCase: ContractCase): PlaylistConfigurationDraft {
  return {
    id: contractCase.name,
    name: contractCase.name,
    targetPlaylistName: "Target",
    targetPlaylistID: "target",
    sourcePlaylists: contractCase.sourcePlaylists.map((sourcePlaylist) => ({
      id: sourcePlaylist.playlistID,
      playlistID: sourcePlaylist.playlistID,
      playlistName: sourcePlaylist.playlistID.toUpperCase(),
      percentage: sourcePlaylist.percentage
    })),
    targetTrackCount: contractCase.targetTrackCount,
    selectionMode: contractCase.selectionMode,
    isArchived: false
  };
}

function makeSourceTracks(contractCase: ContractCase): PlaylistRebuildSourceTrack[] {
  return Object.entries(contractCase.tracksByPlaylistID).flatMap(([sourcePlaylistID, tracks]) =>
    tracks.map((track) => ({
      sourcePlaylistID,
      trackID: track.trackID,
      uri: track.uri,
      isLocal: false
    }))
  );
}

function countSourcePrefixes(uris: string[], prefixes: Iterable<string>): Record<string, number> {
  const counts = Object.fromEntries([...prefixes].map((prefix) => [prefix, 0]));

  for (const uri of uris) {
    const matchingPrefix = Object.keys(counts).find((prefix) =>
      uri.startsWith(`spotify:track:${prefix}`)
    );
    if (matchingPrefix) {
      counts[matchingPrefix] += 1;
    }
  }

  return counts;
}

describe("rebuild contract cases", () => {
  test.each(cases)("$name", (contractCase) => {
    const configuration = makeConfiguration(contractCase);
    const sourceTracks = makeSourceTracks(contractCase);

    if (contractCase.expectedErrorIncludes) {
      expect(() => buildSelection(configuration, sourceTracks, () => 0)).toThrow(
        contractCase.expectedErrorIncludes
      );
      return;
    }

    const selection = buildSelection(configuration, sourceTracks, () => 0);
    const selectedURIs = selection.selectedTracks.map((track) => track.uri);

    expect(selection.selectedTracks).toHaveLength(contractCase.expectedSelectedCount);

    if (contractCase.expectedUniqueURI) {
      expect(new Set(selectedURIs).size).toBe(selectedURIs.length);
    }

    if (contractCase.expectedSourcePrefixCounts) {
      expect(
        countSourcePrefixes(selectedURIs, Object.keys(contractCase.expectedSourcePrefixCounts))
      ).toEqual(contractCase.expectedSourcePrefixCounts);
    }
  });
});
