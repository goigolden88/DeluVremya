import { useState } from 'react'
import type { DateStr } from '../../core/dates.ts'
import { db } from '../../core/db.ts'
import type { Note } from '../../core/model.ts'
import { Fold } from '../../ui/Fold.tsx'
import { inboxOf } from './inbox.ts'
import {
  AHEAD_TITLE,
  ageText,
  dayText,
  DONE_OFF_PLAN_TITLE,
  FROM_UNSORTED_TITLE,
  MAIN_TITLE,
  offPlanMeta,
  OVERDUE_TITLE,
  overdueLead,
  PLAN_TITLE,
  realismText,
  shortText,
  TO_UNSORTED,
} from './labels.ts'
import {
  ahead,
  dayPlan,
  doneOffPlan,
  makeMain,
  movePlanItem,
  overdue,
  planNote,
  realism,
  withoutMain,
  withPlan,
} from './plan.ts'
import { PlanRow } from './PlanItem.tsx'
import { PlanTemplates } from './PlanTemplates.tsx'
import { useNotes } from './useNotes.ts'

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/**
 * План дня на «Сегодня» (Р-33): хвост прошлых дней, главное, пункты,
 * реализм, дела из неразобранного, будущие пункты, сделанное вне плана.
 *
 * `left` — сколько минут осталось от окна дня. Окно — дело учёта времени,
 * а модули друг о друге не знают: число передаёт экран (Р-35).
 */
