/**
 * Учёт времени в ленте и в выгрузке markdown (Р-58, Р-63).
 *
 * В ленте — строка на день, а не на блок: блоков около восьми в день, и
 * поблочно они утопили бы заметки. Блок живёт в своём дне — туда и ведёт
 * тап. Фоновое в сумму не входит, но ищется (Р-43).
 *
 * Чистые функции, без React и без базы.
 */

import { formatDate, inPeriod, isDateStr, monthPeriod, plural, type DateStr, type Period } from '../../core/dates.ts'
import { escapeMarkdown as md, feedHeading, type FeedItem } from '../../core/feed.ts'
import type { Category, TimeBlock } from '../../core/model.ts'
import { categoryName } from './day.ts'
import { formatMinutes, periodLine, summaryLine, UNKNOWN_CATEGORY } from './labels.ts'
import { periodSummary } from './period.ts'

/** Сколько категорий дня названо в строке ленты; остальные — числом. */
export const FEED_CATEGORIES = 3

type Sum = { id: string; name: string; minutes: number }

/** Живые блоки по дням. Кривая дата — своим днём, как лежит: блок не теряется. */
function byDay(blocks: readonly TimeBlock[]): Map<string, TimeBlock[]> {
  const days = new Map<string, TimeBlock[]>()
  for (const block of blocks) {
    if (block.deleted) continue
    const list = days.get(block.date)
    if (list) list.push(block)
    else days.set(block.date, [block])
  }
  return days
}

/** Имя категории блока. Удалённая — своим последним именем, неизвестная — «без категории». */
function nameOf(categories: readonly Category[], id: string): string {
  return categoryName(categories, id) ?? UNKNOWN_CATEGORY
}

/**
 * Минуты по категориям в порядке категорий; `pick` — основная или фоновая.
 * Неизвестные — в конце: NaN от двух бесконечностей ложен, и сравнение
 * уходит к имени.
 */
function sums(
  blocks: readonly TimeBlock[],
  categories: readonly Category[],
  pick: (block: TimeBlock) => string | undefined,
): Sum[] {
  const found = new Map<string, Sum>()
  for (const block of blocks) {
    const id = pick(block)
    if (!id) continue
    const sum = found.get(id) ?? { id, name: nameOf(categories, id), minutes: 0 }
    sum.minutes += block.minutes
    found.set(id, sum)
  }
  const order = (id: string) => categories.find((category) => category.id === id)?.order ?? Number.POSITIVE_INFINITY
  return [...found.values()].sort((a, b) => order(a.id) - order(b.id) || a.name.localeCompare(b.name, 'ru'))
}

function totalOf(blocks: readonly TimeBlock[]): number {
  return blocks.reduce((sum, block) => sum + block.minutes, 0)
}

function sumText(sum: Sum): string {
  return `${sum.name} ${formatMinutes(sum.minutes)}`
}

export function timeFeed(blocks: readonly TimeBlock[], categories: readonly Category[]): FeedItem[] {
  return [...byDay(blocks)].map(([date, list]): FeedItem => {
    const main = sums(list, categories, (block) => block.categoryId)
    const background = sums(list, categories, (block) => block.bgCategoryId)
    // Крупные — первыми; при равенстве сортировка устойчива и держит порядок категорий.
    const top = [...main].sort((a, b) => b.minutes - a.minutes).slice(0, FEED_CATEGORIES)
    const rest = main.length - top.length
    const detail = [
      ...top.map(sumText),
      ...(rest > 0 ? [`ещё ${rest} ${plural(rest, ['категория', 'категории', 'категорий'])}`] : []),
    ].join(' · ')
    // Все категории дня, фоновые и заметки блоков ищутся, но в строке их нет.
    const extra = [
      ...main.map((sum) => sum.name),
      ...(background.length > 0 ? ['фоном', ...background.map((sum) => sum.name)] : []),
      ...list.flatMap((block) => (block.note ? [block.note] : [])),
    ].join(' ')
    return {
      kind: 'time',
      id: `day:${date}`,
      date,
      title: summaryLine(totalOf(list), list.length),
      detail,
      extra,
      ...(isDateStr(date) ? { link: `/time?day=${date}` } : {}),
    }
  })
}

/**
 * Раздел выгрузки — дневником: месяц с итогом и основанием, под ним день
 * строкой — сумма, категории, фоновое отдельно; заметки блоков подпунктами.
 * Месяцы от старых к новым; блоки с кривой датой — в конце (Р-63).
 * Заголовок раздела ставит реестр.
 */
export function timeMarkdown(
  blocks: readonly TimeBlock[],
  categories: readonly Category[],
  today: DateStr,
  /** За период — по дню блока; кривая дата в период не попадает (Р-79). */
  period: Period | null = null,
): string {
  const days = byDay(
    period === null ? blocks : blocks.filter((block) => isDateStr(block.date) && inPeriod(block.date, period)),
  )
  if (days.size === 0) return 'Записей нет.'

  const dated = [...days.keys()].filter(isDateStr).sort()
  const crooked = [...days.keys()].filter((date) => !isDateStr(date)).sort()

  const lines: string[] = []
  let month: string | null = null
  for (const date of dated) {
    const current = date.slice(0, 7)
    if (current !== month) {
      if (month !== null) lines.push('')
      month = current
      const summary = periodSummary(blocks, categories, monthPeriod(current), today)
      lines.push(`### ${feedHeading(current)}`, '', periodLine(summary), '')
    }
    lines.push(...dayLines(formatDate(date).slice(0, 5), days.get(date) ?? [], categories))
  }

  if (crooked.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push('### Дата не разобрана', '')
    for (const date of crooked) lines.push(...dayLines(`«${md(date)}»`, days.get(date) ?? [], categories))
  }

  return lines.join('\n').trimEnd()
}

function dayLines(day: string, list: readonly TimeBlock[], categories: readonly Category[]): string[] {
  const escaped = (sum: Sum) => `${md(sum.name)} ${formatMinutes(sum.minutes)}`
  const main = sums(list, categories, (block) => block.categoryId).map(escaped)
  const background = sums(list, categories, (block) => block.bgCategoryId).map(escaped)
  const head =
    `- ${day} — ${formatMinutes(totalOf(list))}: ${main.join(', ')}` +
    (background.length > 0 ? `; фоном ${background.join(', ')}` : '')
  const notes = [...list]
    .sort((a, b) => a.id.localeCompare(b.id))
    .flatMap((block) =>
      block.note
        ? [`  - ${md(nameOf(categories, block.categoryId))} ${formatMinutes(block.minutes)}: ${md(block.note)}`]
        : [],
    )
  return [head, ...notes]
}
