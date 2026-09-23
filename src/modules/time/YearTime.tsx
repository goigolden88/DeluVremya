import { Fragment } from 'react'
import { formatMonth, monthName, monthPeriod, MONTHS_SHORT, type DateStr, type MonthStr } from '../../shared/core/dates.ts'
import { BarChart, MiniBars } from '../../shared/ui/BarChart.tsx'
import { Fold } from '../../shared/ui/Fold.tsx'
import { byGroup, hasGroups } from './groups.ts'
import { backgroundText, formatMinutes, kindLine, lowerFirst, NO_GROUP, periodLine, UNKNOWN_CATEGORY } from './labels.ts'
import { yearTime } from './period.ts'
import { Unready } from './Period.tsx'
import { useBlocks } from './useBlocks.ts'
import { useCatalog } from './useCatalog.ts'

/** Деления оси — целыми часами. */
const HOUR = 60

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Время года (Р-57): итог с основанием, столбцы месяцев — тап открывает
 * месяц, — те же числа таблицей в свёрнутом блоке, категории строками
 * с малыми столбиками по месяцам. Признак не красит (Р-05); фоновое —
 * отдельно и в сумму не входит (Р-43).
 *
 * Адрес месяца даёт экран: модуль маршрутов не знает.
 */
export function YearTime({
  year,
  today,
  monthHref,
}: {
  year: number
  today: DateStr
  monthHref: (month: MonthStr) => string
}) {
  const catalog = useCatalog()
  const time = useBlocks()
  if (catalog.status !== 'ready' || time.status !== 'ready') return <Unready catalog={catalog} time={time} />

  const data = yearTime(time.blocks, catalog.categories, year, today)
  const past = data.months.filter(({ month }) => monthPeriod(month).from <= today)
  const items = data.months.map(({ month, summary }, index) => {
    const future = monthPeriod(month).from > today
    return {
      value: future ? null : summary.total,
      label: MONTHS_SHORT[index] ?? month,
      title: `${capitalized(formatMonth(month))}: ${future ? 'ещё не наступил' : lowerFirst(periodLine(summary))}`,
      muted: future || summary.count === 0,
      ...(future ? {} : { href: monthHref(month) }),
    }
  })

  // По группам (Р-81): у группы — сумма за год и столбики сложенных месяцев.
  const groups = hasGroups(catalog.categories)
    ? byGroup(data.categories, catalog.categories, (row) => row.categoryId)
    : null
  const bars = (values: number[]) => (
    <td className="minibars-cell">
      <MiniBars
        values={values}
        titles={values.map((minutes, index) => `${MONTHS_SHORT[index] ?? ''}: ${formatMinutes(minutes)}`)}
      />
    </td>
  )
  const line = (row: (typeof data.categories)[number], sub: boolean) => (
    <tr key={row.categoryId}>
      <td className={sub ? 'stats__sub' : undefined}>
        {row.name ?? UNKNOWN_CATEGORY}
        {row.background > 0 && <span className="muted"> · {backgroundText(row.background)}</span>}
      </td>
      {bars(row.byMonth)}
      <td className="num">{row.minutes > 0 ? formatMinutes(row.minutes) : '—'}</td>
    </tr>
  )

  return (
    <div className="day-sum">
      <p className="lead">{periodLine(data.total)}</p>
      <BarChart
        items={items}
        label={`Учтено по месяцам ${year} года`}
        tickText={formatMinutes}
        peakText={formatMinutes}
        unit={HOUR}
      />
      <p className="muted">Столбец — учтено за месяц по основной категории; тап — итоги месяца.</p>

      {past.length > 0 && (
        <Fold id="year:months" title="Месяцы таблицей" folded sub>
          <table className="stats">
            <thead>
              <tr>
                <th />
                <th className="num">Учтено</th>
                <th className="num">Дней с учётом</th>
              </tr>
            </thead>
            <tbody>
              {past.map(({ month, summary }) => (
                <tr key={month}>
                  <td>{capitalized(monthName(Number(month.slice(5, 7))))}</td>
                  <td className="num">{summary.count > 0 ? formatMinutes(summary.total) : '—'}</td>
                  <td className="num muted">
                    {summary.days} из {summary.elapsedDays}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Fold>
      )}

      {data.categories.length > 0 && (
        <>
          <h3 className="unit__name">По категориям</h3>
          <table className="stats">
            <tbody>
              {groups
                ? groups.map((group) => {
                    const total = group.items.reduce((sum, row) => sum + row.minutes, 0)
                    const months = data.months.map((_, index) =>
                      group.items.reduce((sum, row) => sum + (row.byMonth[index] ?? 0), 0),
                    )
                    return (
                      <Fragment key={group.key ?? ''}>
                        <tr className="stats__group">
                          <td>{group.name ?? NO_GROUP}</td>
                          {bars(months)}
                          <td className="num">{total > 0 ? formatMinutes(total) : '—'}</td>
                        </tr>
                        {group.items.map((row) => line(row, true))}
                      </Fragment>
                    )
                  })
                : data.categories.map((row) => line(row, false))}
            </tbody>
          </table>
          <p className="muted">
            Малые столбики — месяцы по порядку, у каждой категории своя шкала: видно, когда она росла. Сколько —
            числом справа.
          </p>
        </>
      )}
      {data.total.byKind.length > 0 && <p className="muted">По признаку: {kindLine(data.total.byKind)}</p>}
    </div>
  )
}