export function PlanDay({ today, left }: { today: DateStr; left: number }) {
  const read = useNotes()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  if (read.error) return <p className="error">Записи не прочитались: {read.error}</p>
  if (read.notes === null) return null

  const all = read.notes
  const plan = dayPlan(all, today)
  const tail = overdue(all, today)
  const later = ahead(all, today)
  const laterCount = later.reduce((sum, group) => sum + group.notes.length, 0)
  const offPlan = doneOffPlan(all, today)
  const tasks = inboxOf(all).filter((note) => note.kind === 'task')
  const verdict = realism(plan.all, left)

  /** Несколько записей одним действием: главное и его прежнее, весь хвост разом. */
  async function write(records: Note[]) {
    setError('')
    try {
      await db.putMany('notes', records)
    } catch (failure) {
      setError(describe(failure))
    }
  }

  async function add() {
    const draft = planNote(text, today, today)
    if (!draft) return
    setBusy(true)
    setError('')
    try {
      await db.put('notes', draft)
      setText('')
    } catch (failure) {
      setError(describe(failure))
    } finally {
      setBusy(false)
    }
  }

  // Звезда: у главного снимает отметку, у другого пункта — переносит её (Р-40).
  const star = (note: Note) => () =>
    void write(note === plan.main ? [withoutMain(note)] : makeMain(note, plan.all))

  const common = (note: Note) => ({
    note,
    today,
    open: openId === note.id,
    onToggle: () => setOpenId(openId === note.id ? null : note.id),
    onError: setError,
  })

  return (
    <>
      {/* Хвост — первым: пока он не разобран, план дня не собран (Р-34). */}
      {tail.length > 0 && (
        <section className="block">
          <h2>{OVERDUE_TITLE}</h2>
          <p className="muted">{overdueLead(tail.length)}</p>
          {tail.length > 1 && (
            <div className="row row--wrap plan__bulk">
              <button type="button" className="btn" onClick={() => void write(tail.map((note) => withPlan(note, today)))}>
                Всё — на сегодня
              </button>
            </div>
          )}
          <ul className="plain">
            {tail.map((note) => (
              <PlanRow
                key={note.id}
                {...common(note)}
                meta={dayText(note.plannedFor ?? '', today)}
                actions={
                  <div className="row row--wrap plan-item__actions">
                    <button
                      type="button"
                      className="btn"
                      aria-label={`На сегодня: ${shortText(note.text)}`}
                      onClick={() => void write([withPlan(note, today)])}
                    >
                      На сегодня
                    </button>
                    <button
                      type="button"
                      className="btn"
                      aria-label={`${TO_UNSORTED}: ${shortText(note.text)}`}
                      onClick={() => void write([withPlan(note, null)])}
                    >
                      {TO_UNSORTED}
                    </button>
                  </div>
                }
              />
            ))}
          </ul>
        </section>
      )}

      <section className="block">
        <h2>{PLAN_TITLE}</h2>

        {/* Реализм — первым, плашкой: видно до пунктов, а не после (Р-72). */}
        {verdict && (
          <p className={verdict.over > 0 ? 'plan__realism plan__realism--over' : 'plan__realism'}>
            {realismText(verdict)}
          </p>
        )}

        {plan.all.length > 0 && (
          <div className="plan__main">
            <span className="plan__label">{MAIN_TITLE}</span>
            {plan.main ? (
              <ul className="plain">
                <PlanRow {...common(plan.main)} check main onMain={star(plan.main)} move />
              </ul>
            ) : (
              <p className="muted">Главное не выбрано — ☆ у пункта плана.</p>
            )}
          </div>
        )}

        <form
          className="row plan__add"
          onSubmit={(event) => {
            event.preventDefault()
            void add()
          }}
        >
          <input
            name="plan-text"
            placeholder="Добавить в план"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <button type="submit" className="btn" disabled={busy || !text.trim()}>
            Добавить
          </button>
        </form>

        {plan.open.length > 0 && (
          <ul className="plain">
            {plan.open.map((note, index) => (
              <PlanRow
                key={note.id}
                {...common(note)}
                check
                onMain={star(note)}
                move
                place={{
                  first: index === 0,
                  last: index === plan.open.length - 1,
                  onMove: (step) => void write(movePlanItem(plan.open, note.id, step)),
                }}
              />
            ))}
          </ul>
        )}

        {plan.done.length > 0 && (
          <ul className="plain">
            {plan.done.map((note) => (
              <PlanRow key={note.id} {...common(note)} check />
            ))}
          </ul>
        )}

        {plan.all.length === 0 && (
          <p className="muted">В плане пусто — дела из неразобранного ниже или полем выше.</p>
        )}
        {error && <p className="error">Не записалось: {error}</p>}
      </section>

      <PlanTemplates notes={all} plan={plan} today={today} />

      {/* Дело в план одним тапом (План, Этап 4, п. 1). Список бывает длинным — свёрнут. */}
      {tasks.length > 0 && (
        <Fold id="today:from-unsorted" title={FROM_UNSORTED_TITLE} summary={tasks.length} folded>
          <ul className="plain">
            {tasks.map((note) => (
              <li key={note.id} className="plan-item">
                <div className="plan-item__row">
                  <span className="plan-item__text">{note.text}</span>
                  <span className="muted plan-item__est">{ageText(note, today)}</span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`В план на сегодня: ${shortText(note.text)}`}
                    onClick={() => void write([withPlan(note, today)])}
                  >
                    +
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Fold>
      )}

      {later.length > 0 && (
        <Fold id="today:ahead" title={AHEAD_TITLE} summary={laterCount} folded>
          {later.map((group) => (
            <div key={group.day} className="month-group">
              <h3 className="unit__name">{dayText(group.day, today)}</h3>
              <ul className="plain">
                {group.notes.map((note) => (
                  <PlanRow key={note.id} {...common(note)} move />
                ))}
              </ul>
            </div>
          ))}
        </Fold>
      )}

      {offPlan.length > 0 && (
        <Fold id="today:done-off-plan" title={DONE_OFF_PLAN_TITLE} summary={offPlan.length} folded>
          <ul className="plain">
            {offPlan.map((note) => (
              <PlanRow key={note.id} {...common(note)} check meta={offPlanMeta(note, today)} />
            ))}
          </ul>
        </Fold>
      )}
    </>
  )
}
