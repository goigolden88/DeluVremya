import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { addDays, type DateStr } from '../core/dates.ts'
import { db } from '../core/db.ts'
import type { Note, NoteKind } from '../core/model.ts'
import {
  captureNote,
  DEFAULT_KIND,
  goalOf,
  goalsOf,
  groupByMonth,
  inboxOf,
  kindCounts,
  markDone,
  matchesQuery,
  NOTE_KINDS,
  queryWords,
  reopen,
} from '../modules/notes/inbox.ts'
import {
  ageText,
  doneLine,
  KIND_NAMES,
  KIND_PLURALS,
  monthHeading,
  plannedCountText,
  plannedLine,
  savedLine,
  shortText,
  shownText,
  SOMEDAY_TITLE,
  UNSORTED_TITLE,
} from '../modules/notes/labels.ts'
import { noteAnchor, NoteItem } from '../modules/notes/NoteItem.tsx'
import { plannedCount, withPlan } from '../modules/notes/plan.ts'
import { fromSomeday, somedayOf } from '../modules/notes/review.ts'
import { useNotes } from '../modules/notes/useNotes.ts'
import { Fold } from '../ui/Fold.tsx'
import { monthFoldedByDefault } from '../ui/monthFold.ts'
import { useScreenNames } from '../ui/useScreenNames.ts'
import { useToday } from '../ui/useToday.ts'

/** Чипы отбора неразобранного: замыслы живут своим блоком (Р-31). */
const UNSORTED_KINDS = NOTE_KINDS.filter((kind) => kind !== 'goal')

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/**
 * Заметки (Р-32) — адрес `/inbox`: одна точка захвата всего, что пришло
 * в голову или прилетело ссылкой, — замена «Избранному» Телеграма.
 * Здесь лежит неразобранное: дела отсюда уходят в план дня, мысли —
 * в обзор недели. Замыслы — своим блоком (Р-31).
 *
 * Сюда же приходит то, чем поделились: `launch.ts` кладёт текст
 * в `?shared=` (Р-16). Поле подставляется, но записывается только по кнопке:
 * расшаренное можно поправить или дописать мыслью.
 */
