/**
 * Тексты учёта времени. Числа в них — из констант кода, а не цифрами
 * (правило в CLAUDE.md).
 */

import { formatDateLong, plural, type DateStr } from '../../core/dates.ts'
import { MINUTES_PER_DAY, type CategoryKind, type NameProblem, type PresetProblem } from './categories.ts'
import { DAY_WINDOW } from './day.ts'
import type { BlockProblem } from './retro.ts'

/**
 * Признак категории. Нужен только обзору недели (Р-05): на экране дня
 * он не красит ничего, и слова «вредное» нет нигде.
 */
export const KIND_LABELS: Record<CategoryKind, string> = {
  useful: 'полезное',
  neutral: 'нейтральное',
  idle: 'праздное',
}

export const NAME_PROBLEMS: Record<NameProblem, string> = {
  empty: 'Название пустое',
  duplicate: 'Такая категория уже есть',
  archived: 'Такая категория лежит в архиве — верните её оттуда',
}

export const PRESET_PROBLEMS: Record<PresetProblem, string> = {
  range: `Минуты — целым числом, от одной до ${MINUTES_PER_DAY}`,
  duplicate: 'Такая кнопка у категории уже есть',
}

/** Подпись кнопки: «+30». Категория стоит рядом. */
export function presetLabel(minutes: number): string {
  return `+${minutes}`
}

const MINUTES_PER_HOUR = 60

/** `45` → `45 мин`, `60` → `1 ч`, `90` → `1 ч 30 мин`. */
export function formatMinutes(total: number): string {
  const rounded = Math.max(0, Math.round(total))
  const hours = Math.floor(rounded / MINUTES_PER_HOUR)
  const minutes = rounded % MINUTES_PER_HOUR
  if (hours === 0) return `${minutes} мин`
  return minutes === 0 ? `${hours} ч` : `${hours} ч ${minutes} мин`
}

/** Категория блока, которой нет ни живой, ни в надгробиях. */
export const UNKNOWN_CATEGORY = 'без категории'

export function blocksWord(count: number): string {
  return plural(count, ['блок', 'блока', 'блоков'])
}

/** Главная строка итога: сумма с основанием — по скольким блокам. */
export function summaryLine(total: number, count: number): string {
  return count === 0 ? 'За день ничего не учтено' : `Учтено ${formatMinutes(total)} · ${count} ${blocksWord(count)}`
}

/** Неучтённое — с основанием: от чего оно считается (Р-21). */
export function unaccountedLine(unaccounted: number, elapsed: number): string {
  return `Неучтено ${formatMinutes(unaccounted)} из прошедших ${formatMinutes(elapsed)} окна дня`
}

/** Отклик на тап: что записано и сколько теперь по этой категории за день. */
export function addedLine(name: string, minutes: number, categoryTotal: number): string {
  return `Записано: ${name}, ${formatMinutes(minutes)}. По категории за день — ${formatMinutes(categoryTotal)}`
}

export const BLOCK_PROBLEMS: Record<BlockProblem, string> = {
  category: 'Не выбрана категория',
  minutes: PRESET_PROBLEMS.range,
  date: 'День не разобрался',
  future: 'Учёт — про то, что было: день в будущем не записывается',
  'same-bg': 'Фоном — другая категория: та же самая была бы тем же часом, записанным дважды',
}

/** Идущий таймер: что, сколько и что фоном. */
export function runningLine(name: string, minutes: number, background?: string | null): string {
  const line = `Идёт: ${name} · ${formatMinutes(minutes)}`
  return background ? `${line}, фоном ${background}` : line
}

function clock(moment: Date): string {
  return `${String(moment.getHours()).padStart(2, '0')}:${String(moment.getMinutes()).padStart(2, '0')}`
}

/**
 * С какого времени идёт. Запущен вчера — сказано, что блок ляжет на тот
 * день (Р-19): иначе запись после полуночи пропала бы из сегодняшнего
 * итога молча.
 */
export function startedLine(start: Date, date: DateStr, today: DateStr): string {
  return date === today
    ? `С ${clock(start)}`
    : `С ${clock(start)}, ${formatDateLong(date)} — блок ляжет на тот день`
}

/** Что записано. Не сегодня — с датой: блок не виден в итоге дня, и это сказано. */
export function savedLine(name: string, minutes: number, date: DateStr, today: DateStr): string {
  return date === today
    ? `Записано: ${name}, ${formatMinutes(minutes)}`
    : `Записано на ${formatDateLong(date)}: ${name}, ${formatMinutes(minutes)}`
}

/** Пояснение к «неучтено» под итогом дня. */
export function windowNote(): string {
  return `Окно дня — с ${DAY_WINDOW.from} до ${DAY_WINDOW.to}: неучтённое считается от прошедшей его части, а не от суток.`
}
