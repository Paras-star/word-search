import type { PuzzleGenerationOptions } from './puzzle';

export type OnboardingStep = {
  id: string;
  label: string;
  words: string[];
  seed: string;
  options: PuzzleGenerationOptions;
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'tutorial',
    label: 'Tutorial',
    words: ['CAT', 'DOG', 'SUN', 'STAR', 'MOON'],
    seed: 'word-hunt-onboarding-tutorial-v1',
    options: { directions: ['horizontal', 'vertical'], allowReverse: false },
  },
  {
    id: 'level-1',
    label: 'Level 1 · 5 words',
    words: ['RED', 'BLUE', 'PINK', 'GOLD', 'GRAY'],
    seed: 'word-hunt-onboarding-level-1-v1',
    options: { directions: ['horizontal', 'vertical'], allowReverse: false },
  },
  {
    id: 'level-2',
    label: 'Level 2 · 7 words',
    words: ['FISH', 'BIRD', 'DUCK', 'FROG', 'BEAR', 'LION', 'WOLF'],
    seed: 'word-hunt-onboarding-level-2-v1',
    options: { directions: ['horizontal', 'vertical', 'diagonal'], allowReverse: false },
  },
  {
    id: 'level-3',
    label: 'Level 3 · 9 words',
    words: ['APPLE', 'PEAR', 'PLUM', 'MANGO', 'LEMON', 'GRAPE', 'PEACH', 'MELON', 'BERRY'],
    seed: 'word-hunt-onboarding-level-3-v1',
    options: { directions: ['horizontal', 'vertical', 'diagonal'], allowReverse: false },
  },
  {
    id: 'level-4',
    label: 'Level 4 · 12 words',
    words: ['BOOK', 'PEN', 'NOTE', 'PAGE', 'DESK', 'CHAIR', 'TABLE', 'LAMP', 'CLOCK', 'PHONE', 'MUSIC', 'SMILE'],
    seed: 'word-hunt-onboarding-level-4-v1',
    options: { directions: ['horizontal', 'vertical', 'diagonal'], allowReverse: true, maxReverseWords: 2 },
  },
  {
    id: 'level-5',
    label: 'Level 5 · 15 words',
    words: ['HOME', 'TREE', 'FLOWER', 'CLOUD', 'RAIN', 'WIND', 'SNOW', 'FIRE', 'WATER', 'EARTH', 'LIGHT', 'NIGHT', 'DAY', 'HAPPY', 'SMILE'],
    seed: 'word-hunt-onboarding-level-5-v1',
    options: {},
  },
];

export function getOnboardingStep(index: number): OnboardingStep | undefined {
  return ONBOARDING_STEPS[index];
}