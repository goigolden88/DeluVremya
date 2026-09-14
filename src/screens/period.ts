/**
 * Итоги месяца и года: какой месяц и год показать, какой месяц закрыла
 * неделя обзора (Р-54, Р-57).
 *
 * Чистые функции: знают только даты. Расчёты — в модулях, каждый своё;
 * блоки сводят `Month.tsx` и `Year.tsx`.
 */

import {
  addMonths,
  days,
  formatMonth,
  isMonthStr,
  monthEndIn,
  monthName,
  monthOf,
  monthPeriod,
  periodDays,
  plural,
  weekPeriod,
  type DateStr,
  type MonthStr,
  type Period,
} from '../core/dates.ts'

/** Первые столько дней месяца по умолчанию показывается прошлый (Р-54). */
export const MONTH_LOOKBACK_DAYS = 7

/** Месяц по умолчанию: в первые дни месяца — прошлый, дальше — текущий. */
export function defaultMonth(today: DateStr): MonthStr {
  const month = monthOf(today)
  return Number(today.slice(8)) <= MONTH_LOOKBACK_DAYS ? addMonths(month, -1) : month
}

/** Показанный месяц: из адреса — не позже текущего; иначе — по умолчанию. */
export function viewedMonth(param: string | null, today: DateStr): MonthStr {
  if (param !== null && isMonthStr(param) && param <= monthOf(today)) return param
  return defaultMonth(today)
}

/** Показанный год: из адреса — не позже текущего; иначе — год месяца по умолчанию (Р-57). */
export function viewedYear(param: string | null, today: DateStr): number {
  if (param !== null && /^\d{4}$/.test(param) && Number(param) <= Number(today.slice(0, 4))) return Number(param)
  return Number(defaultMonth(today).slice(0, 4))
}

/**
 * Месяц, который закрыла неделя обзора (Р-54): его последний день лежит
 * в неделе и уже наступил. Null — неделя месяц не закрывает.
 */
export function closedMonth(week: DateStr, today: DateStr): MonthStr | null {
  const month = monthEndIn(weekPeriod(week))
  return month !== null && monthPeriod(month).to <= today ? month : null
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** «Сентябрь 2026» — заголовком. */
export function monthTitle(month: MonthStr): string {
  return capitalized(formatMonth(month))
}

/** «Сентябрь» — подпись столбца и карточки. */
export function monthLabel(month: MonthStr): string {
  return capitalized(monthName(Number(month.slice(5, 7))))
}

/**
 * Промежуток ещё идёт — с основанием: «Месяц ещё идёт: прошло 14 дней из 30».
 * Закончился или не начался — null.
 */
export function runningText(period: Period, today: DateStr, what: string): string | null {
  if (today < period.from || today > period.to) return null
  const all = periodDays(period)
  const passed = all.filter((day) => day <= today).length
  return `${what} ещё идёт: ${plural(passed, ['прошёл', 'прошло', 'прошло'])} ${days(passed)} из ${all.length}`
}
