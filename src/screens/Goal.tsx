import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { feedDateText } from '../shared/core/feed.ts'
import { db } from '../app/core.ts'
import type { Note, NoteKind } from '../app/model.ts'
import { notesLink } from '../modules/notes/feed.ts'
import { captureForGoal, entryDetail, findGoal, goalEntries, goalTitle, goalVision } from '../modules/notes/goal.ts'
import { goalProgress, groupByMonth, markDone, reopen, withText } from '../modules/notes/inbox.ts'
import { DONE_LABELS, doneLine, firstLine, KIND_NAMES, monthHeading, progressText, savedLine } from '../modules/notes/labels.ts'
import { useNotes } from '../modules/notes/useNotes.ts'
import { Fold } from '../shared/ui/Fold.tsx'
import { useScreenNames } from '../ui/useScreenNames.ts'
import { useToday } from '../shared/ui/useToday.ts'

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/** Кнопки «Добавить …» — дело и мысль; замысел к замыслу не относится (Р-31). */
const ADD_KINDS: readonly NoteKind[] = ['task', 'thought']

/**
 * Экран замысла `#/goal/<id>` (Р-103): сверху название и видение, ниже —
 * его дела и мысли по дням записи, свежие сверху. Отсюда же — новое дело
 * или мысль, сразу к замыслу.
 *
 * Список замыслов — по-прежнему блок на «Заметках»; вход сюда — «Открыть
 * замысел» в карточке и «замыслы без движения» обзора недели. Правка текста
 * и «Достигнут» — те же, что в карточке на «Заметках».
 */
