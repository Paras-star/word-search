import type { TextStyle } from 'react-native';

export const nightPuzzleColors = {
  foreground: '#FFF8E8',
  textShadow: 'rgba(0, 0, 0, 0.95)',
};

export const nightPuzzleTextStyle: TextStyle = {
  color: nightPuzzleColors.foreground,
  textShadowColor: nightPuzzleColors.textShadow,
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 3,
};

/**
 * Reserve title space only when the unchanged, centered-cover artwork places
 * the moon in the existing 64-point header. Coordinates include its bright rim
 * in the original 1440 × 3200 asset; the image itself is never repositioned.
 */
export function getNightHeaderTitleStyle(width: number, height: number): TextStyle {
  const scale = Math.max(width / 1440, height / 3200);
  const offsetX = (width - 1440 * scale) / 2;
  const offsetY = (height - 3200 * scale) / 2;
  const moonTop = 300 * scale + offsetY;
  const moonBottom = 480 * scale + offsetY;
  const moonRight = 420 * scale + offsetX;
  const besideMoon = moonTop < 64 && moonBottom > 0;
  // The existing left padding and back icon occupy the first 40 points.
  const marginLeft = besideMoon ? Math.max(12, moonRight + 12 - 40) : 12;
  return {
    flex: 1,
    flexShrink: 1,
    marginLeft,
    marginRight: 12,
    textAlign: 'center',
    fontSize: besideMoon ? 18 : 20,
    lineHeight: besideMoon ? 22 : 24,
  };
}
