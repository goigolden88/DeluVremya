import { Link } from 'react-router-dom'
import { formatDateLong, today } from '../core/dates.ts'
import { IosNote } from '../ui/Install.tsx'
import { useFirstRun } from './useFirstRun.ts'
import { Welcome } from './Welcome.tsx'

/**
 * Главный экран «Сегодня»: план дня, главное дело, записанное время
 * (02-Архитектура). Блоки модулей встают сюда по этапам; до них — дата,
 * настройки и приветствие первого запуска.
 */
export function Today() {
  const first = useFirstRun()

  return (
    <>
      <header className="screen-head">
        <div className="screen-head__row">
          <h1>Сегодня</h1>
          <div className="screen-head__tools">
            <Link className="gear" to="/settings" aria-label="Настройки">
              <span aria-hidden="true">⚙</span>
            </Link>
          </div>
        </div>
        <p className="muted">{formatDateLong(today())}</p>
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

      {first.counted && !first.welcome && (
        <p className="stub">План дня и учёт времени появятся здесь следующими обновлениями.</p>
      )}
    </>
  )
}