export function Inbox() {
  const [params, setParams] = useSearchParams()
  const shared = params.get('shared') ?? ''
  const field = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState(shared)
  const [kind, setKind] = useState<NoteKind>(DEFAULT_KIND)
  /** В план при записи (Р-73): день или null — во входящие. */
  const [when, setWhen] = useState<DateStr | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [only, setOnly] = useState<NoteKind | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  /** Последнее «Сделано» — его снимает «Отменить». */
  const [finished, setFinished] = useState<Note | null>(null)
  /** Последнее «В план» — его тоже снимает «Отменить». */
  const [planned, setPlanned] = useState<Note | null>(null)
  const read = useNotes()
  const names = useScreenNames()
  const today = useToday()

  // Второе «Поделиться», пока экран открыт, приходит новым адресом.
  useEffect(() => {
    if (shared) setText(shared)
  }, [shared])

  // Ярлык «Записать» (`?go=inbox` → `?write=1`): курсор сразу в поле.
  // Параметр снимается, чтобы «назад» и перезагрузка его не повторяли.
  // Откроется ли клавиатура сама — решает телефон.
  const write = params.has('write')
  useEffect(() => {
    if (!write) return
    field.current?.focus()
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('write')
        return next
      },
      { replace: true },
    )
  }, [write, setParams])

  // Из ленты (Р-59): `?open=<id>` раскрывает карточку записи. Параметр
  // снимается, как `write`; к строке экран прокручивает, когда записи прочтены.
  const opened = params.get('open')
  const [scrollTo, setScrollTo] = useState<string | null>(null)
  useEffect(() => {
    if (!opened) return
    setOpenId(opened)
    setScrollTo(opened)
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('open')
        return next
      },
      { replace: true },
    )
  }, [opened, setParams])

  const loaded = read.notes !== null
  useEffect(() => {
    if (scrollTo === null || !loaded) return
    const target = scrollTo
    setScrollTo(null)
    // Свёрнутый месяц или «Замыслы» раскрываются своим эффектом (Р-78) —
    // прокрутка двумя кадрами позже, когда карточка уже нарисована.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => document.getElementById(noteAnchor(target))?.scrollIntoView({ block: 'center' })),
    )
  }, [scrollTo, loaded])

  async function save() {
    const draft = captureNote(text, today, kind, when)
    if (!draft) return
    setBusy(true)
    setSaved('')
    setError('')
    try {
      const stored = await db.put('notes', draft)
      setText('')
      setSaved(savedLine(kind))
      // Поставленное в план — с «Отменить», как «В план» из карточки.
      setPlanned(stored.plannedFor !== null ? stored : null)
      setFinished(null)
      setWhen(null)
      // Вид — на каждую запись свой: выбранная раз «Мысль» не должна
      // молча лечь и на следующую (Р-13).
      setKind(DEFAULT_KIND)
      // Иначе перезагрузка подставила бы уже записанное второй раз.
      if (shared) setParams({}, { replace: true })
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
      setPlanned(null)
      setOpenId(null)
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

  // Дело уходит из неразобранного в план дня (Р-37) — отклик с «Отменить».
  async function plan(note: Note, day: DateStr) {
    setError('')
    try {
      setPlanned(await db.put('notes', withPlan(note, day)))
      setFinished(null)
      setOpenId(null)
    } catch (failure) {
      setError(describe(failure))
    }
  }

  async function unplan() {
    if (!planned) return
    setError('')
    try {
      await db.put('notes', withPlan(planned, null))
      setPlanned(null)
    } catch (failure) {
      setError(describe(failure))
    }
  }

  // «Когда-нибудь» — обратно в неразобранное (Р-46).
  async function back(note: Note) {
    setError('')
    try {
      await db.put('notes', fromSomeday(note))
    } catch (failure) {
      setError(describe(failure))
    }
  }

  const all = read.notes ?? []
  const someday = somedayOf(all)
  const words = queryWords(query)
  const goals = goalsOf(all)
  const shownGoals = goals.filter((goal) => matchesQuery(goal, words))
  const unsorted = inboxOf(all)
  const counts = kindCounts(unsorted)
  const waiting = plannedCount(all)
  // У дела ищется и название его замысла: «испанский» находит его дела.
  const shown = unsorted.filter(
    (note) => (only === null || note.kind === only) && matchesQuery(note, words, goalOf(note, all)?.text),
  )
  // Поиск и отбор раскрывают все месяцы: найденное не прячется (Р-78).
  const filtering = words.length > 0 || only !== null

  const item = (note: Note) => (
    <NoteItem
      key={note.id}
      note={note}
      notes={all}
      goals={goals}
      today={today}
      open={openId === note.id}
      onToggle={() => setOpenId(openId === note.id ? null : note.id)}
      onDone={(done) => void finish(done)}
      onPlan={(each, day) => void plan(each, day)}
      onError={setError}
    />
  )

  return (
    <>
      <header className="screen-head">
        <h1>{names.inbox}</h1>
        <p className="muted">Мысль, дело или замысел — одной строкой. Разбор потом.</p>
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
            ref={field}
            name="text"
            className="inbox__field"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        {/* Вид — не обязателен: не тронул — дело (Р-13). */}
        <div className="chips" role="group" aria-label="Вид записи">
          {NOTE_KINDS.map((each) => (
            <button
              key={each}
              type="button"
              className={each === kind ? 'chip chip--on' : 'chip'}
              aria-pressed={each === kind}
              onClick={() => {
                setKind(each)
                if (each !== 'task') setWhen(null)
              }}
            >
              {KIND_NAMES[each]}
            </button>
          ))}
        </div>
        {/* В план сразу — только дело и только по желанию: не выбрал — во входящие (Р-73). */}
        {kind === 'task' && (
          <div className="chips" role="group" aria-label="В план при записи">
            {[
              { day: today, label: 'На сегодня' },
              { day: addDays(today, 1), label: 'На завтра' },
            ].map((each) => (
              <button
                key={each.label}
                type="button"
                className={when === each.day ? 'chip chip--on' : 'chip'}
                aria-pressed={when === each.day}
                onClick={() => setWhen(when === each.day ? null : each.day)}
              >
                {each.label}
              </button>
            ))}
          </div>
        )}
        <div className="form__actions">
          <button type="submit" className="btn btn--primary" disabled={busy || !text.trim()}>
            Записать
          </button>
        </div>
      </form>

      {saved && <p className="muted">{saved}</p>}
      {finished && (
        <p className="added">
          <span>{doneLine(finished.kind)}</span>
          <button type="button" className="link-btn" onClick={() => void undo()}>
            Отменить
          </button>
        </p>
      )}
      {planned && (
        <p className="added">
          <span>{plannedLine(planned.plannedFor ?? today, today)}</span>
          <button type="button" className="link-btn" onClick={() => void unplan()}>
            Отменить
          </button>
        </p>
      )}
      {error && <p className="error">Не записалось: {error}</p>}
      {read.error && <p className="error">Записи не прочитались: {read.error}</p>}

      {read.notes !== null && (
        <>
          {all.length > 0 && (
            <input
              type="search"
              name="search"
              className="search"
              value={query}
              placeholder="Поиск: слова в любом порядке, «март», 12.03.2026"
              onChange={(event) => setQuery(event.target.value)}
            />
          )}

          {goals.length > 0 && (
            <Fold
              id="notes:goals"
              title={KIND_PLURALS.goal}
              summary={words.length > 0 ? `${shownGoals.length} из ${goals.length}` : goals.length}
              reveal={goals.some((goal) => goal.id === openId)}
            >
              {shownGoals.length === 0 ? (
                <p className="muted">Под поиск ни один замысел не подошёл.</p>
              ) : (
                <ul className="plain">{shownGoals.map(item)}</ul>
              )}
            </Fold>
          )}

          <section className="block">
            <h2>{UNSORTED_TITLE}</h2>
            {unsorted.length === 0 ? (
              <p className="stub">Неразобранного нет.</p>
            ) : (
              <>
                <div className="chips" role="group" aria-label="Отбор по виду">
                  <button
                    type="button"
                    className={only === null ? 'chip chip--on' : 'chip'}
                    aria-pressed={only === null}
                    onClick={() => setOnly(null)}
                  >
                    Все {unsorted.length}
                  </button>
                  {UNSORTED_KINDS.map((each) => (
                    <button
                      key={each}
                      type="button"
                      className={only === each ? 'chip chip--on' : 'chip'}
                      aria-pressed={only === each}
                      onClick={() => setOnly(only === each ? null : each)}
                    >
                      {KIND_PLURALS[each]} {counts[each]}
                    </button>
                  ))}
                </div>
                <p className="muted">{shownText(shown.length, unsorted.length)}</p>
                {shown.length === 0 ? (
                  <p className="muted">Под поиск и отбор ничего не подошло.</p>
                ) : (
                  groupByMonth(shown).map((group, index) => (
                    <div key={group.month ?? 'без даты'} className="month-group">
                      {filtering ? (
                        <>
                          <h3 className="unit__name">{monthHeading(group.month)}</h3>
                          <ul className="plain">{group.notes.map(item)}</ul>
                        </>
                      ) : (
                        // Месяц — сворачиваемым блоком (Р-78, Р-82); запись из ленты его раскрывает.
                        <Fold
                          id={`inbox:month:${group.month ?? 'undated'}`}
                          title={monthHeading(group.month)}
                          summary={group.notes.length}
                          folded={monthFoldedByDefault(index, unsorted.length)}
                          reveal={group.notes.some((note) => note.id === openId)}
                          sub
                        >
                          <ul className="plain">{group.notes.map(item)}</ul>
                        </Fold>
                      )}
                    </div>
                  ))
                )}
              </>
            )}
            {/* Поставленное в план отсюда ушло — не молча: числом и где искать. */}
            {waiting > 0 && (
              <p className="muted">
                <Link to="/">{plannedCountText(waiting, names.today)}</Link>
              </p>
            )}
          </section>

          {/* Отложенное из разбора висяков: без блока «когда-нибудь» значило бы «пропало» (Р-46). */}
          {someday.length > 0 && (
            <Fold id="notes:someday" title={SOMEDAY_TITLE} summary={someday.length} folded>
              <ul className="plain">
                {someday.map((note) => (
                  <li key={note.id} className="plan-item">
                    <div className="plan-item__row">
                      <span className="plan-item__text">{note.text}</span>
                      <span className="muted plan-item__est">{ageText(note, today)}</span>
                      <button
                        type="button"
                        className="link-btn"
                        aria-label={`Вернуть в неразобранное: ${shortText(note.text)}`}
                        onClick={() => void back(note)}
                      >
                        Вернуть
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </Fold>
          )}
        </>
      )}
    </>
  )
}
