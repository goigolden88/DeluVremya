import { Link } from 'react-router-dom'
import { formatDateLong } from '../core/dates.ts'
import { Fold } from '../ui/Fold.tsx'
import { IosNote } from '../ui/Install.tsx'
import { syncDot } from '../ui/syncDot.ts'
import { useNow } from '../ui/useNow.ts'
import { useSyncStatus } from '../ui/useSync.ts'
import { useToday } from '../ui/useToday.ts'
import { useScreenNames } from '../ui/useScreenNames.ts'
import { PlanDay } from '../modules/notes/PlanDay.tsx'
import { windowLeft } from '../modules/time/day.ts'
import { TimeDay } from '../modules/time/TimeDay.tsx'
import { useFirstRun } from './useFirstRun.ts'
import { Welcome } from './Welcome.tsx'

/** Остаток дня в реализме плана пересчитывается раз в минуту. */
const MINUTE = 60 * 1000

/**
 * Главный экран «Сегодня»: что я делаю сегодня (Р-33) — план дня с главным
 * делом и реализмом, под ним учёт времени кнопками и итогом. Время целиком —
 * таймер, «задним числом», блоки, прошлые дни — на экране учёта.
 *
 * Здесь встречаются два модуля: план — заметок, окно дня — учёта. Друг
 * о друге они не знают, остаток окна передаёт в план этот экран (Р-35).
 */
export function Today() {
  const first = useFirstRun()
  const day = useToday()
  const now = useNow(MINUTE)
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

      <PlanDay today={day} left={windowLeft(day, now)} />

      {/* Учёт времени: кнопки и итог дня. Список блоков — на экране учёта. */}
      <Fold id="today:time" title={names.time}>
        <TimeDay day={day} compact />
        <p>
          <Link to="/time">Все блоки дня →</Link>
        </p>
      </Fold>
    </>
  )
}