export function Goal() {
  const { id = '' } = useParams()
  const read = useNotes()
  const names = useScreenNames()
  const today = useToday()
  const [adding, setAdding] = useState<NoteKind | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState('')
  /** Последнее «Достигнут» — его снимает «Отменить». */
  const [finished, setFinished] = useState<Note | null>(null)
  const [error, setError] = useState('')

  if (read.error) return <p className="error">Записи не прочитались: {read.error}</p>
  if (read.notes === null) return null

  const all = read.notes
  const goal = findGoal(id, all)
  if (goal === null) {
    return (
      <>
        <header className="screen-head">
          <h1>Замысел не найден</h1>
          <p className="muted">Его удалили или переделали в другой вид — либо адрес устарел.</p>
        </header>
        <p>
          <Link to="/inbox">К экрану «{names.inbox}»</Link>
        </p>
      </>
    )
  }

  const goalId = goal.id
  const vision = goalVision(goal)
  const entries = goalEntries(goalId, all)
  const meta = [progressText(goalProgress(goalId, all))]
  if (goal.status === 'done') meta.unshift(goal.doneOn ? `достигнут ${feedDateText(goal.doneOn)}` : 'достигнут')

  async function add() {
    if (adding === null) return
    const draft = captureForGoal(text, today, adding, goalId)
    if (!draft) return
    setBusy(true)
    setSaved('')
    setError('')
    try {
      await db.put('notes', draft)
      setText('')
      setSaved(savedLine(adding))
      setAdding(null)
    } catch (failure) {
      setError(describe(failure))
    } finally {
      setBusy(false)
    }
  }

  async function finish(note: Note) {
    setError('')
    try {
      setFinished(await db.put('notes', markDone(note, today)))
    } catch (failure) {
      setError(describe(failure))
    }
  }

  async function undo() {
    if (!finished) return
    setError('')
    try {
      await db.put('notes', reopen(finished))
      setFinished(null)
    } catch (failure) {
      setError(describe(failure))
    }
  }

  return (
    <>
      <header className="screen-head">
        <p className="muted">
          <Link to="/inbox">{names.inbox}</Link> · {KIND_NAMES.goal.toLowerCase()}
        </p>
        <h1 className="goal__title">{goalTitle(goal)}</h1>
        {vision && <p className="goal__vision">{vision}</p>}
        <p className="muted">{meta.join(' · ')}</p>
      </header>

      {/* Правка — та же, что в карточке на «Заметках»: текст кнопкой, «Достигнут». */}
      <Fold id="goal:edit" title="Править замысел" folded>
        <GoalEdit key={goal.id} goal={goal} onDone={(note) => void finish(note)} onError={setError} />
      </Fold>

      {finished && (
        <p className="added">
          <span>{doneLine('goal')}</span>
          <button type="button" className="link-btn" onClick={() => void undo()}>
            Отменить
          </button>
        </p>
      )}

      <section className="block">
        <h2>Дела и мысли</h2>

        {adding === null ? (
          <div className="row row--wrap">
            {ADD_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                className="btn"
                onClick={() => {
                  setAdding(kind)
                  setSaved('')
                }}
              >
                Добавить {KIND_NAMES[kind].toLowerCase()}
              </button>
            ))}
          </div>
        ) : (
          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault()
              void add()
            }}
          >
            <label className="field">
              <span>
                {KIND_NAMES[adding]} к замыслу
                {adding === 'task' ? ' — ляжет в неразобранное' : ''}
              </span>
              <textarea
                name="goal-entry"
                className="inbox__field"
                autoFocus
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </label>
            <div className="form__actions">
              <button type="submit" className="btn btn--primary" disabled={busy || !text.trim()}>
                Записать
              </button>
              <button type="button" className="btn" onClick={() => setAdding(null)}>
                Отмена
              </button>
            </div>
          </form>
        )}

        {saved && <p className="muted">{saved}</p>}
        {error && <p className="error">Не записалось: {error}</p>}

        {entries.length === 0 ? (
          <p className="stub">Пока ничего: добавьте дело или мысль.</p>
        ) : (
          groupByMonth(entries).map((group) => (
            <div key={group.month ?? 'без даты'} className="month-group">
              <h3 className="unit__name">
                {monthHeading(group.month)}
                <span className="muted"> · {group.notes.length}</span>
              </h3>
              <ul className="feed">
                {group.notes.map((note) => (
                  <GoalEntry key={note.id} note={note} />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </>
  )
}

/**
 * Строка ленты замысла. Неразобранное ведёт на «Заметки» к своей карточке
 * (Р-59); дело в плане и сделанное там не лежат — строка без перехода.
 */
function GoalEntry({ note }: { note: Note }) {
  const link = notesLink(note)
  const row = (
    <>
      <span className="feed__date">{feedDateText(note.capturedOn ?? '')}</span>
      <span className="feed__main">
        <span className="feed__title">{firstLine(note.text)}</span>
        <span className="feed__detail muted">{entryDetail(note)}</span>
      </span>
      {link && (
        <span className="feed__go muted" aria-hidden="true">
          ›
        </span>
      )}
    </>
  )
  return (
    <li>
      {link ? (
        <Link className="feed__row" to={link}>
          {row}
        </Link>
      ) : (
        <div className="feed__row">{row}</div>
      )}
    </li>
  )
}

/** Текст замысла и «Достигнут» — как в его карточке на «Заметках». */
function GoalEdit({ goal, onDone, onError }: { goal: Note; onDone: (note: Note) => void; onError: (message: string) => void }) {
  const [text, setText] = useState(goal.text)
  const edited = withText(goal, text)
  const done = DONE_LABELS.goal

  async function save(next: Note) {
    try {
      await db.put('notes', next)
    } catch (failure) {
      onError(describe(failure))
    }
  }

  return (
    <div className="form">
      <label className="field">
        <span>Текст: первая строка — название, дальше — видение</span>
        <textarea name="goal-text" rows={6} value={text} onChange={(event) => setText(event.target.value)} />
      </label>
      <div className="row row--wrap">
        {edited !== null && edited !== goal && (
          <button type="button" className="btn" onClick={() => void save(edited)}>
            Сохранить текст
          </button>
        )}
        {done && goal.status === 'open' && (
          <button type="button" className="btn" onClick={() => onDone(goal)}>
            {done}
          </button>
        )}
      </div>
    </div>
  )
}
