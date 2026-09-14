import { Link, useSearchParams } from 'react-router-dom'
import { addMonths, monthOf, monthPeriod } from '../core/dates.ts'
import { PlanPeriod } from '../modules/notes/PlanPeriod.tsx'
import { PeriodNorms, PeriodTime } from '../modules/time/Period.tsx'
import { useScreenNames } from '../ui/useScreenNames.ts'
import { useToday } from '../ui/useToday.ts'
import { monthLabel, monthTitle, runningText, viewedMonth } from './period.ts'

/**
 * Итоги месяца — экран `#/month?m=` (Р-54). Читает оба модуля и потому живёт
 * в `screens/` (Р-10). Записи о проведении нет: месяц читают, а решения
 * принимает обзор недели. Время против прошлого месяца, нормы по неделям
 * месяца, план против факта (Р-55).
 */
export function Month() {
  const today = useToday()
  const names = useScreenNames()
  const [params, setParams] = useSearchParams()
  const month = viewedMonth(params.get('m'), today)
  const period = monthPeriod(month)
  const previous = addMonths(month, -1)
  const running = runningText(period, today, 'Месяц')

  return (
    <>
      <header className="screen-head">
        <Link className="back" to="/">
          ← {names.today}
        </Link>
        <h1>Итоги месяца</h1>
        <div className="day-nav">
          <button
            type="button"
            className="icon-btn"
            aria-label="Предыдущий месяц"
            onClick={() => setParams({ m: previous })}
          >
            ‹
          </button>
          <span className="day-nav__date">{monthTitle(month)}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Следующий месяц"
            disabled={month === monthOf(today)}
            onClick={() => setParams({ m: addMonths(month, 1) })}
          >
            ›
          </button>
        </div>
        {running && <p className="muted">{running}</p>}
      </header>

      <section className="block">
        <h2>Время месяца</h2>
        <PeriodTime
          period={period}
          today={today}
          compare={{ period: monthPeriod(previous), label: monthLabel(previous), own: monthLabel(month) }}
        />
      </section>

      <section className="block">
        <h2>Нормы</h2>
        <PeriodNorms period={period} today={today} marks />
      </section>

      <section className="block">
        <h2>План против факта</h2>
        <PlanPeriod period={period} today={today} />
      </section>

      <p className="muted">
        <Link to={`/year?y=${month.slice(0, 4)}`}>Итоги года →</Link>
      </p>
    </>
  )
}
