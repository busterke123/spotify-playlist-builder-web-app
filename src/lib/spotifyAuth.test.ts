import { beforeEach, describe, expect, test, vi } from "vitest";
import { clearStoredSession, ensureValidSession, storeSession } from "./spotifyAuth";
import type { SpotifySession } from "./types";

function makeSession(): SpotifySession {
  return {
    accessToken: "old-access-token",
    refreshToken: "refresh-token",
    expiryDate: new Date(0).toISOString(),
    scopeString: "playlist-read-private"
  };
}

describe("spotifyAuth", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  test("clears the stored session when Spotify rejects refresh with invalid_grant", async () => {
    const session = makeSession();
    storeSession(session);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        text: vi.fn().mockResolvedValue('{"error":"invalid_grant","error_description":"Refresh token expired"}'),
        statusText: "Bad Request"
      })
    );

    await expect(ensureValidSession(session)).rejects.toThrow(
      "Spotify session expired. Connect Spotify again."
    );

    expect(window.localStorage.getItem("spotify-playlist-builder.spotify-session")).toBeNull();
  });

  test("stores the refreshed session when token refresh succeeds", async () => {
    const session = makeSession();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: "new-access-token",
          expires_in: 3600
        })
      })
    );

    const refreshed = await ensureValidSession(session);

    expect(refreshed.accessToken).toBe("new-access-token");
    expect(refreshed.refreshToken).toBe("refresh-token");
    expect(window.localStorage.getItem("spotify-playlist-builder.spotify-session")).toContain(
      "new-access-token"
    );
  });
});
