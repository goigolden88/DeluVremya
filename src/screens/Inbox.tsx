import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { db } from '../core/db.ts'
import { formatDateLoose, plural, today } from '../core/dates.ts'
import type { Note } from '../core/model.ts'
import { captureNote } from '../modules/notes/inbox.ts'
import { useInbox } from '../modules/notes/useInbox.ts'
import { useScreenNames } from '../ui/useScreenNames.ts'

/**
 * Входящие — минимальный захват Этапа 0: одно поле, «Записать» и что уже
 * лежит. Полноценный экран — вид записи, поиск, возраст — Этап 3.
 *
 * Сюда же приходит то, чем поделились: `launch.ts` кладёт текст
 * в `?shared=` (Р-16). Поле подставляется, но записывается только по кнопке:
 * расшаренное можно поправить или дописать мыслью.
 */
export function Inbox() {
  const [params, setParams] = useSearchParams()
  const shared = params.get('shared') ?? ''
  const [text, setText] = useState(shared)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')
  const [error, setError] = useState('')
  const inbox = useInbox()
  const names = useScreenNames()

  // Второе «Поделиться», пока экран открыт, приходит новым адресом.
  useEffect(() => {
    if (shared) setText(shared)
  }, [shared])

  async function save() {
    const draft = captureNote(text, today())
    if (!draft) return
    setBusy(true)
    setDone('')
    setError('')
    try {
      await db.put('notes', draft)
      setText('')
      setDone('Записано во входящие')
      // Иначе перезагрузка подставила бы уже записанное второй раз.
      if (shared) setParams({}, { replace: true })
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Неизвестная ошибка')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <header className="screen-head">
        <h1>{names.inbox}</h1>
        <p className="muted">Мысль или дело — одной строкой. Разбор потом.</p>
      </header>

      <form
        className="form block"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <label className="field">
          <span>{shared ? 'Пришло через «Поделиться»' : 'Что записать'}</span>
          <textarea
            name="text"
            className="inbox__field"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <div className="form__actions">
          <button type="submit" className="btn btn--primary" disabled={busy || !text.trim()}>
            Записать
          </button>
        </div>
      </form>

      {done && <p className="muted">{done}</p>}
      {error && <p className="error">Не записалось: {error}</p>}
      {inbox.error && <p className="error">Входящие не прочитались: {inbox.error}</p>}

      <InboxList notes={inbox.notes} />
    </>
  )
}

function InboxList({ notes }: { notes: Note[] | null }) {
  if (notes === null) return null
  if (notes.length === 0) return <p className="stub">Во входящих пусто.</p>

  return (
    <section className="block">
      <h2>
        Во входящих · {notes.length} {plural(notes.length, ['запись', 'записи', 'записей'])}
      </h2>
      <ul className="plain">
        {notes.map((note) => (
          <li key={note.id} className="inbox__item">
            <span className="inbox__text">{note.text}</span>
            <span className="muted">{note.capturedOn === null ? 'без даты' : formatDateLoose(note.capturedOn)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
