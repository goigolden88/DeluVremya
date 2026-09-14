import { Link, useSearchParams } from 'react-router-dom'
import { yearPeriod } from '../core/dates.ts'
import { PlanPeriod } from '../modules/notes/PlanPeriod.tsx'
import { PeriodNorms } from '../modules/time/Period.tsx'
import { YearTime } from '../modules/time/YearTime.tsx'
import { useScreenNames } from '../ui/useScreenNames.ts'
import { useToday } from '../ui/useToday.ts'
import { monthChoices, runningText, viewedYear, yearChoices } from './period.ts'
import { useRecordDates } from './useRecordDates.ts'

/** Адрес итогов месяца — у экрана, а не у модуля: модули маршрутов не знают. */
const monthHref = (month: string) => `#/month?m=${month}`

/**
 * Итоги года — экран `#/year?y=` (Р-57). Читает оба модуля и потому живёт
 * в `screens/` (Р-10). Столбцы месяцев и категории, нормы по неделям года,
 * план против факта — теми же расчётами, что месяц и неделя.
 */
export function Year() {
  const today = useToday()
  const names = useScreenNames()
  const [params, setParams] = useSearchParams()
  const year = viewedYear(params.get('y'), today)
  const period = yearPeriod(year)
  const running = runningText(period, today, 'Год')
  // Годы с записями и показанный — он в списке всегда.
  const years = [...new Set([...yearChoices(monthChoices(useRecordDates(), today)), year])].sort((a, b) => b - a)

  return (
    <>
      <header className="screen-head">
        <Link className="back" to="/">
          ← {names.today}
        </Link>
        <h1>Итоги года</h1>
        <div className="day-nav">
          <button
            type="button"
            className="icon-btn"
            aria-label="Предыдущий год"
            onClick={() => setParams({ y: String(year - 1) })}
          >
            ‹
          </button>
          {/* Любой год — списком (Р-77). */}
          <select
            name="year"
            className="day-nav__date"
            aria-label="Выбрать год"
            value={String(year)}
            onChange={(event) => setParams({ y: event.target.value })}
          >
            {years.map((each) => (
              <option key={each} value={String(each)}>
                {each}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="icon-btn"
            aria-label="Следующий год"
            disabled={year >= Number(today.slice(0, 4))}
            onClick={() => setParams({ y: String(year + 1) })}
          >
            ›
          </button>
        </div>
        {running && <p className="muted">{running}</p>}
      </header>

      <section className="block">
        <h2>Время года</h2>
        <YearTime year={year} today={today} monthHref={monthHref} />
      </section>

      <section className="block">
        <h2>Нормы</h2>
        <PeriodNorms period={period} today={today} marks={false} />
      </section>

      <section className="block">
        <h2>План против факта</h2>
        <PlanPeriod period={period} today={today} />
      </section>
    </>
  )
}
