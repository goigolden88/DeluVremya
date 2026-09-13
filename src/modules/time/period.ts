/**
 * Итоги учёта за промежуток дней и нормы недели.
 *
 * Промежуток, а не неделя: обзор недели считает на нём сейчас, месяц и год —
 * потом (Р-52). Фоновая активность в сумму не входит и идёт у категории
 * отдельной строкой (Р-43) — так же, как в итоге дня.
 *
 * Чистые функции, без React и без базы (02-Архитектура, «Структура кода»).
 */

import { addDays, inPeriod, periodDays, weekPeriod, type DateStr, type Period } from '../../core/dates.ts'
import type { Category, TimeBlock } from '../../core/model.ts'
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

  // Порядок категорий, неизвестные — в конце: NaN от двух бесконечностей
  // ложен, и сравнение уходит к имени.
  const order = (id: string) => known.get(id)?.order ?? Number.POSITIVE_INFINITY
  const byCategory = [...rows.values()]
    .map(({ dates: own, ...rest }) => ({ ...rest, days: own.size }))
    .sort((a, b) => order(a.categoryId) - order(b.categoryId) || (a.name ?? '').localeCompare(b.name ?? '', 'ru'))

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

// ─── Нормы недели (Р-45) ───────────────────────────────────────────────────

export type Norm = NonNullable<Category['norm']>
export type NormRule = keyof Norm

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

export type WeekNorm = {
  category: Category
  checks: NormCheck[]
  /** Минуты фоном за неделю — названы, но в норму не входят (Р-43). */
  background: number
  /** В скольких из `weeks` последних недель выполнены все правила. */
  kept: number
  /** Сколько недель в счёт: закончившиеся и не раньше первого блока. */
  weeks: number
}

/**
 * Нормы недели `week` (любой её день) и вместо серии — сколько из последних
 * недель норма выполнена. В счёт идут только закончившиеся недели и не
 * раньше первого блока вообще: неделя до начала учёта — не пропуск.
 */
export function weekNorms(
  blocks: readonly TimeBlock[],
  categories: readonly Category[],
  week: DateStr,
  today: DateStr,
): WeekNorm[] {
  const list = normed(categories, NORM_RULES)
  if (list.length === 0) return []

  const first = blocks.reduce<string | null>(
    (min, block) => (block.deleted || (min !== null && block.date >= min) ? min : block.date),
    null,
  )
  const period = weekPeriod(week)
  const summary = periodSummary(blocks, categories, period, today)
  const history = Array.from({ length: NORM_HISTORY_WEEKS }, (_, back) => weekPeriod(addDays(period.from, -7 * back)))
    .filter((each) => each.to <= today && first !== null && each.to >= first)
    .map((each) => periodSummary(blocks, categories, each, today))

  return list.map((category) => ({
    category,
    checks: checkNorm(category.norm, statOf(summary, category.id)),
    background: summary.byCategory.find((each) => each.categoryId === category.id)?.background ?? 0,
    kept: history.filter((each) => checkNorm(category.norm, statOf(each, category.id)).every((check) => check.met))
      .length,
    weeks: history.length,
  }))
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

/** Новая норма; `null` — убрать, ключом из записи. */
export function withNorm(category: Category, norm: Norm | null): Category {
  if (norm !== null) return { ...category, norm }
  if (!('norm' in category)) return category
  const { norm: _norm, ...rest } = category
  return rest
}
