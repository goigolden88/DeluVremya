import { formatMonth, type DateStr, type MonthStr } from '../../shared/core/dates.ts'
import { BarChart } from '../../shared/ui/BarChart.tsx'
import { dayLabel, dayTitle, formatMinutes } from './labels.ts'
import { monthDays } from './period.ts'
import { useBlocks } from './useBlocks.ts'
import { useSpecials } from './useSpecials.ts'

/** Деления оси — целыми часами. */
const HOUR = 60

/**
 * Месяц по дням (Р-92): столбец — учтено за день, тап — этот день в учёте.
 * Особые и будущие дни — без столбца, подпись серым (Р-91). Вид — как
 * у года (Р-57).
 *
 * Адрес дня даёт экран: модуль маршрутов не знает. Ошибку чтения называет
 * итог рядом — здесь её не повторить.
 */
export function MonthDays({
  month,
  today,
  dayHref,
}: {
  month: MonthStr
  today: DateStr
  dayHref: (day: DateStr) => string
}) {
  const time = useBlocks()
  const specials = useSpecials()
  if (time.status !== 'ready' || specials.status !== 'ready') return null

  const items = monthDays(time.blocks, month, today, specials.specials).map((day) => ({
    value: day.value,
    label: dayLabel(day.date),
    title: dayTitle(day),
    muted: day.muted,
    ...(day.future ? {} : { href: dayHref(day.date) }),
  }))

  return (
    <>
      <BarChart
        items={items}
        label={`Учтено по дням: ${formatMonth(month)}`}
        tickText={formatMinutes}
        peakText={formatMinutes}
        unit={HOUR}
      />
      <p className="muted">
        Столбец — учтено за день по основной категории; тап — этот день в учёте. Особые дни — без столбца.
      </p>
    </>
  )
}
