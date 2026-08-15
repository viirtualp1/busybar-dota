export const COLORS = {
  white: '#FFFFFFFF',
  transparent: '#00000000',
  /** Radiant is green, Dire is red — the same language the game itself uses. */
  radiant: '#3FBF5FFF',
  dire: '#E14B3AFF',
  /**
   * The front display is filled with these behind the score, so they have to be
   * dark enough that white text on top stays legible.
   */
  radiantFill: '#0C2E17FF',
  direFill: '#33100BFF',
  muted: '#9AA0A6FF',
  dim: '#6B7075FF',
  clock: '#D8DCE0FF',
  ledRadiant: '#3FBF5FFF',
  ledDire: '#E14B3AFF',
  ledStart: '#FFFFFFFF',
} as const;
