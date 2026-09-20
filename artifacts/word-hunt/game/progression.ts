export function isCategoryUnlocked(index: number, completedLevels: string[], categories: { id: string }[]): boolean {
  if (index === 0) return true;
  return completedLevels.includes(categories[index - 1]?.id ?? '');
}

export function nextCategoryId(categoryId: string, categories: { id: string }[]): string | undefined {
  const index = categories.findIndex((category) => category.id === categoryId);
  return categories[index + 1]?.id;
}