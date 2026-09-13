/**
 * Таймер — второй режим записи, для длинных осознанных блоков.
 *
 * Идущий таймер — настройка устройства, а не запись (Р-18): блок без минут
 * сломал бы суммы, импорт и слияние. Остановка превращает его в обычный
 * блок; день блока — день начала (Р-19).
 *
 * Чистые функции, без React и без базы.
 */

import { nowIso, toDateStr, type DateStr } from '../../core/dates.ts'
import { ulid } from '../../core/id.ts'
import type { TimeBlock } from '../../core/model.ts'
import { MINUTES_PER_DAY } from './categories.ts'

/** Ключ в `settings` (Р-18). Лежит в базе на устройствах — не переименовывать. */
export const TIMER_KEY = 'timer'

export type RunningTimer = {
  categoryId: string
  bgCategoryId?: string
  /** ISO 8601 — момент запуска. */
  startedAt: string
}

const MS_PER_MINUTE = 60_000

/** Таймер из настроек. Кривое значение — «не идёт», а не падение экрана. */
export function parseTimer(value: unknown): RunningTimer | null {
  if (typeof value !== 'object' || value === null) return null
  const { categoryId, bgCategoryId, startedAt } = value as Record<string, unknown>
  if (typeof categoryId !== 'string' || !categoryId) return null
  if (typeof startedAt !== 'string' || Number.isNaN(Date.parse(startedAt))) return null
  if (bgCategoryId !== undefined && typeof bgCategoryId !== 'string') return null
  return bgCategoryId ? { categoryId, bgCategoryId, startedAt } : { categoryId, startedAt }
}

export function startTimer(categoryId: string, now: Date, bgCategoryId?: string): RunningTimer {
  const startedAt = now.toISOString()
  return bgCategoryId ? { categoryId, bgCategoryId, startedAt } : { categoryId, startedAt }
}

function msRunning(timer: RunningTimer, now: Date): number {
  // Часы устройства перевели назад — ноль, а не минус.
  return Math.max(0, now.getTime() - Date.parse(timer.startedAt))
}

/** Сколько идёт — для экрана: полные минуты, как на часах. */
export function runningMinutes(timer: RunningTimer, now: Date): number {
  return Math.floor(msRunning(timer, now) / MS_PER_MINUTE)
}

/**
 * Сколько записать при остановке — подставляется в поле, человек правит.
 * Округление к ближайшей минуте; больше суток не бывает — таймер,
 * забытый на ночь, даёт сутки, и это видно в поле до записи.
 */
export function stopMinutes(timer: RunningTimer, now: Date): number {
  return Math.min(MINUTES_PER_DAY, Math.round(msRunning(timer, now) / MS_PER_MINUTE))
}

/** День блока — день начала (Р-19): ютуб с 23:30 до 00:30 — вчерашний. */
export function timerDate(timer: RunningTimer): DateStr {
  return toDateStr(new Date(Date.parse(timer.startedAt)))
}

/** Блок из остановленного таймера. Минуты проверяются до вызова. */
export function blockFromTimer(timer: RunningTimer, minutes: number): TimeBlock {
  return {
    id: ulid(),
    updatedAt: nowIso(),
    date: timerDate(timer),
    categoryId: timer.categoryId,
    minutes,
    ...(timer.bgCategoryId ? { bgCategoryId: timer.bgCategoryId } : {}),
  }
}
