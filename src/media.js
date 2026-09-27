import links from '../media.json';

// A value is one URL, or a list of labelled URLs when a card offers a choice
// of machines. Always returns a list.
export const getMedia = (code) => {
  const value = links[code];
  if (!value) return [];
  return typeof value === 'string' ? [{ label: null, url: value }] : value;
};
