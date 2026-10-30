import { formatPeriod, type DateStr } from '../../shared/core/dates.ts'
import { weekdayBasis, weekdayLine, weekdayWeeksText } from './labels.ts'
import { ready, Unready } from './Period.tsx'
import { useBlocks } from './useBlocks.ts'
import { useCatalog } from './useCatalog.ts'
import { useSpecials } from './useSpecials.ts'
import { weekdayPattern } from './weekdays.ts'

/**
 * «По дням недели» — блок обзора недели (Р-110): семь строк, пн…вс, что
 * свойственно каждому дню за окно в несколько полных недель. Окно идёт
 * за обозреваемой неделей. Строка без данных не прячется — «мало данных».
 */
export function WeekdayPattern({ week, today }: { week: DateStr; today: DateStr }) {
  const catalog = useCatalog()
  const time = useBlocks()
  const specials = useSpecials()
  if (!ready(catalog, time, specials)) return <Unready catalog={catalog} time={time} specials={specials} />

  const { window, rows } = weekdayPattern(time.blocks, catalog.categories, week, today)

  return (
    <>
      <p className="muted">
        {weekdayWeeksText()} · {formatPeriod(window)}
      </p>
      <ul className="plain">
        {rows.map((row) => (
          <li key={row.weekday} className="tblock__main">
            <p>{weekdayLine(row)}</p>
          </li>
        ))}
      </ul>
      <p className="muted">{weekdayBasis()}</p>
    </>
  )
}
