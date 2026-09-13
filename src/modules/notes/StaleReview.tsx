import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { addDays, type DateStr } from '../../core/dates.ts'
import { db } from '../../core/db.ts'
import type { Note } from '../../core/model.ts'
import {
  ageText,
  deleteConfirm,
  firstLine,
  plannedLine,
  shortText,
  SOMEDAY_TITLE,
  staleLead,
  staleNone,
  staleRest,
  stuckLead,
  stuckMeta,
} from './labels.ts'
import { withPlan } from './plan.ts'
import { STALE_BATCH, staleTasks, stuckGoals, withSomeday } from './review.ts'
import { useNotes } from './useNotes.ts'

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/**
 * Разбор висяков (Р-46) и замыслы без движения (Р-47) — шаг обзора недели.
 * Висяки — на сегодня, а не на показанную неделю: висит то, что висит сейчас.
 *
 * За обзор — пять самых старых: какие именно, запоминается при открытии
 * экрана, и разобранное не подтягивает следующие. Остальные названы числом.
 * `staleDays`, `goalDays` — пороги из настроек устройства (Р-48).
 */
export function StaleReview({ today, staleDays, goalDays }: { today: DateStr; staleDays: number; goalDays: number }) {
  const read = useNotes()
  const batch = useRef<Set<string> | null>(null)
  /** Последнее решение — его снимает «Отменить»: запись до правки. */
  const [last, setLast] = useState<{ before: Note; text: string } | null>(null)
  const [error, setError] = useState('')

  if (read.error) return <p className="error">Записи не прочитались: {read.error}</p>
  if (read.notes === null) return null

  const all = read.notes
  const stale = staleTasks(all, today, staleDays)
  if (batch.current === null) batch.current = new Set(stale.slice(0, STALE_BATCH).map((note) => note.id))
  const chosen = batch.current
  const shown = stale.filter((note) => chosen.has(note.id))
  const stuck = stuckGoals(all, today, goalDays)
  const tomorrow = addDays(today, 1)

  async function act(before: Note, write: () => Promise<unknown>, text: string) {
    setError('')
    try {
      await write()
      setLast({ before, text })
    } catch (failure) {
      setError(describe(failure))
    }
  }

  async function undo() {
    if (!last) return
    setError('')
    try {
      await db.put('notes', last.before)
      setLast(null)
    } catch (failure) {
      setError(describe(failure))
    }
  }

  return (
    <>
      {stale.length === 0 ? (
        <p className="muted">{staleNone(staleDays)}</p>
      ) : (
        <p className="muted">{staleLead(stale.length, staleDays)}</p>
      )}

      {shown.length > 0 && (
        <ul className="plain">
          {shown.map((note) => (
            <li key={note.id} className="plan-item">
              <div className="plan-item__row">
                <span className="plan-item__text">{note.text}</span>
                <span className="muted plan-item__est">{ageText(note, today)}</span>
              </div>
              <div className="row row--wrap plan-item__actions">
                <button
                  type="button"
                  className="btn"
                  aria-label={`На завтра: ${shortText(note.text)}`}
                  onClick={() =>
                    void act(note, () => db.put('notes', withPlan(note, tomorrow)), plannedLine(tomorrow, today))
                  }
                >
                  На завтра
                </button>
                <button
                  type="button"
                  className="btn"
                  aria-label={`Когда-нибудь: ${shortText(note.text)}`}
                  onClick={() =>
                    void act(note, () => db.put('notes', withSomeday(note)), `Отложено в «${SOMEDAY_TITLE}»`)
                  }
                >
                  Когда-нибудь
                </button>
                <button
                  type="button"
                  className="btn btn--danger"
                  aria-label={`Удалить: ${shortText(note.text)}`}
                  onClick={() => {
                    if (window.confirm(deleteConfirm(note.text))) {
                      void act(note, () => db.remove('notes', note.id), 'Удалено')
                    }
                  }}
                >
                  Удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {stale.length > shown.length && <p className="muted">{staleRest(stale.length - shown.length)}</p>}

      {last && (
        <p className="added">
          <span>{last.text}</span>
          <button type="button" className="link-btn" onClick={() => void undo()}>
            Отменить
          </button>
        </p>
      )}
      {error && <p className="error">Не записалось: {error}</p>}

      {stuck.length > 0 && (
        <>
          <h3 className="unit__name">{stuckLead(goalDays)}</h3>
          <ul className="plain">
            {stuck.map(({ goal, since }) => (
              <li key={goal.id}>
                <Link to="/inbox">{firstLine(goal.text)}</Link> <span className="muted">— {stuckMeta(since)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
