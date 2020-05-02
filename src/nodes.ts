import createNodeHelpers from 'gatsby-node-helpers';

const { createNodeFactory } = createNodeHelpers({
  typePrefix: 'Spotify',
});

export const PlaylistNode = createNodeFactory('Playlist');
export const TrackNode = createNodeFactory('Track');
