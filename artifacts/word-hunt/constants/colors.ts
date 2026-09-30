import { homeColors } from './homePalette';

const colors = {
  light: {
    text: homeColors.ink,
    tint: homeColors.teal,

    background: homeColors.background,
    foreground: homeColors.ink,

    card: homeColors.tile,
    cardForeground: homeColors.ink,

    primary: homeColors.teal,
    primaryForeground: '#FFFFFF',

    secondary: homeColors.tileBorder,
    secondaryForeground: homeColors.ink,

    muted: homeColors.goldSoft,
    mutedForeground: homeColors.softInk,

    accent: homeColors.goldSoft,
    accentForeground: homeColors.gold,

    destructive: homeColors.gold,
    destructiveForeground: '#FFFFFF',

    border: homeColors.tileBorder,
    input: homeColors.tileBorder,
    buttonBorder: homeColors.tealBorder,
    orange: homeColors.gold,
    pink: homeColors.gold,
    success: homeColors.teal,
    warning: homeColors.gold,
    foundWord: homeColors.softInk,
    inkSoft: homeColors.softInk,
  },

  radius: 18,
};

export default colors;
