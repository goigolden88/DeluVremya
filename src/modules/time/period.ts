/**
 * Итоги учёта за промежуток дней и нормы недели.
 *
 * Промежуток, а не неделя: обзор недели считает на нём сейчас, месяц и год —
 * потом (Р-52). Фоновая активность в сумму не входит и идёт у категории
 * отдельной строкой (Р-43) — так же, как в итоге дня.
 *
 * Чистые функции, без React и без базы (02-Архитектура, «Структура кода»).
 */

import {
  addDays,
  inPeriod,
  isDateStr,
  monthPeriod,
  monthsOf,
  periodDays,
  toDateStr,
  weekPeriod,
  weeksEndingIn,
  yearPeriod,
  type DateStr,
  type MonthStr,
  type Period,
} from '../../shared/core/dates.ts'
import type { Category, TimeBlock } from '../../app/model.ts'
import { activeCategories, MINUTES_PER_DAY, type CategoryKind } from './categories.ts'

// ─── Итог промежутка ───────────────────────────────────────────────────────

/** Живые блоки промежутка. */
export function blocksIn(blocks: readonly TimeBlock[], period: Period): TimeBlock[] {
  return blocks.filter((block) => !block.deleted && inPeriod(block.date, period))
}

export type PeriodCategory = {
  categoryId: string
  /** Удалённая — своим последним именем; неизвестная — null, подпись решает экран. */
  name: string | null
  kind: CategoryKind | null
  /** Минуты, где категория основная. */
  minutes: number
  /** Сколько блоков в сумме — её основание. */
  count: number
  /** В скольких днях у неё есть блок: «раз» нормы — день, а не блок (Р-45). */
  days: number
  /** Минуты фоном — в сумму не входят (Р-43). */
  background: number
}

export type KindTotal = { kind: CategoryKind | null; minutes: number }

export type PeriodSummary = {
  /** Учтено — по основной категории, без фоновой. */
  total: number
  /** Сколько блоков. */
  count: number
  /** В скольких днях учтено хоть что-то. */
  days: number
  /** Сколько дней промежутка уже наступило — основание «в 5 днях из 7». */
  elapsedDays: number
  byCategory: PeriodCategory[]
  /** По признаку категории — только для обзора, дневной экран им не красится (Р-05). */
  byKind: KindTotal[]
}

const KIND_ORDER: readonly CategoryKind[] = ['useful', 'neutral', 'idle']

/**
 * Порядок строк итога — порядок категорий, неизвестные в конце: NaN от двух
 * бесконечностей ложен, и сравнение уходит к имени.
 */
function categoryOrder(categories: readonly Category[]) {
  const known = new Map(categories.map((category) => [category.id, category]))
  const order = (id: string) => known.get(id)?.order ?? Number.POSITIVE_INFINITY
  return (a: { categoryId: string; name: string | null }, b: { categoryId: string; name: string | null }) =>
    order(a.categoryId) - order(b.categoryId) || (a.name ?? '').localeCompare(b.name ?? '', 'ru')
}

export function periodSummary(
  blocks: readonly TimeBlock[],
  categories: readonly Category[],
  period: Period,
  today: DateStr,
): PeriodSummary {
  const known = new Map(categories.map((category) => [category.id, category]))
  const rows = new Map<string, PeriodCategory & { dates: Set<string> }>()
  const row = (id: string) => {
    let entry = rows.get(id)
    if (!entry) {
      const category = known.get(id)
      entry = {
        categoryId: id,
        name: category?.name ?? null,
        kind: category?.kind ?? null,
        minutes: 0,
        count: 0,
        days: 0,
        background: 0,
        dates: new Set(),
      }
      rows.set(id, entry)
    }
    return entry
  }

  const list = blocksIn(blocks, period)
  const dates = new Set<string>()
  for (const block of list) {
    const main = row(block.categoryId)
    main.minutes += block.minutes
    main.count += 1
    main.dates.add(block.date)
    dates.add(block.date)
    if (block.bgCategoryId) row(block.bgCategoryId).background += block.minutes
  }

  const byCategory = [...rows.values()]
    .map(({ dates: own, ...rest }) => ({ ...rest, days: own.size }))
    .sort(categoryOrder(categories))

  const kinds = new Map<CategoryKind | null, number>()
  for (const each of byCategory) kinds.set(each.kind, (kinds.get(each.kind) ?? 0) + each.minutes)
  const byKind = [...KIND_ORDER, null].flatMap((kind) => {
    const minutes = kinds.get(kind) ?? 0
    return minutes > 0 ? [{ kind, minutes }] : []
  })

  return {
    total: list.reduce((sum, block) => sum + block.minutes, 0),
    count: list.length,
    days: dates.size,
    elapsedDays: periodDays(period).filter((day) => day <= today).length,
    byCategory,
    byKind,
  }
}

