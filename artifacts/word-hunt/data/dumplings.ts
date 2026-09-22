import type { ImageSourcePropType } from 'react-native';

export const DUMPLING_RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'] as const;
export type DumplingRarity = (typeof DUMPLING_RARITIES)[number];

export type Dumpling = {
  id: string;
  name: string;
  rarity: DumplingRarity;
  asset: ImageSourcePropType;
};

export const DUMPLINGS: Dumpling[] = [
  { id: 'ivory-classic', name: 'Ivory Classic', rarity: 'Common', asset: require('../assets/images/dumplings/common/ivory-classic.png') },
  { id: 'pink-blossom', name: 'Pink Blossom', rarity: 'Common', asset: require('../assets/images/dumplings/common/pink-blossom.png') },
  { id: 'green-garden', name: 'Green Garden', rarity: 'Common', asset: require('../assets/images/dumplings/common/green-garden-v2.png') },
  { id: 'golden-sunny', name: 'Golden Sunny', rarity: 'Common', asset: require('../assets/images/dumplings/common/golden-sunny.png') },
  { id: 'sky-blue', name: 'Sky Blue', rarity: 'Common', asset: require('../assets/images/dumplings/common/sky-blue.png') },
  { id: 'pumpkin-puff', name: 'Pumpkin Puff', rarity: 'Common', asset: require('../assets/images/dumplings/common/pumpkin-puff.png') },
  { id: 'lavender-sweet', name: 'Lavender Sweet', rarity: 'Common', asset: require('../assets/images/dumplings/common/lavender-sweet.png') },
  { id: 'sesame-cozy', name: 'Sesame Cozy', rarity: 'Common', asset: require('../assets/images/dumplings/common/sesame-cozy.png') },
  { id: 'cream-puff', name: 'Cream Puff', rarity: 'Common', asset: require('../assets/images/dumplings/common/cream-puff.png') },
  { id: 'minty-smile', name: 'Minty Smile', rarity: 'Common', asset: require('../assets/images/dumplings/common/minty-smile.png') },
  { id: 'coral-cheer', name: 'Coral Cheer', rarity: 'Common', asset: require('../assets/images/dumplings/common/coral-cheer.png') },
  { id: 'mushroom-mist', name: 'Mushroom Mist', rarity: 'Common', asset: require('../assets/images/dumplings/common/mushroom-mist.png') },
  { id: 'little-mushroom', name: 'Little Mushroom', rarity: 'Uncommon', asset: require('../assets/images/dumplings/uncommon/little-mushroom.png') },
  { id: 'golden-sesame', name: 'Golden Sesame', rarity: 'Uncommon', asset: require('../assets/images/dumplings/uncommon/golden-sesame.png') },
  { id: 'garden-veggie', name: 'Garden Veggie', rarity: 'Uncommon', asset: require('../assets/images/dumplings/uncommon/garden-veggie.png') },
  { id: 'red-pepper', name: 'Red Pepper', rarity: 'Uncommon', asset: require('../assets/images/dumplings/uncommon/red-pepper.png') },
  { id: 'purple-taro', name: 'Purple Taro', rarity: 'Uncommon', asset: require('../assets/images/dumplings/uncommon/purple-taro.png') },
  { id: 'black-sesame', name: 'Black Sesame', rarity: 'Uncommon', asset: require('../assets/images/dumplings/uncommon/black-sesame.png') },
  { id: 'double-joy', name: 'Double Joy', rarity: 'Uncommon', asset: require('../assets/images/dumplings/uncommon/double-joy.png') },
  { id: 'fire-dumpling', name: 'Fire Dumpling', rarity: 'Rare', asset: require('../assets/images/dumplings/rare/fire-dumpling.png') },
  { id: 'moon-dumpling', name: 'Moon Dumpling', rarity: 'Rare', asset: require('../assets/images/dumplings/rare/moon-dumpling.png') },
  { id: 'dragon-dumpling', name: 'Dragon Dumpling', rarity: 'Rare', asset: require('../assets/images/dumplings/rare/dragon-dumpling.png') },
  { id: 'cloud-dumpling', name: 'Cloud Dumpling', rarity: 'Rare', asset: require('../assets/images/dumplings/rare/cloud-dumpling.png') },
  { id: 'golden-dumpling', name: 'Golden Dumpling', rarity: 'Rare', asset: require('../assets/images/dumplings/rare/golden-dumpling.png') },
  { id: 'aurora-dumpling', name: 'Aurora Dumpling', rarity: 'Epic', asset: require('../assets/images/dumplings/epic/aurora-dumpling.png') },
  { id: 'sakura-blossom', name: 'Sakura Blossom', rarity: 'Epic', asset: require('../assets/images/dumplings/epic/sakura-blossom.png') },
  { id: 'crystal-berry', name: 'Crystal Berry', rarity: 'Epic', asset: require('../assets/images/dumplings/epic/crystal-berry.png') },
  { id: 'solar-gold', name: 'Solar Gold', rarity: 'Epic', asset: require('../assets/images/dumplings/epic/solar-gold.png') },
  { id: 'celestial-emperor', name: 'Celestial Emperor', rarity: 'Legendary', asset: require('../assets/images/dumplings/legendary/celestial-emperor.png') },
  { id: 'dragon-jade', name: 'Dragon Jade', rarity: 'Legendary', asset: require('../assets/images/dumplings/legendary/dragon-jade.png') },
];

export const DUMPLING_BY_ID = Object.fromEntries(DUMPLINGS.map((dumpling) => [dumpling.id, dumpling])) as Record<string, Dumpling>;

export const RARITY_PRESENTATION: Record<DumplingRarity, { color: string; glow: string; particleCount: number }> = {
  Common: { color: '#7A8192', glow: '#D9DDE7', particleCount: 5 },
  Uncommon: { color: '#2FA96E', glow: '#8AE2B4', particleCount: 7 },
  Rare: { color: '#2F80ED', glow: '#81B8FF', particleCount: 9 },
  Epic: { color: '#9B51E0', glow: '#D9A7FF', particleCount: 12 },
  Legendary: { color: '#E5A11A', glow: '#FFE38B', particleCount: 15 },
};