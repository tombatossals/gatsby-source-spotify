import { createFileNodeFromBuffer } from 'gatsby-source-filesystem';
import fetch from 'node-fetch';

import { generateArtistString } from './artist-list';
import { PlaylistNode } from './nodes';
import { getUserData, TimeRange } from './spotify-api';

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

  const fileNode = await createFileNodeFromBuffer({
    buffer: await testRes.buffer(),
    store,
    cache,
    createNode,
    createNodeId,
    name: id.replace(/[^a-z0-9]+/gi, '-'),
    ext: '.jpg',
  });

  if (fileNode) {
    cache.set(url, fileNode.id);
    return { localFile___NODE: fileNode.id };
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
    ...playlists.map(async (playlist, index) => {
      createNode(
        PlaylistNode({
          ...playlist,
          order: index,
          image:
            playlist.images && playlist.images.length
              ? await referenceRemoteFile(
                  playlist.uri,
                  playlist.images[0].url,
                  helpers,
                )
              : null,
          tracks: await Promise.all(
            playlist.tracks.map(async (playlistTrack, index) => ({
              order: index,
              ...playlistTrack.track,
              artistString: generateArtistString(playlistTrack.track.artists),
              image:
                playlistTrack.track.album &&
                playlistTrack.track.album.images &&
                playlistTrack.track.album.images.length
                  ? await referenceRemoteFile(
                      playlistTrack.track.uri,
                      playlistTrack.track.album.images[0].url,
                      helpers,
                    )
                  : null,
            })),
          ),
        }),
      );
    }),
  ]);

  return;
};
