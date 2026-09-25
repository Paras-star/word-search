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
    words: ['MAP', 'KEY', 'BAG', 'CUP', 'BED'],
    seed: 'word-hunt-onboarding-tutorial-v1',
    options: { directions: ['horizontal', 'vertical'], allowReverse: false },
  },
  {
    id: 'level-1',
    label: 'Level 1 · 5 words',
    words: ['BRAVE', 'QUICK', 'CALM', 'KIND', 'FRESH'],
    seed: 'word-hunt-onboarding-level-1-v1',
    options: { directions: ['horizontal', 'vertical'], allowReverse: false },
  },
  {
    id: 'level-2',
    label: 'Level 2 · 7 words',
    words: ['BRICK', 'BROOM', 'CANDLE', 'MOP', 'WINDOW', 'BASKET', 'MIRROR'],
    seed: 'word-hunt-onboarding-level-2-v1',
    options: { directions: ['horizontal', 'vertical', 'diagonal'], allowReverse: false },
  },
  {
    id: 'level-3',
    label: 'Level 3 · 9 words',
    words: ['HAPPY', 'SMILE', 'LAUGH', 'DANCE', 'DREAM', 'MAGIC', 'PEACE', 'SHINE', 'GLOW'],
    seed: 'word-hunt-onboarding-level-3-v1',
    options: { directions: ['horizontal', 'vertical', 'diagonal'], allowReverse: false },
  },
  {
    id: 'level-4',
    label: 'Level 4 · 12 words',
    words: ['PAPER', 'PENCIL', 'ERASER', 'RULER', 'CRAYON', 'SCHOOL', 'LESSON', 'TEST', 'LUNCH', 'CLASS', 'LEARN', 'WRITE'],
    seed: 'word-hunt-onboarding-level-4-v1',
    options: { directions: ['horizontal', 'vertical', 'diagonal'], allowReverse: true, maxReverseWords: 2 },
  },
  {
    id: 'level-5',
    label: 'Level 5 · 15 words',
    words: ['GARDEN', 'SHADOW', 'SUNRISE', 'BREEZE', 'WISH', 'MEMORY', 'FRIEND', 'STORY', 'SECRET', 'JOURNEY', 'WONDER', 'LUCKY', 'SPARK', 'QUIET', 'COZY'],
    seed: 'word-hunt-onboarding-level-5-v1',
    options: {},
  },
];

export function getOnboardingStep(index: number): OnboardingStep | undefined {
  return ONBOARDING_STEPS[index];
}