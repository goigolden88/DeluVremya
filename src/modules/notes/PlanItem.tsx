import { useState, type ReactNode } from 'react'
import { addDays, isDateStr, type DateStr } from '../../shared/core/dates.ts'
import { db } from '../../app/core.ts'
import type { Note } from '../../app/model.ts'
import { markDone, reopen, withText } from './inbox.ts'
import { deleteConfirm, durationText, MOVE_TITLE, shortText, TO_UNSORTED } from './labels.ts'
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

/**
 * Перенос пункта (Р-80): на завтра, любой день или обратно в неразобранное.
 * Одни и те же кнопки — под ↷ в строке и в карточке пункта.
 */
function MoveButtons({
  note,
  today,
  onError,
  onMoved,
}: {
  note: Note
  today: DateStr
  onError: (message: string) => void
  onMoved?: () => void
}) {
  async function move(day: DateStr | null) {
    try {
      await db.put('notes', withPlan(note, day))
      onMoved?.()
    } catch (failure) {
      onError(describe(failure))
    }
  }

  return (
    <div className="plan-move">
      <PlanButtons note={note} today={today} onMove={(day) => void move(day)} />
      <div className="row row--wrap">
        <button type="button" className="btn" onClick={() => void move(null)}>
          {TO_UNSORTED}
        </button>
      </div>
    </div>
  )
}

type Place = { first: boolean; last: boolean; onMove: (step: -1 | 1) => void }

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
  /** Кнопка ↷ «Перенести» в строке — у открытых пунктов плана и «Впереди» (Р-80). */
  move?: boolean
  /** Место среди открытых пунктов дня: «Выше» и «Ниже» в карточке (Р-75). */
  place?: Place
}

/**
 * Строка пункта плана: галочка, текст, оценка, звезда главного. Тап по
 * тексту раскрывает карточку на месте, как у заметки (Р-30).
 */
export function PlanRow({
  note,
  today,
  open,
  onToggle,
  onError,
  check = false,
  main = false,
  onMain,
  meta,
  actions,
  move = false,
  place,
}: RowProps) {
  const done = note.status === 'done'
  const name = shortText(note.text)
  const [moving, setMoving] = useState(false)
  const movable = move && note.status === 'open'

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
        {movable && (
          <button
            type="button"
            className="move-btn"
            aria-expanded={moving}
            aria-label={`Перенести: ${name}`}
            onClick={() => setMoving(!moving)}
          >
            ↷
          </button>
        )}
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
      {movable && moving && (
        <MoveButtons note={note} today={today} onError={onError} onMoved={() => setMoving(false)} />
      )}
      {open && <PlanCard note={note} today={today} withDone={!check} place={place} onError={onError} />}
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
  place,
  onError,
}: {
  note: Note
  today: DateStr
  withDone: boolean
  place?: Place | undefined
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

      {/* Порядок пунктов дня (Р-75). */}
      {place && (
        <div className="row row--wrap">
          <button type="button" className="btn" disabled={place.first} onClick={() => place.onMove(-1)}>
            ↑ Выше
          </button>
          <button type="button" className="btn" disabled={place.last} onClick={() => place.onMove(1)}>
            ↓ Ниже
          </button>
        </div>
      )}

      {isOpen && (
        <>
          <span className="plan__label">{MOVE_TITLE}</span>
          <MoveButtons note={note} today={today} onError={onError} />
        </>
      )}

      <div className="row row--wrap">
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
