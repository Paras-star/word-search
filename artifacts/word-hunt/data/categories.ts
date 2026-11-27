export type Category = {
  id: string;
  name: string;
  emoji: string;
  words: string[];
  wordLabels?: Record<string, string>;
};

export const CATEGORIES: Category[] = [
  { id: 'animals', name: 'Animals', emoji: '🐾', words: ['CAT', 'DOG', 'LION', 'TIGER', 'ELEPHANT', 'GIRAFFE', 'ZEBRA', 'MONKEY', 'PENGUIN', 'DOLPHIN', 'EAGLE', 'WOLF', 'BEAR', 'FOX', 'RABBIT', 'SNAKE', 'TURTLE', 'HORSE'] },
  { id: 'food', name: 'Food', emoji: '🥗', words: ['PIZZA', 'BURGER', 'SUSHI', 'PASTA', 'SALAD', 'RICE', 'BREAD', 'SOUP', 'TACO', 'WAFFLE', 'PANCAKE', 'NOODLE', 'STEAK', 'CHEESE', 'COOKIE'] },
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
  { id: 'human-anatomy', name: 'Human Anatomy', emoji: '🧠', words: ['SKULL', 'SPINE', 'RIBCAGE', 'SHOULDER', 'ELBOW', 'WRIST', 'KNUCKLE', 'THIGH', 'ANKLE', 'HEEL', 'MUSCLE', 'TENDON', 'CARTILAGE', 'LUNG', 'KIDNEY', 'PANCREAS'] },
  { id: 'emotions', name: 'Emotions', emoji: '💛', words: ['COURAGE', 'CURIOSITY', 'PATIENCE', 'HONESTY', 'KINDNESS', 'JEALOUSY', 'WONDER', 'ANXIETY', 'PRIDE', 'EMPATHY', 'RESILIENCE', 'LOYALTY', 'HUMILITY', 'OPTIMISM', 'FEAR', 'GRATITUDE'] },
  { id: 'workshop', name: 'Workshop', emoji: '🔧', words: ['HAMMER', 'WRENCH', 'SCREWDRIVER', 'PLIERS', 'CHISEL', 'DRILL', 'HACKSAW', 'CLAMP', 'ANVIL', 'SOLDERING', 'SANDPAPER', 'LEVELER', 'RIVET', 'PULLEY', 'VISE', 'TAPEMEASURE'], wordLabels: { TAPEMEASURE: 'Tape Measure' } },
  { id: 'mythology', name: 'Mythology', emoji: '🐉', words: ['ZEUS', 'ATHENA', 'ODIN', 'THOR', 'LOKI', 'ANUBIS', 'RA', 'HADES', 'MEDUSA', 'PEGASUS', 'PHOENIX', 'CYCLOPS', 'MERMAID', 'CENTAUR', 'DRAGON', 'VALKYRIE'] },
  { id: 'kitchen', name: 'Kitchen', emoji: '🍴', words: ['WHISK', 'LADLE', 'SPATULA', 'COLANDER', 'GRATER', 'PEELER', 'KETTLE', 'TOASTER', 'BLENDER', 'OVEN', 'SKILLET', 'SAUCEPAN', 'TONGS', 'APRON', 'ROLLINGPIN', 'CUTTINGBOARD'], wordLabels: { ROLLINGPIN: 'Rolling Pin', CUTTINGBOARD: 'Cutting Board' } },
  { id: 'transport', name: 'Transport', emoji: '✈️', words: ['BICYCLE', 'SCOOTER', 'MOTORCYCLE', 'BUS', 'TRAM', 'SUBWAY', 'HELICOPTER', 'AIRPLANE', 'GLIDER', 'FERRY', 'YACHT', 'CANOE', 'TRACTOR', 'AMBULANCE', 'LOCOMOTIVE', 'RICKSHAW'] },
  { id: 'buildings', name: 'Buildings', emoji: '🏢', words: ['CASTLE', 'MUSEUM', 'LIBRARY', 'HOSPITAL', 'STADIUM', 'TEMPLE', 'MOSQUE', 'CHURCH', 'PALACE', 'LIGHTHOUSE', 'FACTORY', 'AIRPORT', 'STATION', 'THEATRE', 'MONUMENT', 'AQUARIUM'] },
];

export function getCategory(id: string | undefined): Category {
  return CATEGORIES.find((category) => category.id === id) ?? CATEGORIES[0];
}