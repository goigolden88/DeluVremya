import { useState } from 'react'
import { db } from '../../core/db.ts'
import type { Note } from '../../core/model.ts'
import { goalOf, goalProgress, linksOf, NOTE_KINDS, tasksOfGoal, withGoal, withKind, withText } from './inbox.ts'
import { ageText, deleteConfirm, DONE_LABELS, firstLine, goalLine, KIND_NAMES, progressText } from './labels.ts'

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

type Props = {
  note: Note
  /** Все живые заметки: замысел дела и дела замысла берутся отсюда. */
  notes: readonly Note[]
  /** Замыслы в работе — выбор в карточке дела (Р-31). */
  goals: readonly Note[]
  today: string
  open: boolean
  onToggle: () => void
  /** «Сделано» или «Достигнут»: отклик с «Отменить» — у экрана. */
  onDone: (note: Note) => void
  onError: (message: string) => void
}

/**
 * Строка записи: текст, вид и возраст серым. Тап раскрывает карточку
 * на месте (Р-30), а не уводит на другой экран.
 */
export function NoteItem({ note, notes, goals, today, open, onToggle, onDone, onError }: Props) {
  const goal = note.kind === 'task' ? goalOf(note, notes) : null
  const meta = [KIND_NAMES[note.kind].toLowerCase(), ageText(note, today)]
  if (goal) meta.push(goalLine(goal))
  if (note.kind === 'goal') meta.push(progressText(goalProgress(note.id, notes)))

  return (
    <li className="note">
      <button type="button" className="plain-btn note__main" aria-expanded={open} onClick={onToggle}>
        <span className="note__text">{note.text}</span>
      </button>
      <span className="muted note__meta">{meta.join(' · ')}</span>
      {open && <NoteCard note={note} notes={notes} goals={goals} onDone={onDone} onError={onError} />}
    </li>
  )
}

/**
 * Карточка записи (Р-30): ссылки, вид, текст, замысел у дела, дела у замысла,
 * «Сделано» и «Удалить». Вид и замысел пишутся тапом сразу, текст — кнопкой.
 */
function NoteCard({
  note,
  notes,
  goals,
  onDone,
  onError,
}: Pick<Props, 'note' | 'notes' | 'goals' | 'onDone' | 'onError'>) {
  const [text, setText] = useState(note.text)
  const edited = withText(note, text)
  const goal = note.kind === 'task' ? goalOf(note, notes) : null
  // Достигнутый замысел в выборе не стоит, но у своего дела остаётся виден.
  const choices = goal && !goals.some((each) => each.id === goal.id) ? [goal, ...goals] : goals
  const links = linksOf(note.text)
  const done = DONE_LABELS[note.kind]

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

  return (
    <div className="form note__card">
      {links.length > 0 && (
        <ul className="plain note__links">
          {links.map((link) => (
            <li key={link}>
              <a href={link} target="_blank" rel="noreferrer">
                {link}
              </a>
            </li>
          ))}
        </ul>
      )}

      <div className="chips" role="group" aria-label="Вид записи">
        {NOTE_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            className={kind === note.kind ? 'chip chip--on' : 'chip'}
            aria-pressed={kind === note.kind}
            onClick={() => void save(withKind(note, kind))}
          >
            {KIND_NAMES[kind]}
          </button>
        ))}
      </div>

      <label className="field">
        <span>Текст</span>
        <textarea name="note-text" rows={3} value={text} onChange={(event) => setText(event.target.value)} />
      </label>
      {edited !== null && edited !== note && (
        <div className="form__actions">
          <button type="button" className="btn" onClick={() => void save(edited)}>
            Сохранить текст
          </button>
        </div>
      )}

      {note.kind === 'task' && choices.length > 0 && (
        <label className="field">
          <span>Замысел</span>
          <select
            name="note-goal"
            value={goal?.id ?? ''}
            onChange={(event) => void save(withGoal(note, event.target.value || null))}
          >
            <option value="">— ни к какому —</option>
            {choices.map((each) => (
              <option key={each.id} value={each.id}>
                {firstLine(each.text)}
              </option>
            ))}
          </select>
        </label>
      )}

      {note.kind === 'goal' && <GoalTasks goal={note} notes={notes} />}

      <div className="row row--wrap">
        {done && (
          <button type="button" className="btn" onClick={() => onDone(note)}>
            {done}
          </button>
        )}
        <button type="button" className="btn btn--danger" onClick={() => void remove()}>
          Удалить
        </button>
      </div>
    </div>
  )
}

/** Дела замысла: сделанные — с галочкой. Относятся к замыслу в карточке дела. */
function GoalTasks({ goal, notes }: { goal: Note; notes: readonly Note[] }) {
  const tasks = tasksOfGoal(goal.id, notes)
  if (tasks.length === 0) {
    return <p className="muted">Дел пока нет — дело относится к замыслу в своей карточке.</p>
  }
  return (
    <ul className="plain">
      {tasks.map((task) => (
        <li key={task.id} className="muted">
          {task.status === 'done' ? '✓ ' : '· '}
          {firstLine(task.text)}
        </li>
      ))}
    </ul>
  )
}
