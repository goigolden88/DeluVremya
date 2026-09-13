import { Link } from 'react-router-dom'
import { formatDateLong } from '../core/dates.ts'
import { IosNote } from '../ui/Install.tsx'
import { syncDot } from '../ui/syncDot.ts'
import { useSyncStatus } from '../ui/useSync.ts'
import { useToday } from '../ui/useToday.ts'
import { useScreenNames } from '../ui/useScreenNames.ts'
import { TimeDay } from '../modules/time/TimeDay.tsx'
import { useFirstRun } from './useFirstRun.ts'
import { Welcome } from './Welcome.tsx'

/**
 * Главный экран «Сегодня»: план дня, главное дело, записанное время
 * (02-Архитектура). Блоки модулей встают сюда по этапам; до них — дата,
 * настройки и приветствие первого запуска.
 */
export function Today() {
  const first = useFirstRun()
  const day = useToday()
  const names = useScreenNames()
  const mark = syncDot(useSyncStatus())

  return (
    <>
      <header className="screen-head">
        <div className="screen-head__row">
          <h1>{names.today}</h1>
          <div className="screen-head__tools">
            <Link className="gear" to="/settings" aria-label="Настройки">
              <span aria-hidden="true">⚙</span>
              {mark && <span className={mark} aria-hidden="true" />}
            </Link>
          </div>
        </div>
        <p className="muted">{formatDateLong(day)}</p>
      </header>

      {/* Первый запуск: пока база пуста и приветствие не закрыли. */}
      {first.welcome && <Welcome onDone={first.dismissWelcome} />}

      {/* iPhone во вкладке Safari: у установленного своё хранилище. */}
      {first.iosNote && (
        <section className="stub block">
          <IosNote empty={first.iosNote === 'before'} />
          <button type="button" className="link-btn" onClick={first.hideIosNote}>
            Скрыть
          </button>
        </section>
      )}

      {/* Учёт времени: кнопки и итог дня. Список блоков — на экране учёта. */}
      <h2>{names.time}</h2>
      <TimeDay day={day} compact />
      <p>
        <Link to="/time">Все блоки дня →</Link>
      </p>

      {first.counted && !first.welcome && (
        <p className="stub">План дня появится здесь следующими обновлениями.</p>
      )}
    </>
  )
}
