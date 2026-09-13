import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { addDays, formatPeriod, weekPeriod, weekStart, type DateStr } from '../core/dates.ts'
import { db } from '../core/db.ts'
import { captureNote, noteRef } from '../modules/notes/inbox.ts'
import { durationText } from '../modules/notes/labels.ts'
import { PlanWeek } from '../modules/notes/PlanWeek.tsx'
import { RecallWeeks } from '../modules/notes/Recall.tsx'
import { StaleReview } from '../modules/notes/StaleReview.tsx'
import { useNotes } from '../modules/notes/useNotes.ts'
import { WeekNorms, WeekTime } from '../modules/time/Week.tsx'
import { quoted } from '../ui/screenNames.ts'
import { useScreenNames } from '../ui/useScreenNames.ts'
import { useToday } from '../ui/useToday.ts'
import { doneText, markReviewed, reviewCall, reviewOf, viewedWeek } from './review.ts'
import { useReviews, useThresholds } from './useReview.ts'

const MINUTE = 60 * 1000

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/**
 * Обзор недели — экран `#/review?week=` (Р-41). Читает оба модуля и потому
 * живёт в `screens/` (Р-10): расчёты — в модулях, каждый своё, здесь они
 * сведены шагами по порядку. Последний шаг — наблюдение недели обычной
 * мыслью (Р-49) и запись обзора, одна на неделю (Р-42).
 */
export function Review() {
  const today = useToday()
  const names = useScreenNames()
  const [params, setParams] = useSearchParams()
  const week = viewedWeek(params.get('week'), today)
  const current = week === weekStart(today)
  const reviews = useReviews()
  const thresholds = useThresholds()
  const notes = useNotes()
  /** С какого момента идёт обзор — чтобы сказать, сколько он занял. */
  const opened = useRef(Date.now())
  const [text, setText] = useState('')
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const done = reviews.reviews === null ? null : reviewOf(reviews.reviews, week)
  const linked =
    done === null || notes.notes === null
      ? []
      : notes.notes.filter((note) => !note.deleted && (done.refs ?? []).includes(noteRef(note.id)))

  async function finish() {
    setBusy(true)
    setError('')
    setSaved('')
    try {
      const thought = captureNote(text, today, 'thought')
      if (thought) await db.put('notes', thought)
      await db.put('reviews', markReviewed(done, week, new Date().toISOString(), thought ? [noteRef(thought.id)] : []))
      setText('')
      const spent = Math.max(1, Math.round((Date.now() - opened.current) / MINUTE))
      setSaved(done === null ? `Обзор записан · занял ${durationText(spent)}` : 'Наблюдение записано')
    } catch (failure) {
      setError(describe(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header className="screen-head">
        <Link className="back" to="/">
          ← {names.today}
        </Link>
        <h1>Обзор недели</h1>
        <div className="day-nav">
          <button
            type="button"
            className="icon-btn"
            aria-label="Предыдущая неделя"
            onClick={() => setParams({ week: addDays(week, -7) })}
          >
            ‹
          </button>
          <span className="day-nav__date">{formatPeriod(weekPeriod(week))}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Следующая неделя"
            disabled={current}
            onClick={() => setParams({ week: addDays(week, 7) })}
          >
            ›
          </button>
        </div>
        <p className="muted">
          {done ? doneText(done) : 'Обзор не проведён'}
          {current && ' · неделя ещё идёт'}
        </p>
      </header>

      {reviews.error && <p className="error">Обзоры не прочитались: {reviews.error}</p>}

      <section className="block">
        <h2>Время недели</h2>
        <WeekTime week={week} today={today} />
      </section>

      <section className="block">
        <h2>План против факта</h2>
        <PlanWeek week={week} today={today} />
      </section>

      <section className="block">
        <h2>Нормы</h2>
        <WeekNorms week={week} today={today} />
      </section>

      <section className="block">
        <h2>Висяки и замыслы</h2>
        {thresholds && <StaleReview today={today} staleDays={thresholds.stale} goalDays={thresholds.goal} />}
      </section>

      <section className="block">
        <h2>Возврат</h2>
        <RecallWeeks week={week} />
      </section>

      <section className="block">
        <h2>Наблюдение недели</h2>
        {linked.length > 0 && (
          <ul className="plain">
            {linked.map((note) => (
              <li key={note.id} className="recall">
                {note.text}
              </li>
            ))}
          </ul>
        )}
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault()
            void finish()
          }}
        >
          <label className="field">
            <span>Что заметил за неделю — необязательно</span>
            <textarea name="observation" value={text} onChange={(event) => setText(event.target.value)} />
          </label>
          <p className="muted">
            Запишется мыслью на экран {quoted(names.inbox)} и вернётся в обзоре через несколько недель.
          </p>
          <div className="form__actions">
            <button
              type="submit"
              className="btn btn--primary"
              disabled={busy || reviews.reviews === null || (done !== null && !text.trim())}
            >
              {done ? 'Записать наблюдение' : 'Обзор проведён'}
            </button>
          </div>
        </form>
        {saved && <p className="added">{saved}</p>}
        {error && <p className="error">Не записалось: {error}</p>}
      </section>
    </>
  )
}

/**
 * Карточка на «Сегодня»: в воскресенье и понедельник, пока обзор недели
 * не проведён (Р-41). Звать только к одной неделе — долг не копится.
 */
export function ReviewCall({ today }: { today: DateStr }) {
  const reviews = useReviews()
  if (reviews.reviews === null) return null
  const week = reviewCall(reviews.reviews, today)
  if (week === null) return null

  return (
    <section className="block">
      <h2>Обзор недели ждёт</h2>
      <p className="muted">{formatPeriod(weekPeriod(week))} — шаги по порядку, минут на десять.</p>
      <p>
        <Link className="btn btn--primary" to="/review">
          Провести обзор
        </Link>
      </p>
    </section>
  )
}
