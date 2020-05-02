import { createFileNodeFromBuffer } from 'gatsby-source-filesystem';
import fetch from 'node-fetch';

import { generateArtistString } from './artist-list';
import { getUserData, TimeRange, getPlaylistTracks } from './spotify-api';
import jimp from 'jimp';
import fs from 'fs';

export interface PluginOptions {
  // Auth
  clientId: string;
  clientSecret: string;
  refreshToken: string;

  // Config
  timeRanges?: TimeRange[];
  fetchPlaylists?: boolean;
  fetchRecent?: boolean;
}

const referenceRemoteFile = async (
  id: string,
  url: string,
  { cache, createNode, createNodeId, touchNode, store },
) => {
  const cachedResult = await cache.get(url);

  if (cachedResult) {
    touchNode({ nodeId: cachedResult });
    return { localFile___NODE: cachedResult };
  }

  const testRes = await fetch(url);

  if (!testRes.ok) {
    console.warn(`[${id}] Image could not be loaded. Skipping...`);
    return null;
  }

  const buffer: Buffer = await testRes.buffer();
  const fileNode = await createFileNodeFromBuffer({
    buffer,
    store,
    cache,
    createNode,
    createNodeId,
    name: id.replace(/[^a-z0-9]+/gi, '-'),
    ext: '.jpg',
  });

  const image = await jimp.read(fileNode.absolutePath);
  const pixelated = await image
    .quality(10)
    .pixelate(32)
    .getBase64Async(jimp.MIME_JPEG);

  if (fileNode && pixelated) {
    cache.set(url, fileNode.id);
    return { localFile___NODE: fileNode.id, pixelated };
  }

  return null;
};

export const sourceNodes = async (
  { actions, createNodeId, createContentDigest, store, cache },
  pluginOptions: PluginOptions,
) => {
  const { createNode, touchNode } = actions;
  const helpers = {
    cache,
    createNode,
    createNodeId,
    store,
    touchNode,
  };

  const { playlists } = await getUserData(pluginOptions);

  await Promise.all([
    ...playlists.map(async (playlist) => {
      const playlistData = {
        ...playlist,
        spotifyId: playlist.id,
        tracks: playlist.tracks.length,
        image: await referenceRemoteFile(
          playlist.uri,
          playlist.images[0].url,
          helpers,
        ),
      };

      const metadata = {
        id: createNodeId(`playlist-${playlist.id}`),
        parent: null,
        children: [],
        internal: {
          type: `SpotifyPlaylist`,
          content: JSON.stringify(playlistData),
          contentDigest: createContentDigest(playlistData),
        },
      };

      const playlistNode = Object.assign({}, playlistData, metadata);
      await createNode(playlistNode);

      for (const t of playlist.tracks) {
        const image = await referenceRemoteFile(
          t.uri,
          t.album.images[0].url,
          helpers,
        );
        const track = {
          ...t,
          artist: generateArtistString(t.artists),
          playlistId: playlist.id,
          image,
        };
        if (track.image.pixelated) {
          const metadata = {
            id: createNodeId(`track-${track.id}`),
            parent: playlistNode.id,
            children: [],
            internal: {
              type: `SpotifyTrack`,
              content: JSON.stringify(track),
              contentDigest: createContentDigest(track),
            },
          };

          const node = Object.assign({}, track, metadata);
          await createNode(node);
        }
      }
    }),
  ]);

  return;
};
