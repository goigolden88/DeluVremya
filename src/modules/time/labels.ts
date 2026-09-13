/**
 * Тексты учёта времени. Числа в них — из констант кода, а не цифрами
 * (правило в CLAUDE.md).
 */

import { MINUTES_PER_DAY, type CategoryKind, type NameProblem, type PresetProblem } from './categories.ts'

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
