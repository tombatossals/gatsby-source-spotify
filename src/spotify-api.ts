import fetch from 'node-fetch';

import { PluginOptions } from './gatsby-node';
import {
  PlaylistsResponse,
  PlaylistResponse,
  Playlist,
} from './types/spotify-playlists';
import { Track } from './types/spotify-track';
import { TokenResponse } from './types/spotify-token';

export type Scope =
  | 'playlist-read-private'
  | 'user-modify-playback-state'
  | 'user-top-read'
  | 'user-read-recently-played'
  | 'user-read-currently-playing'
  | 'playlist-modify-private'
  | 'app-remote-control'
  | 'playlist-modify-public'
  | 'user-read-birthdate'
  | 'user-read-playback-state'
  | 'user-follow-read'
  | 'user-read-email'
  | 'streaming'
  | 'playlist-read-collaborative'
  | 'user-library-modify'
  | 'user-read-private'
  | 'user-follow-modify'
  | 'user-library-read';

export type TimeRange = 'long_term' | 'medium_term' | 'short_term';

export const SPOTIFY_ACCOUNT_URL = 'https://accounts.spotify.com';
export const SPOTIFY_API_URL = 'https://api.spotify.com/v1';
export const REDIRECT_URL = 'http://localhost:5071/spotify';

export const generateAuthUrl = (
  clientId: string,
  scopes: Scope[] = ['user-top-read', 'user-read-recently-played'],
) => {
  const base = new URL(`${SPOTIFY_ACCOUNT_URL}/authorize`);
  base.searchParams.append('response_type', 'code');
  base.searchParams.append('redirect_uri', REDIRECT_URL);
  base.searchParams.append('client_id', clientId);
  base.searchParams.append('scope', scopes.join(' '));
  return String(base);
};

export const getTokens = async (
  clientId: string,
  clientSecret: string,
  code: string,
  grantType: 'authorization_code' | 'refresh_token',
) => {
  const body = new URLSearchParams();

  body.append('grant_type', grantType);
  body.append('redirect_uri', REDIRECT_URL);
  body.append(grantType === 'refresh_token' ? 'refresh_token' : 'code', code);
  body.append('client_id', clientId);
  body.append('client_secret', clientSecret);

  const response = await fetch(`${SPOTIFY_ACCOUNT_URL}/api/token`, {
    method: 'POST',
    body: body as any, // Typing seems to be off here
  });

  if (!response.ok) {
    throw new Error(`${response.statusText}: ${await response.text()}`);
  }

  return (await response.json()) as TokenResponse;
};

export const getPlaylistTracks = async (
  accessToken: string,
  playlistId: string,
  limit: number = 100,
) => {
  const url = new URL(`${SPOTIFY_API_URL}/playlists/${playlistId}/tracks`);
  url.searchParams.append('market', 'from_token');
  url.searchParams.append('limit', String(Math.min(limit, 100)));

  const response = await fetch(String(url), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`${response.statusText}: ${await response.text()}`);
  }

  const result: PlaylistResponse = await response.json();
  const tracks: Track[] = result.items
    .filter(
      (t) =>
        t.track.preview_url &&
        t.track.album &&
        t.track.album.images &&
        t.track.album.images[0].url,
    )
    .map((playlistTrack) => ({
      ...playlistTrack.track,
    }));
  return tracks;
};

export const getPlaylists = async (accessToken: string, limit: number = 50) => {
  const url = new URL(`${SPOTIFY_API_URL}/me/playlists`);
  url.searchParams.append('limit', String(Math.min(limit, 50)));

  const response = await fetch(String(url), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`${response.statusText}: ${await response.text()}`);
  }

  const result: PlaylistsResponse = await response.json();

  const playlists: Playlist[] = await Promise.all(
    result.items.map(async (playlist) => ({
      ...playlist,
      tracks: await getPlaylistTracks(accessToken, playlist.id),
    })),
  );

  return playlists;
};

export const getUserData = async ({
  clientId,
  clientSecret,
  refreshToken,
}: PluginOptions) => {
  const { access_token } = await getTokens(
    clientId,
    clientSecret,
    refreshToken,
    'refresh_token',
  );

  const playlists = await getPlaylists(access_token);

  return {
    playlists,
  };
};
