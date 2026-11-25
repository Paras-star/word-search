import { isDailyDatePlayable, localDateKey } from '@/game/daily';

export const DAILY_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAILY_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export type DailyDateState = 'selected' | 'completed' | 'available' | 'plain';

export type DailyCell = {
  key: string;
  day: number;
  state: DailyDateState;
  completed: boolean;
  selected: boolean;
  selectable: boolean;
  today: boolean;
  label: string;
};

/** Month grid padded to whole weeks: 4, 5 or 6 rows of seven slots. */
export function monthCells(month: Date): (Date | null)[] {
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array<null>(new Date(month.getFullYear(), month.getMonth(), 1).getDay()).fill(null),
    ...Array.from({ length: count }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** Any date in the catch-up window may be selected, including completed ones. */
export function isDailyDateSelectable(key: string, now: Date): boolean {
  return isDailyDatePlayable(key, now);
}

/** An out-of-window selection falls back to today so it can never launch. */
export function effectiveSelection(selected: string | null, now: Date): string {
  return selected && isDailyDateSelectable(selected, now) ? selected : localDateKey(now);
}

/** Completed puzzles are never replayed; expired dates never launch. */
export function launchableDate(selected: string, now: Date, completed: ReadonlySet<string>): string | null {
  return isDailyDatePlayable(selected, now) && !completed.has(selected) ? selected : null;
}

export function describeDailyCell(cell: { date: Date; today: boolean; completed: boolean; selected: boolean; selectable: boolean }): string {
  const parts = [`${DAILY_MONTHS[cell.date.getMonth()]} ${cell.date.getDate()}`];
  if (cell.today) parts.push('today');
  if (cell.selected) parts.push('selected');
  if (cell.completed) parts.push('completed');
  else if (cell.selectable) parts.push('playable');
  else parts.push('unavailable');
  return parts.join(', ');
}

export function dailyCellModel(date: Date, now: Date, completed: ReadonlySet<string>, selected: string): DailyCell {
  const key = localDateKey(date);
  const selectable = isDailyDateSelectable(key, now);
  const isCompleted = completed.has(key);
  const isSelected = selectable && key === selected;
  const today = key === localDateKey(now);
  const state: DailyDateState = isCompleted ? 'completed' : isSelected ? 'selected' : selectable ? 'available' : 'plain';
  return {
    key, day: date.getDate(), state, completed: isCompleted, selected: isSelected, selectable, today,
    label: describeDailyCell({ date, today, completed: isCompleted, selected: isSelected, selectable }),
  };
}

export function ctaAccessibilityLabel(selected: string, now: Date, completed: ReadonlySet<string>): string {
  const date = new Date(Number(selected.slice(0, 4)), Number(selected.slice(5, 7)) - 1, Number(selected.slice(8, 10)));
  const name = `${DAILY_MONTHS[date.getMonth()]} ${date.getDate()}`;
  if (completed.has(selected)) return `Play hunt, unavailable: ${name} is already completed`;
  if (!isDailyDatePlayable(selected, now)) return `Play hunt, unavailable: ${name} is outside the catch-up window`;
  return selected === localDateKey(now) ? `Play today's hunt, ${name}` : `Play catch-up hunt for ${name}`;
}
