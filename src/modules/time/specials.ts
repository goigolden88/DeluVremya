/**
 * Особые дни — поездка, поход: период вне обычного учёта (Р-91).
 *
 * Правила периода — `to` не раньше `from`, периоды не пересекаются, какой
 * период задевает день или промежуток, — и его строки в ленте и выгрузке
 * markdown. Отметку на «Учёте» и плашку на «Сегодня» строят на этих правилах
 * экраны; нормы и итоги — свои расчёты.
 *
 * Чистые функции, без React и без базы.
 */

import { formatPeriod, isDateStr, periodDays, plural, type DateStr, type Period } from '../../shared/core/dates.ts'
import { escapeMarkdown as md, type FeedItem } from '../../shared/core/feed.ts'
import type { SpecialDays } from '../../app/model.ts'

/** Подпись вида и периода без названия. */
export const SPECIAL_LABEL = 'Особые дни'

/** Живые периоды по порядку дней. */
export function liveSpecials(specials: readonly SpecialDays[]): SpecialDays[] {
  return specials
    .filter((special) => !special.deleted)
    .sort((a, b) => a.from.localeCompare(b.from) || a.id.localeCompare(b.id))
}

/** Название периода; пустое и из одних пробелов — «Особые дни». */
export function specialTitle(special: Pick<SpecialDays, 'title'>): string {
  return special.title?.trim() || SPECIAL_LABEL
}

/** Читаются ли даты периода: обе — дни, `to` не раньше `from`. */
function readable(special: Pick<SpecialDays, 'from' | 'to'>): boolean {
  return isDateStr(special.from) && isDateStr(special.to) && special.from <= special.to
}

/**
 * Период как промежуток дней. Null — даты кривые: такой период ничего
 * не задевает, но в ленте и выгрузке остаётся — как лежит.
 */
export function specialPeriod(special: Pick<SpecialDays, 'from' | 'to'>): Period | null {
  return readable(special) ? { from: special.from, to: special.to } : null
}

/** Задевает ли период промежуток хоть одним днём. */
export function touches(special: Pick<SpecialDays, 'from' | 'to'>, period: Period): boolean {
  const own = specialPeriod(special)
  return own !== null && own.from <= period.to && period.from <= own.to
}

/** Особый ли день — какой живой период его задевает. Нет — null. */
export function specialOn(specials: readonly SpecialDays[], day: DateStr): SpecialDays | null {
  return liveSpecials(specials).find((special) => touches(special, { from: day, to: day })) ?? null
}

/** Живые периоды, задевшие промежуток, по порядку дней. */
export function specialsIn(specials: readonly SpecialDays[], period: Period): SpecialDays[] {
  return liveSpecials(specials).filter((special) => touches(special, period))
}

/** Почему период не сохраняется. */
export type SpecialProblem =
  | { reason: 'date' }
  | { reason: 'order' }
  | { reason: 'overlap'; other: SpecialDays }

/**
 * Можно ли сохранить период: даты — дни, `to` не раньше `from`, другой живой
 * период не задет. Свой `id` не в счёт — правка не спорит сама с собой.
 * Null — можно.
 */
export function checkSpecial(
  draft: Pick<SpecialDays, 'from' | 'to'> & { id?: string },
  specials: readonly SpecialDays[],
): SpecialProblem | null {
  if (!isDateStr(draft.from) || !isDateStr(draft.to)) return { reason: 'date' }
  if (draft.to < draft.from) return { reason: 'order' }
  const span = { from: draft.from, to: draft.to }
  const other = liveSpecials(specials).find((special) => special.id !== draft.id && touches(special, span))
  return other ? { reason: 'overlap', other } : null
}

/** Причина словами — для формы: другой период назван. */
export function specialProblemText(problem: SpecialProblem): string {
  switch (problem.reason) {
    case 'date':
      return 'Нужны обе даты: «с» и «по».'
    case 'order':
      return '«По» раньше, чем «с».'
    case 'overlap':
      return `Задевает другой период: «${specialTitle(problem.other)}», ${datesText(problem.other)}.`
  }
}

/** «7–13 сентября 2026, 7 дней»; один день — без числа дней. Кривые даты — как лежат. */
export function datesText(special: Pick<SpecialDays, 'from' | 'to'>): string {
  const period = specialPeriod(special)
  if (period === null) return special.from === special.to ? special.from : `${special.from} – ${special.to}`
  const count = periodDays(period).length
  return count === 1 ? formatPeriod(period) : `${formatPeriod(period)}, ${count} ${plural(count, ['день', 'дня', 'дней'])}`
}

/**
 * Строка ленты — в первый день периода: название и даты. Тап — этот день
 * на «Учёте», где у периода плашка.
 */
export function specialFeed(specials: readonly SpecialDays[]): FeedItem[] {
  return liveSpecials(specials).map(
    (special): FeedItem => ({
      kind: 'special',
      id: special.id,
      date: special.from,
      title: specialTitle(special),
      detail: datesText(special),
      ...(isDateStr(special.from) ? { link: `/time?day=${special.from}` } : {}),
    }),
  )
}

/**
 * Раздел выгрузки: период строкой — даты и название, от старых к новым.
 * Заголовок раздела ставит реестр; периоды без названия — одними датами.
 */
export function specialMarkdown(
  specials: readonly SpecialDays[],
  /** За период — каждый, задевший его хоть одним днём; кривые даты не попадают (Р-79). */
  period: Period | null = null,
): string {
  const shown = liveSpecials(specials).filter((special) => period === null || touches(special, period))
  if (shown.length === 0) return 'Записей нет.'
  return shown
    .map((special) => {
      const title = special.title?.trim()
      return `- ${md(datesText(special))}${title ? ` — ${md(title)}` : ''}`
    })
    .join('\n')
}
