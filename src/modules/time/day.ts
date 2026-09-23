/**
 * Учёт времени за день: блок из кнопки, блоки дня, итог.
 *
 * Чистые функции, без React и без базы (02-Архитектура, «Структура кода»).
 */

import { isDateStr, nowIso, toDateStr, type DateStr } from '../../shared/core/dates.ts'
import { ulid } from '../../shared/core/id.ts'
import type { Category, Preset, TimeBlock } from '../../app/model.ts'

/**
 * Окно дня в часах, с `from` до `to` (Р-21). Неучтённое считается от
 * прошедшей его части, а не от суток: требование закрыть все двадцать
 * четыре часа — самый быстрый способ бросить учёт.
 */
export const DAY_WINDOW = { from: 8, to: 24 } as const

const MINUTES_PER_HOUR = 60

/**
 * Какой день показать на «Времени» (Р-25): из адреса — прошлый или
 * сегодняшний; кривой, пустой или будущий — сегодня. Учёт про то, что
 * было, и в будущее экран не листается.
 */
export function viewedDay(param: string | null, today: DateStr): DateStr {
  return param !== null && isDateStr(param) && param <= today ? param : today
}

/** Тап по кнопке «Чтение +30» — новый блок на этот день (Р-20). */
export function blockFromPreset(preset: Preset, date: DateStr): TimeBlock {
  return { id: ulid(), updatedAt: nowIso(), date, categoryId: preset.categoryId, minutes: preset.minutes }
}

/** Живые блоки дня, свежие сверху — по id: ULID сортируется по времени создания. */
export function blocksOn(blocks: readonly TimeBlock[], date: DateStr): TimeBlock[] {
  return blocks
    .filter((block) => !block.deleted && block.date === date)
    .sort((a, b) => b.id.localeCompare(a.id))
}

/**
 * Название категории по id. Удалённая называется своим последним именем —
 * блок её помнит. Неизвестная — null: подпись решает экран.
 */
export function categoryName(categories: readonly Category[], id: string): string | null {
  return categories.find((category) => category.id === id)?.name ?? null
}

export type CategoryTotal = {
  categoryId: string
  name: string | null
  minutes: number
  /** Сколько блоков в сумме — основание числа. */
  count: number
}

/**
 * Суммы по категориям в порядке категорий; неизвестные — в конце.
 * `pick` выбирает, по какому полю блока суммировать: основная категория
 * или фоновая.
 */
function totals(
  blocks: readonly TimeBlock[],
  categories: readonly Category[],
  pick: (block: TimeBlock) => string | undefined,
): CategoryTotal[] {
  const byId = new Map<string, CategoryTotal>()
  for (const block of blocks) {
    const id = pick(block)
    if (!id) continue
    const entry = byId.get(id) ?? { categoryId: id, name: categoryName(categories, id), minutes: 0, count: 0 }
    entry.minutes += block.minutes
    entry.count += 1
    byId.set(id, entry)
  }

  const order = (id: string) => categories.find((category) => category.id === id)?.order ?? Number.POSITIVE_INFINITY
  return [...byId.values()].sort(
    (a, b) => order(a.categoryId) - order(b.categoryId) || (a.name ?? '').localeCompare(b.name ?? '', 'ru'),
  )
}

/**
 * Сколько минут окна дня уже прошло. Прошедший день — всё окно, будущий —
 * ноль, сегодня — от начала окна до сейчас, не больше окна.
 */
export function windowElapsed(date: DateStr, now: Date, window: { from: number; to: number } = DAY_WINDOW): number {
  const length = (window.to - window.from) * MINUTES_PER_HOUR
  const today = toDateStr(now)
  if (date < today) return length
  if (date > today) return 0
  const passed = now.getHours() * MINUTES_PER_HOUR + now.getMinutes() - window.from * MINUTES_PER_HOUR
  return Math.min(length, Math.max(0, passed))
}

/**
 * Сколько минут окна дня осталось до его конца: основание реализма плана
 * (Р-35). Прошедший день — ноль, будущий — всё окно.
 */
export function windowLeft(date: DateStr, now: Date, window: { from: number; to: number } = DAY_WINDOW): number {
  return (window.to - window.from) * MINUTES_PER_HOUR - windowElapsed(date, now, window)
}

export type DaySummary = {
  /** Минуты по основной категории. Фоновая сюда не входит. */
  total: number
  /** Сколько блоков в сумме. */
  count: number
  byCategory: CategoryTotal[]
  /** Фоновая активность отдельно: покер под ютуб не удваивает час. */
  background: CategoryTotal[]
  /** Прошедшая часть окна дня, минут. */
  elapsed: number
  /** Прошедшая часть окна минус учтённое, не меньше нуля. */
  unaccounted: number
}

/** Итог дня — то, что видно сразу после записи. */
export function daySummary(
  blocks: readonly TimeBlock[],
  categories: readonly Category[],
  date: DateStr,
  now: Date,
): DaySummary {
  const day = blocksOn(blocks, date)
  const total = day.reduce((sum, block) => sum + block.minutes, 0)
  const elapsed = windowElapsed(date, now)
  return {
    total,
    count: day.length,
    byCategory: totals(day, categories, (block) => block.categoryId),
    background: totals(day, categories, (block) => block.bgCategoryId),
    elapsed,
    unaccounted: Math.max(0, elapsed - total),
  }
}