/** Строка сравнения: категория этого промежутка и её минуты в прежнем. */
export type CompareRow = PeriodCategory & { before: number }

/**
 * Категории двух промежутков рядом (Р-55): у каждой — минуты в обоих, порядок
 * категорий. Категория, учтённая только в прежнем, стоит с нулём в этом —
 * иначе пропала бы молча; только фоном в прежнем — не стоит: сравнивать нечего.
 */
export function compareRows(
  current: PeriodSummary,
  before: PeriodSummary,
  categories: readonly Category[],
): CompareRow[] {
  const earlier = new Map(before.byCategory.map((row) => [row.categoryId, row.minutes]))
  const rows: CompareRow[] = current.byCategory.map((row) => ({ ...row, before: earlier.get(row.categoryId) ?? 0 }))
  const present = new Set(rows.map((row) => row.categoryId))
  for (const row of before.byCategory) {
    if (present.has(row.categoryId) || row.minutes === 0) continue
    rows.push({ ...row, minutes: 0, count: 0, days: 0, background: 0, before: row.minutes })
  }
  return rows.sort(categoryOrder(categories))
}

// ─── Год по месяцам (Р-57) ─────────────────────────────────────────────────

export type MonthTime = { month: MonthStr; summary: PeriodSummary }

/** Категория за год: итог и минуты по каждому месяцу, по основной (Р-43). */
export type YearCategory = PeriodCategory & { byMonth: number[] }

export type YearTime = {
  months: MonthTime[]
  /** Год целиком — сумма и основание. */
  total: PeriodSummary
  categories: YearCategory[]
}

/** Год по месяцам: итог каждого месяца и строки категорий с их месяцами. */
export function yearTime(
  blocks: readonly TimeBlock[],
  categories: readonly Category[],
  year: number,
  today: DateStr,
): YearTime {
  const months = monthsOf(year).map((month) => ({
    month,
    summary: periodSummary(blocks, categories, monthPeriod(month), today),
  }))
  const total = periodSummary(blocks, categories, yearPeriod(year), today)
  return {
    months,
    total,
    categories: total.byCategory.map((row) => ({
      ...row,
      byMonth: months.map(
        ({ summary }) => summary.byCategory.find((each) => each.categoryId === row.categoryId)?.minutes ?? 0,
      ),
    })),
  }
}

// ─── Нормы недели (Р-45) ───────────────────────────────────────────────────

export type Norm = NonNullable<Category['norm']>
/** Правило нормы. `since` — не правило, а день начала истории (Р-56). */
export type NormRule = Exclude<keyof Norm, 'since'>

/** Порядок правил на экране. */
export const NORM_RULES: readonly NormRule[] = ['minDays', 'minMinutes', 'maxMinutes']

/**
 * Правила, которые видны на экране учёта в течение недели. Пределы — только
 * в обзоре: «8 ч из 10» каждый день — тот же ежедневный красный, от которого
 * уводит Р-05, только словами.
 */
export const PROGRESS_RULES: readonly NormRule[] = ['minDays', 'minMinutes']

/** Сколько недель смотреть назад вместо серии: пропуск ничего не обнуляет. */
export const NORM_HISTORY_WEEKS = 4

export type NormCheck = { rule: NormRule; target: number; actual: number; met: boolean }

/** Как выполнены правила нормы. «Не меньше» — от порога, «не больше» — до порога включительно. */
export function checkNorm(
  norm: Norm,
  stat: { days: number; minutes: number },
  rules: readonly NormRule[] = NORM_RULES,
): NormCheck[] {
  return rules.flatMap((rule) => {
    const target = norm[rule]
    if (target === undefined) return []
    const actual = rule === 'minDays' ? stat.days : stat.minutes
    return [{ rule, target, actual, met: rule === 'maxMinutes' ? actual <= target : actual >= target }]
  })
}

function hasRules(norm: Norm | undefined, rules: readonly NormRule[] = NORM_RULES): norm is Norm {
  return norm !== undefined && rules.some((rule) => norm[rule] !== undefined)
}

/** Категории с нормой: рабочие, по порядку. Архивной не размечают, и норма её молчит. */
function normed(categories: readonly Category[], rules: readonly NormRule[]): (Category & { norm: Norm })[] {
  return activeCategories(categories).filter((category): category is Category & { norm: Norm } =>
    hasRules(category.norm, rules),
  )
}

