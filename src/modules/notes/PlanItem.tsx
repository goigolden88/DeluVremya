import { useState, type ReactNode } from 'react'
import { addDays, isDateStr, type DateStr } from '../../core/dates.ts'
import { db } from '../../core/db.ts'
import type { Note } from '../../core/model.ts'
import { markDone, reopen, withText } from './inbox.ts'
import { deleteConfirm, durationText, shortText, TO_UNSORTED } from './labels.ts'
import { ESTIMATE_CHOICES, readEstimate, withEstimate, withPlan } from './plan.ts'

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/**
 * Куда поставить: сегодня, завтра, любой день (Р-37). Кнопки дня, где запись
 * уже стоит, нет — ставить туда незачем. Общая для карточки пункта плана
 * и карточки дела на «Заметках».
 */
export function PlanButtons({ note, today, onMove }: { note: Note; today: DateStr; onMove: (day: DateStr) => void }) {
  const tomorrow = addDays(today, 1)
  return (
    <>
      <div className="row row--wrap">
        {note.plannedFor !== today && (
          <button type="button" className="btn" onClick={() => onMove(today)}>
            На сегодня
          </button>
        )}
        {note.plannedFor !== tomorrow && (
          <button type="button" className="btn" onClick={() => onMove(tomorrow)}>
            На завтра
          </button>
        )}
      </div>
      {/* Пустое значение после выбора: поле — кнопка «на день», а не хранилище даты. */}
      <label className="field">
        <span>На день</span>
        <input
          type="date"
          name="plan-day"
          min={today}
          value=""
          onChange={(event) => {
            const day = event.target.value
            if (isDateStr(day) && day >= today) onMove(day)
          }}
        />
      </label>
    </>
  )
}

type RowProps = {
  note: Note
  today: DateStr
  open: boolean
  onToggle: () => void
  onError: (message: string) => void
  /** Галочка «сделано» в строке — у пунктов сегодняшнего дня и сделанного вне плана. */
  check?: boolean
  /** Главное ли — звездой; без `onMain` звезды нет. */
  main?: boolean
  onMain?: () => void
  /** Серая строка под текстом: день пункта, откуда он. */
  meta?: string
  /** Кнопки прямо в строке — у хвоста прошлых дней (Р-34). */
  actions?: ReactNode
}

/**
 * Строка пункта плана: галочка, текст, оценка, звезда главного. Тап по
 * тексту раскрывает карточку на месте, как у заметки (Р-30).
 */
export function PlanRow({ note, today, open, onToggle, onError, check = false, main = false, onMain, meta, actions }: RowProps) {
  const done = note.status === 'done'
  const name = shortText(note.text)

  async function toggleDone() {
    try {
      await db.put('notes', done ? reopen(note) : markDone(note, today))
    } catch (failure) {
      onError(describe(failure))
    }
  }

  return (
    <li className={done ? 'plan-item plan-item--done' : 'plan-item'}>
      <div className="plan-item__row">
        {check && (
          <button
            type="button"
            className="check-btn"
            aria-pressed={done}
            aria-label={`${done ? 'Не сделано' : 'Сделано'}: ${name}`}
            onClick={() => void toggleDone()}
          >
            <span className="check-btn__box" aria-hidden="true">
              {done ? '✓' : ''}
            </span>
          </button>
        )}
        <button type="button" className="plain-btn plan-item__text" aria-expanded={open} onClick={onToggle}>
          {note.text}
        </button>
        {note.estMin !== undefined && <span className="muted plan-item__est">{durationText(note.estMin)}</span>}
        {onMain && (
          <button
            type="button"
            className="star-btn"
            aria-pressed={main}
            aria-label={`${main ? 'Снять главное' : 'Сделать главным'}: ${name}`}
            onClick={onMain}
          >
            {main ? '★' : '☆'}
          </button>
        )}
      </div>
      {meta && <span className="muted note__meta">{meta}</span>}
      {actions}
      {open && <PlanCard note={note} today={today} withDone={!check} onError={onError} />}
    </li>
  )
}

/**
 * Карточка пункта: текст, оценка, другой день, возврат в неразобранное,
 * «Сделано» — где в строке нет галочки, — и «Удалить».
 */
function PlanCard({
  note,
  today,
  withDone,
  onError,
}: {
  note: Note
  today: DateStr
  withDone: boolean
  onError: (message: string) => void
}) {
  const [text, setText] = useState(note.text)
  const [estimate, setEstimate] = useState('')
  const [estimateError, setEstimateError] = useState('')
  const edited = withText(note, text)
  const isOpen = note.status === 'open'

  async function save(next: Note) {
    if (next === note) return
    try {
      await db.put('notes', next)
    } catch (failure) {
      onError(describe(failure))
    }
  }

  async function remove() {
    if (!window.confirm(deleteConfirm(note.text))) return
    try {
      await db.remove('notes', note.id)
    } catch (failure) {
      onError(describe(failure))
    }
  }

  function saveEstimate() {
    const read = readEstimate(estimate)
    if ('error' in read) {
      setEstimateError(read.error)
      return
    }
    setEstimateError('')
    setEstimate('')
    void save(withEstimate(note, read.minutes))
  }

  return (
    <div className="form plan-card">
      <label className="field">
        <span>Текст</span>
        <textarea name="plan-note-text" rows={2} value={text} onChange={(event) => setText(event.target.value)} />
      </label>
      {edited !== null && edited !== note && (
        <div className="form__actions">
          <button type="button" className="btn" onClick={() => void save(edited)}>
            Сохранить текст
          </button>
        </div>
      )}

      {/* Оценка необязательна: без неё пункт просто не входит в сумму (Р-35). */}
      <div className="chips" role="group" aria-label="Оценка">
        {ESTIMATE_CHOICES.map((minutes) => (
          <button
            key={minutes}
            type="button"
            className={note.estMin === minutes ? 'chip chip--on' : 'chip'}
            aria-pressed={note.estMin === minutes}
            onClick={() => void save(withEstimate(note, note.estMin === minutes ? null : minutes))}
          >
            {durationText(minutes)}
          </button>
        ))}
      </div>
      <form
        className="row"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          saveEstimate()
        }}
      >
        <input
          name="plan-estimate"
          inputMode="numeric"
          placeholder="Своя оценка, минут"
          value={estimate}
          onChange={(event) => setEstimate(event.target.value)}
        />
        <button type="submit" className="btn">
          Поставить
        </button>
      </form>
      {estimateError && <p className="error">{estimateError}</p>}
      {note.estMin !== undefined && (
        <button type="button" className="link-btn" onClick={() => void save(withEstimate(note, null))}>
          Без оценки
        </button>
      )}

      {isOpen && <PlanButtons note={note} today={today} onMove={(day) => void save(withPlan(note, day))} />}

      <div className="row row--wrap">
        {isOpen && (
          <button type="button" className="btn" onClick={() => void save(withPlan(note, null))}>
            {TO_UNSORTED}
          </button>
        )}
        {withDone && isOpen && (
          <button type="button" className="btn" onClick={() => void save(markDone(note, today))}>
            Сделано
          </button>
        )}
        <button type="button" className="btn btn--danger" onClick={() => void remove()}>
          Удалить
        </button>
      </div>
    </div>
  )
}
