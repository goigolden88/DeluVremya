/**
 * «По дням недели» в обзоре (Р-110): какие категории свойственны каждому дню
 * недели за много недель, а не за одну.
 *
 * Окно — `WEEKDAY_WEEKS` полных недель, кончая обозреваемой, если она
 * закончилась, иначе — прошлой. День учёта — день с хоть одним живым блоком.
 * Категория свойственна дню недели, если была хотя бы в половине его дней
 * учёта (`WEEKDAY_SHARE`) и как минимум в `WEEKDAY_RATIO` раза чаще, чем
 * в остальные дни недели вместе: доля его дней против доли всех остальных
 * дней учёта окна. Считается основная категория блока, фоновая — нет;
 * архивная — считается; блок на надгробии — под живой, куда оно указывает
 * (Р-29, тем же расчётом, что слияние после обмена).
 *
 * Чистые функции, без React и без базы (02-Архитектура, «Структура кода»).
 */

import { addDays, daysBetween, weekPeriod, weekStart, type DateStr, type Period } from '../../shared/core/dates.ts'
import type { Category, TimeBlock } from '../../app/model.ts'
import { reconcilePlan } from './categories.ts'
import { blocksIn } from './period.ts'

/** Сколько полных недель в окне. */
export const WEEKDAY_WEEKS = 8
/** Сколько дней учёта такого дня в окне нужно, чтобы судить. */
export const WEEKDAY_MIN_DAYS = 3
/** Часть дней учёта этого дня недели, в которых категория была: не меньше. */
export const WEEKDAY_SHARE: Readonly<{ part: number; of: number }> = { part: 1, of: 2 }
/** Во сколько раз чаще, чем в остальные дни недели: не меньше. */
export const WEEKDAY_RATIO: number = 2
/** Сколько категорий на день, не больше. */
export const WEEKDAY_TOP = 3

/** Дней в неделе: пн — 0 … вс — 6. */
const DAYS_PER_WEEK = 7

/** Категория, свойственная дню недели. */
export type WeekdayItem = {
  categoryId: string
  /** Удалённая — своим последним именем; неизвестная — null, подпись решает экран. */
  name: string | null
  /** В скольких днях учёта этого дня недели она была — основание «6 из 8». */
  days: number
  /** Минуты за эти дни вместе. */
  minutes: number
  /** В среднем минут в день, когда была. */
  average: number
}

export type WeekdayRow = {
  /** Пн — 0 … вс — 6. */
  weekday: number
  /** Дней учёта этого дня недели в окне. */
  days: number
  /** Дней учёта меньше `WEEKDAY_MIN_DAYS` — не судится. */
  few: boolean
  /** Подошедшие, самые частые первыми; не больше `WEEKDAY_TOP`. */
  items: WeekdayItem[]
}

export type WeekdayPattern = { window: Period; rows: WeekdayRow[] }

/** День недели: пн — 0 … вс — 6. */
export function weekdayIndex(day: DateStr): number {
  return daysBetween(weekStart(day), day)
}

/**
 * Окно: `WEEKDAY_WEEKS` полных недель, кончая неделей `week` (любой её день),
 * если она закончилась до `today`, иначе — прошлой.
 */
export function weekdayWindow(week: DateStr, today: DateStr): Period {
  const own = weekPeriod(week)
  const last = own.to < today ? own : weekPeriod(addDays(own.from, -DAYS_PER_WEEK))
  return { from: addDays(last.from, -DAYS_PER_WEEK * (WEEKDAY_WEEKS - 1)), to: last.to }
}

/** Блоки окна, перенесённые от надгробий к живым категориям (Р-29). */
function liveBlocks(blocks: readonly TimeBlock[], categories: readonly Category[], window: Period): TimeBlock[] {
  const list = blocksIn(blocks, window)
  const moved = new Map(reconcilePlan(categories, [], list).blocks.map((block) => [block.id, block]))
  return list.map((block) => moved.get(block.id) ?? block)
}

/** Свойственна ли: половина дней этого дня недели и вдвое чаще остальных — в целых числах, без деления. */
function typical(own: number, ownDays: number, other: number, otherDays: number): boolean {
  if (own * WEEKDAY_SHARE.of < ownDays * WEEKDAY_SHARE.part) return false
  // own / ownDays ≥ RATIO · other / otherDays; остальных дней учёта нет — сравнивать не с чем, подходит.
  return own * otherDays >= WEEKDAY_RATIO * other * ownDays
}

/** Что свойственно каждому дню недели в окне обзора недели `week`. */
export function weekdayPattern(
  blocks: readonly TimeBlock[],
  categories: readonly Category[],
  week: DateStr,
  today: DateStr,
): WeekdayPattern {
  const window = weekdayWindow(week, today)
  const list = liveBlocks(blocks, categories, window)
  const known = new Map(categories.map((category) => [category.id, category]))
  const order = (id: string) => known.get(id)?.order ?? Number.POSITIVE_INFINITY

  // Дни учёта по дням недели; у категории — её дни и минуты по дням недели.
  const days = Array.from({ length: DAYS_PER_WEEK }, () => new Set<DateStr>())
  const byCategory = new Map<string, { days: Set<DateStr>[]; minutes: number[] }>()
  for (const block of list) {
    const weekday = weekdayIndex(block.date)
    days[weekday]?.add(block.date)
    let entry = byCategory.get(block.categoryId)
    if (!entry) {
      entry = {
        days: Array.from({ length: DAYS_PER_WEEK }, () => new Set<DateStr>()),
        minutes: Array.from({ length: DAYS_PER_WEEK }, () => 0),
      }
      byCategory.set(block.categoryId, entry)
    }
    entry.days[weekday]?.add(block.date)
    entry.minutes[weekday] = (entry.minutes[weekday] ?? 0) + block.minutes
  }
  const counts = days.map((each) => each.size)
  const allDays = counts.reduce((sum, count) => sum + count, 0)

  const rows = counts.map((count, weekday) => {
    if (count < WEEKDAY_MIN_DAYS) return { weekday, days: count, few: true, items: [] }
    const items: WeekdayItem[] = []
    for (const [categoryId, entry] of byCategory) {
      const own = entry.days[weekday]?.size ?? 0
      if (own === 0) continue
      const all = entry.days.reduce((sum, each) => sum + each.size, 0)
      if (!typical(own, count, all - own, allDays - count)) continue
      const minutes = entry.minutes[weekday] ?? 0
      items.push({ categoryId, name: known.get(categoryId)?.name ?? null, days: own, minutes, average: minutes / own })
    }
    items.sort(
      (a, b) =>
        b.days - a.days ||
        b.minutes - a.minutes ||
        order(a.categoryId) - order(b.categoryId) ||
        (a.name ?? '').localeCompare(b.name ?? '', 'ru'),
    )
    return { weekday, days: count, few: false, items: items.slice(0, WEEKDAY_TOP) }
  })

  return { window, rows }
}