function statOf(summary: PeriodSummary, id: string): { days: number; minutes: number } {
  const row = summary.byCategory.find((each) => each.categoryId === id)
  return { days: row?.days ?? 0, minutes: row?.minutes ?? 0 }
}

// ─── История нормы (Р-53, Р-56) ────────────────────────────────────────────

/** Сколько недель в счёт нужно, чтобы показать историю нормы (Р-53). */
export const NORM_MIN_WEEKS = 3

/**
 * С какого дня считается история нормы: `since`; нет его — день последней
 * правки категории (Р-53): не точнее, но не раньше. Не разобрать и его —
 * null, без предела.
 */
export function normSince(category: Category): DateStr | null {
  const since = category.norm?.since
  if (since !== undefined && isDateStr(since)) return since
  const at = new Date(category.updatedAt)
  return Number.isNaN(at.getTime()) ? null : toDateStr(at)
}

export type WeekMark = {
  week: Period
  /** В счёт: закончилась, полная с `since` (Р-56), не раньше первого блока. */
  counted: boolean
  /** Выполнены все правила. У недели не в счёт не значит ничего. */
  met: boolean
}

export type NormHistory = {
  since: DateStr | null
  /** Все недели, какие спрошены, по порядку. */
  marks: WeekMark[]
  /** В скольких неделях в счёт норма выполнена. */
  kept: number
  /** Сколько недель в счёт. */
  weeks: number
  /** Недель в счёт хватает, чтобы показать историю (Р-53). */
  enough: boolean
}

/** Первый живой блок вообще: неделя до начала учёта — не пропуск. */
function firstBlock(blocks: readonly TimeBlock[]): DateStr | null {
  return blocks.reduce<DateStr | null>(
    (min, block) => (block.deleted || (min !== null && block.date >= min) ? min : block.date),
    null,
  )
}

type WeekStat = { week: Period; summary: PeriodSummary }

function weekStats(
  blocks: readonly TimeBlock[],
  categories: readonly Category[],
  weeks: readonly Period[],
  today: DateStr,
): WeekStat[] {
  return weeks.map((week) => ({ week, summary: periodSummary(blocks, categories, week, today) }))
}

/**
 * История нормы по неделям. В счёт — закончившиеся недели, не раньше первого
 * блока и только полные с `since`: с понедельника не раньше него. Норма,
 * заведённая в среду, в эту неделю не судится (Р-56).
 */
function historyOf(
  category: Category & { norm: Norm },
  stats: readonly WeekStat[],
  first: DateStr | null,
  today: DateStr,
): NormHistory {
  const since = normSince(category)
  const marks = stats.map(({ week, summary }) => ({
    week,
    counted: week.to <= today && first !== null && week.to >= first && (since === null || week.from >= since),
    met: checkNorm(category.norm, statOf(summary, category.id)).every((check) => check.met),
  }))
  const counted = marks.filter((mark) => mark.counted)
  return {
    since,
    marks,
    kept: counted.filter((mark) => mark.met).length,
    weeks: counted.length,
    enough: counted.length >= NORM_MIN_WEEKS,
  }
}

export type WeekNorm = {
  category: Category
  /** Правила показанной недели — факт недели, а не история: считаются всегда. */
  checks: NormCheck[]
  /** Минуты фоном за неделю — названы, но в норму не входят (Р-43). */
  background: number
  /** Вместо серии — последние недели до показанной включительно. */
  history: NormHistory
}

/**
 * Нормы недели `week` (любой её день) и вместо серии — история за последние
 * недели по правилу `historyOf`.
 */
export function weekNorms(
  blocks: readonly TimeBlock[],
  categories: readonly Category[],
  week: DateStr,
  today: DateStr,
): WeekNorm[] {
  const list = normed(categories, NORM_RULES)
  if (list.length === 0) return []

  const period = weekPeriod(week)
  const summary = periodSummary(blocks, categories, period, today)
  // Старые первыми; последняя — сама показанная неделя.
  const weeks = Array.from({ length: NORM_HISTORY_WEEKS }, (_, index) =>
    weekPeriod(addDays(period.from, -7 * (NORM_HISTORY_WEEKS - 1 - index))),
  )
  const stats = weekStats(blocks, categories, weeks, today)
  const first = firstBlock(blocks)

  return list.map((category) => ({
    category,
    checks: checkNorm(category.norm, statOf(summary, category.id)),
    background: summary.byCategory.find((each) => each.categoryId === category.id)?.background ?? 0,
    history: historyOf(category, stats, first, today),
  }))
}

