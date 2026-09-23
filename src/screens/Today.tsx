import { Link } from 'react-router-dom'
import { formatDateLong } from '../shared/core/dates.ts'
import { Fold } from '../shared/ui/Fold.tsx'
import { IosNote } from '../shared/ui/Install.tsx'
import { syncDot } from '../shared/ui/syncDot.ts'
import { useNow } from '../shared/ui/useNow.ts'
import { useSyncStatus } from '../shared/ui/useSync.ts'
import { useToday } from '../shared/ui/useToday.ts'
import { useScreenNames } from '../ui/useScreenNames.ts'
import { PlanDay } from '../modules/notes/PlanDay.tsx'
import { windowLeft } from '../modules/time/day.ts'
import { TimeDay } from '../modules/time/TimeDay.tsx'
import { ReviewCall } from './Review.tsx'
import { useFirstRun } from '../shared/screens/useFirstRun.ts'
import { useWhatsNew } from '../shared/screens/useWhatsNew.ts'
import { Welcome } from './Welcome.tsx'
import { WhatsNew } from '../shared/screens/WhatsNew.tsx'
import { OWN_STORES } from '../app/model.ts'
import { CHANGES } from '../changes.ts'

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
  const first = useFirstRun(OWN_STORES)
  const news = useWhatsNew(first, CHANGES)
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
            {/* Справка (Р-64): непонятное случается здесь, на главном. */}
            <Link className="gear" to="/help" aria-label="Справка">
              <span aria-hidden="true">?</span>
            </Link>
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

      {/* После обновления — что поменялось (Р-65). Свежей установке — ничего. */}
      {news.show.length > 0 && <WhatsNew changes={news.show} onDone={news.dismiss} />}

      {/* iPhone во вкладке Safari: у установленного своё хранилище. */}
      {first.iosNote && (
        <section className="stub block">
          <IosNote empty={first.iosNote === 'before'} />
          <button type="button" className="link-btn" onClick={first.hideIosNote}>
            Скрыть
          </button>
        </section>
      )}

      {/* В воскресенье и понедельник, пока обзор недели не проведён (Р-41). */}
      <ReviewCall today={day} />

      <PlanDay today={day} left={windowLeft(day, now)} />

      {/* Учёт времени: кнопки и итог дня. Список блоков — на экране учёта. */}
      <Fold id="today:time" title={names.time}>
        <TimeDay day={day} compact />
        <p>
          <Link to="/time">Все блоки дня →</Link>
        </p>
      </Fold>

      {/* Обзор, итоги и лента — не вкладки: их открывают не каждый день (Р-41, Р-54, Р-62).
          Каждый — своей карточкой, чтобы было видно, что это разные экраны (Р-71). */}
      <section className="block">
        <h2>Итоги и история</h2>
        <nav className="link-cards" aria-label="Итоги и история">
          {HISTORY_LINKS.map((link) => (
            <Link key={link.to} className="link-card" to={link.to}>
              <LinkIcon kind={link.icon} />
              <span className="link-card__main">
                <span className="link-card__title">{link.title}</span>
                <span className="link-card__sub">{link.sub}</span>
              </span>
              <span className="link-card__go" aria-hidden="true">
                ›
              </span>
            </Link>
          ))}
        </nav>
      </section>
    </>
  )
}

type IconKind = 'week' | 'month' | 'year' | 'feed'

/** Экраны, которые открывают не каждый день: обзор, итоги, лента. */
const HISTORY_LINKS: readonly { to: string; icon: IconKind; title: string; sub: string }[] = [
  { to: '/review', icon: 'week', title: 'Обзор недели', sub: 'план против факта, нормы, висяки' },
  { to: '/month', icon: 'month', title: 'Итоги месяца', sub: 'время против прошлого месяца' },
  { to: '/year', icon: 'year', title: 'Итоги года', sub: 'месяцы столбцами, категории за год' },
  { to: '/feed', icon: 'feed', title: 'Лента', sub: 'все записи хроникой, с поиском' },
]

/**
 * Значок карточки — своим SVG: символы вроде ▦ на части телефонов
 * рисуются пустым квадратом.
 */
function LinkIcon({ kind }: { kind: IconKind }) {
  const paths: Record<IconKind, string> = {
    week: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
    month: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
    year: 'M6 20v-8M12 20V5M18 20v-11',
    feed: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  }
  return (
    <span className="link-card__icon" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={paths[kind]} />
      </svg>
    </span>
  )
}
