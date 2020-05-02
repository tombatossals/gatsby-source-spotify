import { createFileNodeFromBuffer } from 'gatsby-source-filesystem';
import fetch from 'node-fetch';

import { generateArtistString } from './artist-list';
import { PlaylistNode, TrackNode } from './nodes';
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

const sleep = (milliseconds) => {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

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
  { actions, createNodeId, store, cache },
  pluginOptions: PluginOptions,
) => {
  const { createNode, touchNode } = actions;
  const helpers = { cache, createNode, createNodeId, store, touchNode };

  const { playlists } = await getUserData(pluginOptions);

  await Promise.all([
    ...playlists.map(async (playlist) => {
      for (const t of playlist.tracks) {
        const image = await referenceRemoteFile(
          t.uri,
          t.album.images[0].url,
          helpers,
        );
        const track = {
          ...t,
          artist: generateArtistString(t.artists),
          image,
        };
        if (track.image.pixelated) {
          await createNode(
            TrackNode({
              ...track,
              playlist: playlist.id,
            }),
          );
        }
      }

      await createNode(
        PlaylistNode({
          ...playlist,
          tracks: playlist.tracks.length,
          image:
            playlist.images && playlist.images.length
              ? await referenceRemoteFile(
                  playlist.uri,
                  playlist.images[0].url,
                  helpers,
                )
              : null,
        }),
      );
    }),
  ]);

  return;
};
