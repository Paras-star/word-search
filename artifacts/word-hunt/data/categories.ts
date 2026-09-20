export type Category = {
  id: string;
  name: string;
  emoji: string;
  words: string[];
};

export const CATEGORIES: Category[] = [
  { id: 'animals', name: 'Animals', emoji: '🐾', words: ['CAT', 'DOG', 'LION', 'TIGER', 'ELEPHANT', 'GIRAFFE', 'ZEBRA', 'MONKEY', 'PENGUIN', 'DOLPHIN', 'EAGLE', 'WOLF', 'BEAR', 'FOX', 'RABBIT', 'SNAKE', 'TURTLE', 'HORSE'] },
  { id: 'food', name: 'Food', emoji: '🍴', words: ['PIZZA', 'BURGER', 'SUSHI', 'PASTA', 'SALAD', 'RICE', 'BREAD', 'SOUP', 'TACO', 'WAFFLE', 'PANCAKE', 'NOODLE', 'STEAK', 'CHEESE', 'COOKIE'] },
  { id: 'sports', name: 'Sports', emoji: '🏀', words: ['SOCCER', 'TENNIS', 'BASKETBALL', 'BASEBALL', 'SWIMMING', 'CYCLING', 'BOXING', 'GOLF', 'RUGBY', 'CRICKET', 'HOCKEY', 'RUNNING', 'SKIING', 'SURFING'] },
  { id: 'countries', name: 'Countries', emoji: '🌎', words: ['FRANCE', 'JAPAN', 'BRAZIL', 'CANADA', 'INDIA', 'CHINA', 'SPAIN', 'ITALY', 'EGYPT', 'MEXICO', 'RUSSIA', 'AUSTRALIA', 'GERMANY', 'NIGERIA', 'THAILAND'] },
  { id: 'colors', name: 'Colors', emoji: '🎨', words: ['RED', 'BLUE', 'GREEN', 'YELLOW', 'PURPLE', 'ORANGE', 'PINK', 'BLACK', 'WHITE', 'BROWN', 'GRAY', 'CYAN', 'GOLD', 'SILVER', 'VIOLET'] },
  { id: 'fruits', name: 'Fruits', emoji: '🍊', words: ['APPLE', 'MANGO', 'BANANA', 'GRAPE', 'LEMON', 'PEACH', 'PLUM', 'ORANGE', 'CHERRY', 'MELON', 'PAPAYA', 'GUAVA', 'KIWI', 'PEAR', 'BERRY'] },
  { id: 'space', name: 'Space', emoji: '✨', words: ['MOON', 'STAR', 'SUN', 'PLANET', 'COMET', 'GALAXY', 'NEBULA', 'ASTEROID', 'ORBIT', 'SATURN', 'JUPITER', 'MARS', 'VENUS', 'MERCURY', 'COSMOS'] },
  { id: 'ocean-life', name: 'Ocean Life', emoji: '🌊', words: ['SHARK', 'WHALE', 'OCTOPUS', 'CRAB', 'LOBSTER', 'SHRIMP', 'CORAL', 'JELLYFISH', 'SEAHORSE', 'CLAM', 'OTTER', 'SEAL', 'TUNA', 'SQUID'] },
  { id: 'music', name: 'Music', emoji: '🎵', words: ['GUITAR', 'PIANO', 'DRUMS', 'VIOLIN', 'TRUMPET', 'FLUTE', 'BASS', 'RHYTHM', 'MELODY', 'CHORD', 'TEMPO', 'JAZZ', 'ROCK', 'BLUES', 'OPERA'] },
  { id: 'movies', name: 'Movies', emoji: '🎬', words: ['ACTION', 'DRAMA', 'COMEDY', 'HORROR', 'ROMANCE', 'THRILLER', 'FANTASY', 'MYSTERY', 'WESTERN', 'SEQUEL', 'TRAILER', 'CINEMA', 'ACTOR', 'SCENE'] },
  { id: 'nature', name: 'Nature', emoji: '🌿', words: ['FOREST', 'RIVER', 'MOUNTAIN', 'OCEAN', 'DESERT', 'JUNGLE', 'VALLEY', 'ISLAND', 'VOLCANO', 'GLACIER', 'PRAIRIE', 'CANYON', 'MARSH', 'TUNDRA'] },
  { id: 'technology', name: 'Technology', emoji: '⚡', words: ['COMPUTER', 'INTERNET', 'ROBOT', 'PHONE', 'TABLET', 'KEYBOARD', 'MONITOR', 'BATTERY', 'CIRCUIT', 'CAMERA', 'LASER', 'SERVER', 'NETWORK', 'SOFTWARE'] },
  { id: 'jobs', name: 'Jobs', emoji: '💼', words: ['DOCTOR', 'TEACHER', 'PILOT', 'CHEF', 'LAWYER', 'NURSE', 'ENGINEER', 'ARTIST', 'FARMER', 'WRITER', 'POLICE', 'FIREFIGHTER', 'ARCHITECT', 'SCIENTIST'] },
  { id: 'clothing', name: 'Clothing', emoji: '🧢', words: ['SHIRT', 'PANTS', 'DRESS', 'JACKET', 'SHOES', 'SOCKS', 'HAT', 'SCARF', 'GLOVES', 'BELT', 'BOOTS', 'COAT', 'SKIRT', 'SWEATER', 'SHORTS'] },
  { id: 'vegetables', name: 'Vegetables', emoji: '🥕', words: ['CARROT', 'POTATO', 'TOMATO', 'ONION', 'GARLIC', 'PEPPER', 'CORN', 'BROCCOLI', 'SPINACH', 'CABBAGE', 'CELERY', 'RADISH', 'PUMPKIN', 'ZUCCHINI'] },
];

export function getCategory(id: string | undefined): Category {
  return CATEGORIES.find((category) => category.id === id) ?? CATEGORIES[0];
}