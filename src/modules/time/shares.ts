/**
 * Доли учтённого (Р-95): какая часть всего учтённого за период — у каждой
 * группы и категории.
 *
 * Целое — «учтено» итога периода: по основной категории, без фонового
 * (Р-43) и без особых дней (Р-91) — их уже нет в `PeriodSummary`. Доля
 * категории — тоже от целого, а не от своей группы.
 *
 * Чистые функции, без React и без базы (02-Архитектура, «Структура кода»).
 */

import type { Category } from '../../app/model.ts'
import { byGroup, hasGroups } from './groups.ts'
import type { PeriodSummary } from './period.ts'

/** Сколько процентов в целом. */
const WHOLE = 100

/** Меньше этого, но больше нуля — «<1 %»: ноль процентов у учтённого врал бы. */
export const SHARE_FLOOR = 1

export type Share = {
  /** Минуты по основной категории. */
  minutes: number
  /** Доля от всего учтённого, 0…1 — длина полосы. */
  part: number
  /** Подпись: «34 %», «<1 %». */
  text: string
}

export type CategoryShare = Share & {
  categoryId: string
  /** Удалённая — своим последним именем; неизвестная — null, подпись решает экран. */
  name: string | null
}

export type GroupShare = Share & {
  /** Ключ группы; null — «Без группы». */
  key: string | null
  /** Название группы; null — «Без группы». */
  name: string | null
  /** Её категории — доля каждой от всего учтённого. */
  categories: CategoryShare[]
}

export type Shares = {
  /** Целое — учтено за период. */
  total: number
  /** Группы (Р-81); групп нет — null, и строки — категории. */
  groups: GroupShare[] | null
  categories: CategoryShare[]
}

/** Доля в процентах: целыми; больше нуля, но меньше `SHARE_FLOOR` — «<1 %». */
export function shareText(minutes: number, total: number): string {
  const percent = total > 0 ? (minutes / total) * WHOLE : 0
  if (percent > 0 && percent < SHARE_FLOOR) return `<${SHARE_FLOOR} %`
  return `${Math.round(percent)} %`
}

function share(minutes: number, total: number): Share {
  return { minutes, part: total > 0 ? minutes / total : 0, text: shareText(minutes, total) }
}

/** По убыванию доли; равные — в прежнем порядке: сортировка устойчива. */
function byMinutes<T extends { minutes: number }>(list: T[]): T[] {
  return list.sort((a, b) => b.minutes - a.minutes)
}

/**
 * Доли периода. Строки без времени не входят; группа — сумма своих
 * категорий. Без времени за период — пусто.
 */
export function periodShares(summary: PeriodSummary, categories: readonly Category[]): Shares {
  const total = summary.total
  const rows = byMinutes(
    summary.byCategory
      .filter((row) => row.minutes > 0)
      .map((row) => ({ categoryId: row.categoryId, name: row.name, ...share(row.minutes, total) })),
  )
  if (!hasGroups(categories)) return { total, groups: null, categories: rows }

  const groups = byGroup(rows, categories, (row) => row.categoryId).map((group) => {
    const minutes = group.items.reduce((sum, row) => sum + row.minutes, 0)
    return { key: group.key, name: group.name, ...share(minutes, total), categories: group.items }
  })
  return { total, groups: byMinutes(groups), categories: rows }
}
