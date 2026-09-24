import type { Category } from '@/data/categories';

const FIRST_ANIMAL_WORDS = [
  'CAT', 'DOG', 'FOX',
  'LION', 'TIGER', 'ZEBRA',
  'GIRAFFE', 'PENGUIN', 'ELEPHANT',
];

export function getPuzzleCategory(category: Category, completedLevels: string[]): Category {
  if (category.id === 'animals' && !completedLevels.includes(category.id)) {
    return { ...category, words: FIRST_ANIMAL_WORDS };
  }
  return category;
}