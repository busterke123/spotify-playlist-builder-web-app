import type { SpotifySession } from "./types";
import { generateID } from "./utils";

const accountsURL = "https://accounts.spotify.com";
const authStateKey = "spotify-playlist-builder.auth-state";
const sessionKey = "spotify-playlist-builder.spotify-session";

interface PendingAuthState {
  state: string;
  codeVerifier: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

export function getSpotifyClientID(): string {
  const clientID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  if (!clientID || clientID.includes("your_spotify_client_id")) {
    throw new Error("Set VITE_SPOTIFY_CLIENT_ID before connecting Spotify.");
  }
  return clientID;
}

export function getRedirectURI(): string {
  return window.location.origin + window.location.pathname;
}

function encodeBase64Url(bytes: ArrayBuffer): string {
  const encoded = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function makeCodeChallenge(codeVerifier: string): Promise<string> {
  const data = new TextEncoder().encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return encodeBase64Url(digest);
}

function makeCodeVerifier(): string {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes.buffer);
}

function loadPendingAuthState(): PendingAuthState | null {
  const rawValue = window.sessionStorage.getItem(authStateKey);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as PendingAuthState;
  } catch {
    return null;
  }
}

function storePendingAuthState(value: PendingAuthState): void {
  window.sessionStorage.setItem(authStateKey, JSON.stringify(value));
}

function clearPendingAuthState(): void {
  window.sessionStorage.removeItem(authStateKey);
}

export function loadStoredSession(): SpotifySession | null {
  const rawValue = window.localStorage.getItem(sessionKey);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as SpotifySession;
  } catch {
    return null;
  }
}

export function storeSession(session: SpotifySession): void {
  window.localStorage.setItem(sessionKey, JSON.stringify(session));
}

export function clearStoredSession(): void {
  window.localStorage.removeItem(sessionKey);
}

function sessionExpiryTime(session: SpotifySession): number {
  return new Date(session.expiryDate).getTime();
}

export function sessionIsExpiring(session: SpotifySession): boolean {
  return sessionExpiryTime(session) - Date.now() < 60_000;
}

async function requestToken(formValues: Record<string, string>): Promise<TokenResponse> {
  const body = new URLSearchParams(formValues);
  const response = await fetch(`${accountsURL}/api/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Spotify token request failed: ${message || response.statusText}`);
  }

  return (await response.json()) as TokenResponse;
}

function mapTokenResponse(tokenResponse: TokenResponse, previousSession?: SpotifySession): SpotifySession {
  const refreshToken = tokenResponse.refresh_token ?? previousSession?.refreshToken ?? "";
  if (!refreshToken) {
    throw new Error("Spotify did not return a refresh token.");
  }

  return {
    accessToken: tokenResponse.access_token,
    refreshToken,
    expiryDate: new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString(),
    scopeString: tokenResponse.scope ?? previousSession?.scopeString ?? ""
  };
}

export async function beginSpotifyLogin(): Promise<void> {
  const state = generateID();
  const codeVerifier = makeCodeVerifier();
  const codeChallenge = await makeCodeChallenge(codeVerifier);
  const clientID = getSpotifyClientID();
  const redirectURI = getRedirectURI();
  storePendingAuthState({ state, codeVerifier });

  const scope = [
    "playlist-read-private",
    "playlist-read-collaborative",
    "playlist-modify-private",
    "playlist-modify-public"
  ].join(" ");

  const authorizationURL = new URL(`${accountsURL}/authorize`);
  authorizationURL.searchParams.set("client_id", clientID);
  authorizationURL.searchParams.set("response_type", "code");
  authorizationURL.searchParams.set("redirect_uri", redirectURI);
  authorizationURL.searchParams.set("code_challenge_method", "S256");
  authorizationURL.searchParams.set("code_challenge", codeChallenge);
  authorizationURL.searchParams.set("scope", scope);
  authorizationURL.searchParams.set("state", state);
  authorizationURL.searchParams.set("show_dialog", "true");

  window.location.assign(authorizationURL.toString());
}

function clearURLParams(): void {
  const nextURL = `${window.location.pathname}${window.location.hash}`;
  window.history.replaceState({}, document.title, nextURL);
}

export async function completeSpotifyLoginIfPresent(): Promise<SpotifySession | null> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    clearPendingAuthState();
    clearURLParams();
    throw new Error(`Spotify authorization failed: ${error}`);
  }

  if (!code) {
    return null;
  }

  const pendingState = loadPendingAuthState();
  clearPendingAuthState();
  clearURLParams();

  if (!pendingState || pendingState.state !== state) {
    throw new Error("Spotify authorization state mismatch.");
  }

  const tokenResponse = await requestToken({
    client_id: getSpotifyClientID(),
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectURI(),
    code_verifier: pendingState.codeVerifier
  });

  const session = mapTokenResponse(tokenResponse);
  storeSession(session);
  return session;
}

export async function ensureValidSession(session: SpotifySession | null): Promise<SpotifySession> {
  if (!session) {
    throw new Error("Connect Spotify first.");
  }

  if (!sessionIsExpiring(session)) {
    return session;
  }

  const tokenResponse = await requestToken({
    client_id: getSpotifyClientID(),
    grant_type: "refresh_token",
    refresh_token: session.refreshToken
  });
  const refreshedSession = mapTokenResponse(tokenResponse, session);
  storeSession(refreshedSession);
  return refreshedSession;
}
