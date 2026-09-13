import { Link } from 'react-router-dom'
import { formatDateLong } from '../../core/dates.ts'
import { useToday } from '../../ui/useToday.ts'
import { windowNote } from './labels.ts'
import { TimeDay } from './TimeDay.tsx'

/**
 * Учёт времени — экран `/time`. Сюда ведёт ярлык «Учесть время» по долгому
 * тапу на иконке (`?go=time`, Р-16): адрес зашит в установленное приложение
 * и меняться не должен.
 */
export function TimeScreen() {
  const day = useToday()

  return (
    <>
      <header className="screen-head">
        <div className="screen-head__row">
          <h1>Время</h1>
          <div className="screen-head__tools">
            <Link className="gear" to="/time/categories" aria-label="Категории">
              <span aria-hidden="true">☰</span>
            </Link>
          </div>
        </div>
        <p className="muted">{formatDateLong(day)}</p>
      </header>

      <TimeDay day={day} />

      <p className="muted">{windowNote()}</p>
    </>
  )
}
