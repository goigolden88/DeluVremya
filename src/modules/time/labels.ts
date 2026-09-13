/**
 * Тексты учёта времени. Числа в них — из констант кода, а не цифрами
 * (правило в CLAUDE.md).
 */

import { plural } from '../../core/dates.ts'
import { MINUTES_PER_DAY, type CategoryKind, type NameProblem, type PresetProblem } from './categories.ts'
import { DAY_WINDOW } from './day.ts'

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

/** Пояснение к «неучтено» под итогом дня. */
export function windowNote(): string {
  return `Окно дня — с ${DAY_WINDOW.from} до ${DAY_WINDOW.to}: неучтённое считается от прошедшей его части, а не от суток.`
}
