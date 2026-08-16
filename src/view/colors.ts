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
  /**
   * Back-display text. The back panel is a 16-shade grey OLED, so the Radiant
   * green and Dire red that work on the front collapse into two nearly identical
   * greys there. Both columns use one legible shade and a divider tells them
   * apart instead of hue.
   */
  backText: '#E6E6E6FF',
  backDivider: '#5A5A5AFF',
  clock: '#D8DCE0FF',
  ledRadiant: '#3FBF5FFF',
  ledDire: '#E14B3AFF',
  ledStart: '#FFFFFFFF',
} as const;