export type PeriodNorm = { category: Category; history: NormHistory }

/**
 * Нормы по неделям промежутка — месяца или года: недели, чьё воскресенье
 * в нём (Р-55). То же правило истории, что у обзора недели.
 */
export function periodNorms(
  blocks: readonly TimeBlock[],
  categories: readonly Category[],
  period: Period,
  today: DateStr,
): PeriodNorm[] {
  const list = normed(categories, NORM_RULES)
  if (list.length === 0) return []
  const stats = weekStats(blocks, categories, weeksEndingIn(period), today)
  const first = firstBlock(blocks)
  return list.map((category) => ({ category, history: historyOf(category, stats, first, today) }))
}

export type NormProgress = { category: Category; checks: NormCheck[] }

/** Как идут нормы «не меньше» с понедельника — для экрана учёта. */
export function weekProgress(
  blocks: readonly TimeBlock[],
  categories: readonly Category[],
  today: DateStr,
): NormProgress[] {
  const list = normed(categories, PROGRESS_RULES)
  if (list.length === 0) return []
  const summary = periodSummary(blocks, categories, weekPeriod(today), today)
  return list.map((category) => ({
    category,
    checks: checkNorm(category.norm, statOf(summary, category.id), PROGRESS_RULES),
  }))
}

// ─── Норма из полей ────────────────────────────────────────────────────────

/** Дней в неделе. */
export const MAX_NORM_DAYS = 7
/** Минут в неделе: ни норма, ни предел больше не бывают. */
export const MAX_NORM_MINUTES = 7 * MINUTES_PER_DAY

const MINUTES_PER_HOUR = 60

export type NormProblem = 'days' | 'hours' | 'order'

/** Поля формы: дни — целым, часы — числом, дробь через запятую или точку. */
export type NormInput = { minDays: string; minHours: string; maxHours: string }

/** Часы из поля в минуты. Пусто — правила нет; кривое — `false`. */
function readHours(input: string): number | null | false {
  const text = input.trim().replace(',', '.')
  if (!text) return null
  if (!/^\d+(\.\d+)?$/.test(text)) return false
  const minutes = Math.round(Number(text) * MINUTES_PER_HOUR)
  return minutes >= 1 && minutes <= MAX_NORM_MINUTES ? minutes : false
}

/**
 * Норма из полей. Все пустые — нормы нет, это не ошибка. Кривое поле —
 * причина с пределами, а не молчание.
 */
export function readNorm(input: NormInput): { norm: Norm | null } | { problem: NormProblem } {
  const norm: Norm = {}

  const days = input.minDays.trim()
  if (days) {
    const value = Number(days)
    if (!/^\d+$/.test(days) || value < 1 || value > MAX_NORM_DAYS) return { problem: 'days' }
    norm.minDays = value
  }

  const min = readHours(input.minHours)
  const max = readHours(input.maxHours)
  if (min === false || max === false) return { problem: 'hours' }
  if (min !== null) norm.minMinutes = min
  if (max !== null) norm.maxMinutes = max
  if (min !== null && max !== null && max < min) return { problem: 'order' }

  return { norm: hasRules(norm) ? norm : null }
}

/** `90` → `1,5`: часы в поле — как их пишут по-русски. */
function hoursText(minutes: number): string {
  return String(Math.round((minutes / MINUTES_PER_HOUR) * 100) / 100).replace('.', ',')
}

/** Поля формы из нормы. Нет нормы — пусто. */
export function normInput(norm: Norm | undefined): NormInput {
  return {
    minDays: norm?.minDays === undefined ? '' : String(norm.minDays),
    minHours: norm?.minMinutes === undefined ? '' : hoursText(norm.minMinutes),
    maxHours: norm?.maxMinutes === undefined ? '' : hoursText(norm.maxMinutes),
  }
}

/**
 * Новая норма; `null` — убрать, ключом из записи. День начала истории (Р-56):
 * у новой нормы — сегодня; у правки — прежний, правка правил его не сдвигает.
 * У нормы без него — день последней правки категории, он и записывается.
 */
export function withNorm(category: Category, norm: Norm | null, today: DateStr): Category {
  if (norm !== null) {
    const since = (category.norm ? normSince(category) : null) ?? today
    return { ...category, norm: { ...norm, since } }
  }
  if (!('norm' in category)) return category
  const { norm: _norm, ...rest } = category
  return rest
}
