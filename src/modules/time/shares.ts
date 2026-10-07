/**
 * Доли учтённого (Р-95): какая часть всего учтённого за период — у каждой
 * группы и категории.
 *
 * Целое — «учтено» итога периода: по основной категории, без фонового
 * (Р-43) и без особых дней (Р-91) — их уже нет в `PeriodSummary`. Доля
 * категории — тоже от целого, а не от своей группы.
 *
 * Доли от всего (Р-98) — второй режим: целое — сутки прошедших дней, к
 * группам добавлены «Неучтено» и «Сон».
 *
 * Чистые функции, без React и без базы (02-Архитектура, «Структура кода»).
 */

import { inPeriod, periodDays, type DateStr, type Period } from '../../shared/core/dates.ts'
import type { Category, Sleep, SpecialDays, TimeBlock } from '../../app/model.ts'
import { MINUTES_PER_DAY } from './categories.ts'
import { windowLength } from './day.ts'
import { byGroup, hasGroups } from './groups.ts'
import { blocksIn, periodSummary, specialDaysIn, type PeriodSummary } from './period.ts'
import { dayWindow, markOn, routineOn } from './sleep.ts'

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

/** Доли категорий итога от целого `total`; группа — сумма своих категорий. */
function sharesOf(summary: PeriodSummary, categories: readonly Category[], total: number): Shares {
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

/**
 * Доли периода. Строки без времени не входят; группа — сумма своих
 * категорий. Без времени за период — пусто.
 */
export function periodShares(summary: PeriodSummary, categories: readonly Category[]): Shares {
  return sharesOf(summary, categories, summary.total)
}

// ─── Доли от всего (Р-98) ──────────────────────────────────────────────────

/**
 * Основание долей от всего: какие сутки в счёте и почему остальные — нет.
 * Всё — в днях периода.
 */
export type WholeBasis = {
  /** Суток в счёте. */
  days: number
  /** Из них окно — по отметке дня. */
  marked: number
  /** Из них окно — по распорядку. */
  routine: number
  /** Сегодня внутри периода: его сутки не кончились, в счёт не идёт. */
  today: boolean
  /** Прошедшие обычные дни раньше первого распорядка и без отметки. */
  beforeRoutine: number
  /** Прошедшие особые дни (Р-91) — не в счёте, как и в итоге периода. */
  special: number
}

export type WholeShares =
  /** Распорядка нет — сон неизвестен, режим не считается. */
  | { status: 'no-routine' }
  /** Ни одних суток в счёте: прошедших обычных дней нет или все раньше распорядка. */
  | { status: 'no-days'; basis: WholeBasis }
  | {
      status: 'ready'
      basis: WholeBasis
      /** Группы и категории — учтённое за сутки в счёте, доля от суток. */
      shares: Shares
      /** Окно дня минус учтённое в нём. */
      unaccounted: Share
      /** Сутки минус окно дня; учтённое сверх окна отнимается отсюда. */
      sleep: Share
    }

/** Есть ли распорядок: живая запись без `day`. Без него окно 8–24 по умолчанию — не сон человека. */
export function hasRoutine(records: readonly Sleep[]): boolean {
  return records.some((record) => !record.deleted && record.day === undefined)
}

/**
 * Доли от всего (Р-98): сутки прошедших дней периода — группы и категории,
 * «Неучтено» и «Сон», вместе 100 % (с округлением — 99 или 101).
 *
 * В счёте — прошедшие обычные дни, на которые есть отметка или действует
 * распорядок. Не в счёте: сегодня и будущие, особые (Р-91), дни раньше
 * первого распорядка без отметки. У блоков нет часов — только длины за день:
 * неучтено = больше(0, окно − учтено), сон = сутки − больше(окно, учтено).
 * Учтённое — за дни в счёте, по основной категории; фоновое не входит (Р-43).
 */
export function wholeShares(
  blocks: readonly TimeBlock[],
  categories: readonly Category[],
  records: readonly Sleep[],
  period: Period,
  today: DateStr,
  specials: readonly SpecialDays[] = [],
): WholeShares {
  if (!hasRoutine(records)) return { status: 'no-routine' }

  const special = specialDaysIn(specials, period)
  const past = periodDays(period).filter((day) => day < today)
  const ordinary = past.filter((day) => !special.has(day))
  const counted = new Set<DateStr>()
  let marked = 0
  for (const day of ordinary) {
    if (markOn(records, day)) marked += 1
    else if (!routineOn(records, day)) continue
    counted.add(day)
  }
  const basis: WholeBasis = {
    days: counted.size,
    marked,
    routine: counted.size - marked,
    today: inPeriod(today, period),
    beforeRoutine: ordinary.length - counted.size,
    special: past.length - ordinary.length,
  }
  if (counted.size === 0) return { status: 'no-days', basis }

  const own = blocksIn(blocks, period).filter((block) => counted.has(block.date))
  const accounted = new Map<DateStr, number>()
  for (const block of own) accounted.set(block.date, (accounted.get(block.date) ?? 0) + block.minutes)

  let unaccounted = 0
  let sleep = 0
  for (const day of counted) {
    const window = windowLength(dayWindow(records, day))
    const done = accounted.get(day) ?? 0
    unaccounted += Math.max(0, window - done)
    sleep += Math.max(0, MINUTES_PER_DAY - Math.max(window, done))
  }

  const total = counted.size * MINUTES_PER_DAY
  return {
    status: 'ready',
    basis,
    shares: sharesOf(periodSummary(own, categories, period, today), categories, total),
    unaccounted: share(unaccounted, total),
    sleep: share(sleep, total),
  }
}
