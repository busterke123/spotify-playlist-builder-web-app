import { buildPreview, buildSelection } from "./rebuildEngine";
import { fetchPlaylistTracks, replacePlaylistTracks } from "./spotifyApi";
import type { PlaylistConfigurationDraft, PlaylistRebuildPreview, SpotifySession } from "./types";

export async function preparePreview(params: {
  configuration: PlaylistConfigurationDraft;
  session: SpotifySession;
  onProgress?: (step: string) => void;
}): Promise<{ preview: PlaylistRebuildPreview; session: SpotifySession }> {
  params.onProgress?.("Loading source playlists…");

  let currentSession = params.session;
  const sourceTracks = [];
  for (const sourcePlaylist of params.configuration.sourcePlaylists) {
    const response = await fetchPlaylistTracks(currentSession, sourcePlaylist.playlistID);
    currentSession = response.session;
    sourceTracks.push(...response.tracks);
  }

  params.onProgress?.("Selecting tracks…");
  const selection = buildSelection(params.configuration, sourceTracks);

  return {
    preview: buildPreview(params.configuration, selection),
    session: currentSession
  };
}

export async function applyPreview(params: {
  preview: PlaylistRebuildPreview;
  session: SpotifySession;
  onProgress?: (step: string) => void;
}): Promise<{ rebuiltAt: string; session: SpotifySession }> {
  params.onProgress?.("Updating target playlist…");
  const nextSession = await replacePlaylistTracks(
    params.session,
    params.preview.targetPlaylistID,
    params.preview.selection.selectedTracks.map((track) => track.uri)
  );

  return {
    rebuiltAt: new Date().toISOString(),
    session: nextSession
  };
}
