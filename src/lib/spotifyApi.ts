import type { PlaylistRebuildSourceTrack, PlaylistSummary, SpotifySession } from "./types";
import { ensureValidSession } from "./spotifyAuth";

interface SpotifyPlaylistPageResponse {
  items: Array<{
    id: string;
    name: string;
    owner: { display_name?: string | null };
    tracks: { total: number };
    public?: boolean | null;
  }>;
  next: string | null;
}

interface SpotifyCurrentUserResponse {
  id: string;
}

interface SpotifyTrackPageResponse {
  items: Array<{
    is_local: boolean;
    track?: {
      id?: string | null;
      uri?: string | null;
    } | null;
  }>;
  next: string | null;
}

async function spotifyRequest<T>(
  session: SpotifySession,
  input: string,
  init?: RequestInit
): Promise<{ data: T; session: SpotifySession }> {
  const validSession = await ensureValidSession(session);
  const response = await fetch(input, {
    ...init,
    headers: {
      Authorization: `Bearer ${validSession.accessToken}`,
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Spotify request failed (${response.status}): ${message || response.statusText}`);
  }

  if (response.status === 204) {
    return { data: undefined as T, session: validSession };
  }

  return {
    data: (await response.json()) as T,
    session: validSession
  };
}

export async function fetchCurrentUserPlaylists(session: SpotifySession): Promise<{
  playlists: PlaylistSummary[];
  session: SpotifySession;
}> {
  let currentURL = "https://api.spotify.com/v1/me/playlists?limit=50";
  let currentSession = session;
  const playlists: PlaylistSummary[] = [];

  while (currentURL) {
    const response = await spotifyRequest<SpotifyPlaylistPageResponse>(currentSession, currentURL);
    currentSession = response.session;
    playlists.push(
      ...response.data.items.map((item) => ({
        id: item.id,
        name: item.name,
        ownerDisplayName: item.owner.display_name ?? "Unknown owner",
        trackCount: item.tracks.total,
        isPublic: item.public ?? null
      }))
    );
    currentURL = response.data.next ?? "";
  }

  return {
    playlists: playlists.sort((lhs, rhs) => lhs.name.localeCompare(rhs.name)),
    session: currentSession
  };
}

export async function createPlaylist(
  session: SpotifySession,
  name: string,
  isPublic = false
): Promise<{ playlist: PlaylistSummary; session: SpotifySession }> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Enter a target playlist name before creating it in Spotify.");
  }

  const currentUserResponse = await spotifyRequest<SpotifyCurrentUserResponse>(
    session,
    "https://api.spotify.com/v1/me"
  );
  const encodedUserID = encodeURIComponent(currentUserResponse.data.id.trim());
  const createResponse = await spotifyRequest<{
    id: string;
    name: string;
    public?: boolean | null;
    owner?: { display_name?: string | null };
    tracks?: { total?: number | null };
  }>(currentUserResponse.session, `https://api.spotify.com/v1/users/${encodedUserID}/playlists`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: trimmedName,
      public: isPublic
    })
  });

  return {
    playlist: {
      id: createResponse.data.id,
      name: createResponse.data.name,
      ownerDisplayName:
        createResponse.data.owner?.display_name ?? "You",
      trackCount: createResponse.data.tracks?.total ?? 0,
      isPublic: createResponse.data.public ?? null
    },
    session: createResponse.session
  };
}

export async function fetchPlaylistTracks(
  session: SpotifySession,
  playlistID: string
): Promise<{ tracks: PlaylistRebuildSourceTrack[]; session: SpotifySession }> {
  const encodedPlaylistID = encodeURIComponent(playlistID.trim());
  let currentURL = `https://api.spotify.com/v1/playlists/${encodedPlaylistID}/tracks?limit=100`;
  let currentSession = session;
  const tracks: PlaylistRebuildSourceTrack[] = [];

  while (currentURL) {
    const response = await spotifyRequest<SpotifyTrackPageResponse>(currentSession, currentURL);
    currentSession = response.session;
    tracks.push(
      ...response.data.items.map((item) => ({
        sourcePlaylistID: playlistID,
        trackID: item.track?.id ?? null,
        uri: item.track?.uri ?? null,
        isLocal: item.is_local || !item.track
      }))
    );
    currentURL = response.data.next ?? "";
  }

  return { tracks, session: currentSession };
}

async function mutatePlaylistTracks(
  session: SpotifySession,
  playlistID: string,
  method: "PUT" | "POST",
  trackURIs: string[]
): Promise<SpotifySession> {
  const encodedPlaylistID = encodeURIComponent(playlistID.trim());
  const response = await spotifyRequest<void>(
    session,
    `https://api.spotify.com/v1/playlists/${encodedPlaylistID}/tracks`,
    {
      method,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ uris: trackURIs })
    }
  );

  return response.session;
}

export async function replacePlaylistTracks(
  session: SpotifySession,
  playlistID: string,
  trackURIs: string[]
): Promise<SpotifySession> {
  let currentSession = await mutatePlaylistTracks(session, playlistID, "PUT", trackURIs.slice(0, 100));
  for (let batchStart = 100; batchStart < trackURIs.length; batchStart += 100) {
    currentSession = await mutatePlaylistTracks(
      currentSession,
      playlistID,
      "POST",
      trackURIs.slice(batchStart, batchStart + 100)
    );
  }

  return currentSession;
}
