/**
 * A 3x5 bitmap font for the offline preview.
 *
 * This is NOT the device font. The Bar renders real TTFs baked to a glyph atlas,
 * and there is no way to get at those from Node. The preview is therefore exact
 * about geometry, colour and layout, and approximate about glyph shapes — it
 * will tell you that a column overflows or that the wrong thing is on screen,
 * not whether a specific letter is one pixel narrower on hardware.
 */
export const GLYPH_WIDTH = 3;
export const GLYPH_HEIGHT = 5;
/** One blank column between glyphs, matching the device's 4px tiny advance. */
export const GLYPH_ADVANCE = GLYPH_WIDTH + 1;

const GLYPHS: Record<string, readonly string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  A: ['111', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
  C: ['111', '100', '100', '100', '111'],
  D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '111', '100', '111'],
  F: ['111', '100', '111', '100', '100'],
  G: ['111', '100', '101', '101', '111'],
  H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  J: ['001', '001', '001', '101', '111'],
  K: ['101', '101', '110', '101', '101'],
  L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'],
  N: ['110', '101', '101', '101', '101'],
  O: ['111', '101', '101', '101', '111'],
  P: ['111', '101', '111', '100', '100'],
  Q: ['111', '101', '101', '111', '001'],
  R: ['111', '101', '110', '101', '101'],
  S: ['111', '100', '111', '001', '111'],
  T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '111', '111', '101'],
  X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'],
  Z: ['111', '001', '010', '100', '111'],
  '-': ['000', '000', '111', '000', '000'],
  '+': ['000', '010', '111', '010', '000'],
  '/': ['001', '001', '010', '100', '100'],
  '.': ['000', '000', '000', '000', '010'],
  ',': ['000', '000', '000', '010', '100'],
  ':': ['000', '010', '000', '010', '000'],
  '#': ['101', '111', '101', '111', '101'],
  '>': ['100', '010', '001', '010', '100'],
  '<': ['001', '010', '100', '010', '001'],
  '(': ['010', '100', '100', '100', '010'],
  ')': ['010', '001', '001', '001', '010'],
  '!': ['010', '010', '010', '000', '010'],
  '?': ['111', '001', '011', '000', '010'],
  '=': ['000', '111', '000', '111', '000'],
  '|': ['010', '010', '010', '010', '010'],
  '%': ['101', '001', '010', '100', '101'],
  '*': ['000', '101', '010', '101', '000'],
  _: ['000', '000', '000', '000', '111'],
  "'": ['010', '010', '000', '000', '000'],
  ' ': ['000', '000', '000', '000', '000'],
};

/** Unknown characters render as a filled block rather than vanishing silently. */
const FALLBACK = ['111', '101', '101', '101', '111'] as const;

export function glyph(character: string): readonly string[] {
  return GLYPHS[character.toUpperCase()] ?? FALLBACK;
}

/** Width in pixels of `text` at a given integer scale. */
export function textWidth(text: string, scale: number): number {
  if (text.length === 0) {
    return 0;
  }
  return (text.length * GLYPH_ADVANCE - 1) * scale;
}

export function textHeight(scale: number): number {
  return GLYPH_HEIGHT * scale;
}
