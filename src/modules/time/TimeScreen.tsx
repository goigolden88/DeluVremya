import { Link, useSearchParams } from 'react-router-dom'
import { addDays, formatDateLong, type DateStr } from '../../core/dates.ts'
import { useToday } from '../../ui/useToday.ts'
import { useScreenNames } from '../../ui/useScreenNames.ts'
import { viewedDay } from './day.ts'
import { windowNote } from './labels.ts'
import { TimeDay } from './TimeDay.tsx'

/**
 * Учёт времени — экран `/time`. Сюда ведёт ярлык «Учесть время» по долгому
 * тапу на иконке (`?go=time`, Р-16): адрес зашит в установленное приложение
 * и меняться не должен.
 *
 * Прошлый день — тот же экран с `?day=ГГГГ-ММ-ДД` (Р-25): день в адресе
 * переживает перезагрузку и кнопку «назад», а без параметра — сегодня.
 */
export function TimeScreen() {
  const today = useToday()
  const names = useScreenNames()
  const [params, setParams] = useSearchParams()
  const day = viewedDay(params.get('day'), today)
  const isToday = day === today

  // Сегодняшний — без параметра: ровно тот адрес, что открывает ярлык.
  const show = (next: DateStr) => setParams(next === today ? {} : { day: next })

  return (
    <>
      <header className="screen-head">
        <div className="screen-head__row">
          <h1>{names.time}</h1>
          <div className="screen-head__tools">
            <Link className="gear" to="/time/categories" aria-label="Категории">
              <span aria-hidden="true">☰</span>
            </Link>
          </div>
        </div>
        <div className="day-nav">
          <button type="button" className="icon-btn" aria-label="Предыдущий день" onClick={() => show(addDays(day, -1))}>
            ‹
          </button>
          {/* Календарь — поле даты браузера (Р-27): к дню месяцы назад
              одним выбором, а не сотней тапов «‹». */}
          <input
            type="date"
            name="day"
            className="day-nav__date"
            aria-label="Выбрать день"
            max={today}
            value={day}
            onChange={(event) => {
              // Пустое — поле очистили крестиком: переходить некуда.
              if (event.target.value) show(viewedDay(event.target.value, today))
            }}
          />
          <button
            type="button"
            className="icon-btn"
            aria-label="Следующий день"
            disabled={isToday}
            onClick={() => show(addDays(day, 1))}
          >
            ›
          </button>
        </div>
        <p className="muted">
          {formatDateLong(day)}
          {isToday && ' · сегодня'}
        </p>
        {!isToday && (
          <button type="button" className="link-btn" onClick={() => show(today)}>
            К сегодняшнему дню
          </button>
        )}
      </header>

      {/* Ключ — день: отклик «Отменить» и форма «задним числом» — про свой день. */}
      <TimeDay key={day} day={day} today={today} />

      <p className="muted">{windowNote()}</p>
    </>
  )
}
