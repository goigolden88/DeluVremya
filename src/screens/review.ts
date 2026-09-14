/**
 * Обзор недели: какая неделя к обзору, проведён ли он, когда звать
 * (Р-41, Р-42, Р-51), пороги разбора (Р-48).
 *
 * Чистые функции: знают только даты и запись `Review`. Расчёты недели —
 * в модулях, каждый своё; блоки сводит `Review.tsx`.
 */

import {
  addDays,
  daysBetween,
  formatDateLong,
  formatPeriod,
  isDateStr,
  toDateStr,
  weekPeriod,
  weekStart,
  type DateStr,
} from '../core/dates.ts'
import type { Review } from '../core/model.ts'
import { GOAL_STILL_DAYS, MAX_THRESHOLD, MIN_THRESHOLD, STALE_DAYS } from '../modules/notes/review.ts'

// ─── Неделя (Р-41) ─────────────────────────────────────────────────────────

/** Воскресенье — последний день своей недели. */
function isSunday(day: DateStr): boolean {
  return weekPeriod(day).to === day
}

/**
 * Неделя к обзору, её понедельник: в воскресенье — текущая, в остальные
 * дни — прошлая. Пропущенная неделя в долг не встаёт: к обзору всегда одна.
 */
export function dueWeek(today: DateStr): DateStr {
  return isSunday(today) ? weekStart(today) : weekStart(addDays(today, -7))
}

/** Показанная неделя: из адреса — любой её день, не позже текущей; иначе — к обзору. */
export function viewedWeek(param: string | null, today: DateStr): DateStr {
  if (param !== null && isDateStr(param)) {
    const monday = weekStart(param)
    if (monday <= weekStart(today)) return monday
  }
  return dueWeek(today)
}

// ─── Запись обзора (Р-42) ──────────────────────────────────────────────────

/** Id обзора — из понедельника: одна неделя — одна запись на всех устройствах. */
export function reviewId(week: DateStr): string {
  return `review:${week}`
}

/** Проведённый обзор недели. Null — не проведён. */
export function reviewOf(reviews: readonly Review[], week: DateStr): Review | null {
  return reviews.find((review) => !review.deleted && review.weekStart === week) ?? null
}

/**
 * Обзор проведён: новая запись или правка прежней той же недели. Ссылки на
 * наблюдения недели (Р-49) добавляются к прежним, без повторов.
 */
export function markReviewed(existing: Review | null, week: DateStr, at: string, refs: readonly string[] = []): Review {
  const all = [...new Set([...(existing?.refs ?? []), ...refs])]
  return {
    ...(existing ?? {}),
    id: existing?.id ?? reviewId(week),
    updatedAt: at,
    weekStart: week,
    doneAt: at,
    ...(all.length > 0 ? { refs: all } : {}),
  }
}

/** Когда проведён — по часам устройства. Кривое время — без даты, а не падение. */
export function doneText(review: Review): string {
  const at = new Date(review.doneAt)
  if (Number.isNaN(at.getTime())) return 'Обзор проведён'
  const clock = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  return `Обзор проведён ${formatDateLong(toDateStr(at))} в ${clock}`
}

// ─── Когда звать (Р-41, Р-51) ──────────────────────────────────────────────

/** Сколько дней звать, начиная с воскресенья: воскресенье и понедельник. */
export const CALL_DAYS = 2

/**
 * Сколько минут занимает обзор — так его и называет карточка (Р-76). По той
 * же причине висяков за раз не больше `STALE_BATCH` (Р-46).
 */
export const REVIEW_MINUTES = 10

/**
 * Звать ли к обзору сегодня: неделя к обзору — если её обзора нет и сегодня
 * один из дней зова. Null — не звать.
 */
export function reviewCall(reviews: readonly Review[], today: DateStr): DateStr | null {
  const week = dueWeek(today)
  const since = daysBetween(weekPeriod(week).to, today)
  if (since < 0 || since >= CALL_DAYS) return null
  return reviewOf(reviews, week) === null ? week : null
}

export type Notice = { title: string; body: string }

/** Напоминание об обзоре (Р-51). Null — звать не к чему. */
export function reviewNotice(reviews: readonly Review[], today: DateStr): Notice | null {
  const week = reviewCall(reviews, today)
  if (week === null) return null
  return {
    title: 'Обзор недели ждёт',
    body: `${formatPeriod(weekPeriod(week))}: время, план, нормы и висяки — шаги по порядку.`,
  }
}

// ─── Пороги (Р-48) ─────────────────────────────────────────────────────────

/** Ключи в `settings`: пороги у каждого устройства свои. */
export const STALE_KEY = 'reviewStaleDays'
export const GOAL_KEY = 'reviewGoalDays'

export type Thresholds = { stale: number; goal: number }

export const DEFAULT_THRESHOLDS: Thresholds = { stale: STALE_DAYS, goal: GOAL_STILL_DAYS }

export const THRESHOLD_PROBLEM = `Порог — целым числом дней, от ${MIN_THRESHOLD} до ${MAX_THRESHOLD}`

function isThreshold(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_THRESHOLD && value <= MAX_THRESHOLD
}

/** Пороги из настроек. Кривое или пустое — умолчание, а не падение. */
export function parseThresholds(stale: unknown, goal: unknown): Thresholds {
  return {
    stale: isThreshold(stale) ? stale : DEFAULT_THRESHOLDS.stale,
    goal: isThreshold(goal) ? goal : DEFAULT_THRESHOLDS.goal,
  }
}

/** Порог из поля: целые дни в пределах. Null — кривое. */
export function readThreshold(input: string): number | null {
  const text = input.trim()
  const value = Number(text)
  return /^\d+$/.test(text) && isThreshold(value) ? value : null
}
