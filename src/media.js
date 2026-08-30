import links from '../media.json';

export const getMediaUrl = (code) => links[code] ?? null;
