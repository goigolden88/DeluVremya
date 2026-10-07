import { useState } from 'react'
import { db } from '../../app/core.ts'
import type { Sleep } from '../../app/model.ts'
import type { DateStr } from '../../shared/core/dates.ts'
import { daySleepLine, MARK_PROBLEMS, MARK_USUAL } from './labels.ts'
import { checkMark, daySleep, markChange, usualChange, type MarkChange } from './sleep.ts'

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/**
 * Подъём и отбой показанного дня рядом с итогом (Р-96): «Подъём 7:40 · отбой
 * 0:30». Без отметки — серым, с припиской, откуда время. Тап раскрывает
 * правку: «Сохранить» пишет отметку дня, «Как обычно» её снимает. Окно дня
 * и «неучтено» пересчитываются сами — `useSleep` перечитывает записи.
 *
 * Будущий день не отмечается: строка есть, кнопки нет.
 */
export function DaySleep({ records, day, today }: { records: Sleep[]; day: DateStr; today: DateStr }) {
  const [open, setOpen] = useState(false)
  const entry = daySleep(records, day)
  const line = daySleepLine(entry)
  const className = entry.source === 'mark' ? 'day-sleep' : 'day-sleep day-sleep--usual'

  if (day > today) return <p className={`${className} muted`}>{line}</p>

  return (
    <div className={className}>
      <button type="button" className="plain-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        {line}
      </button>
      {/* Ключ — время дня: приехала запись с другого устройства — форма встаёт заново. */}
      {open && (
        <MarkForm
          key={`${entry.wake} ${entry.bed}`}
          records={records}
          day={day}
          today={today}
          initial={entry}
          onDone={() => setOpen(false)}
        />
      )}
    </div>
  )
}

function MarkForm({
  records,
  day,
  today,
  initial,
  onDone,
}: {
  records: Sleep[]
  day: DateStr
  today: DateStr
  initial: Pick<Sleep, 'wake' | 'bed'>
  onDone: () => void
}) {
  const [draft, setDraft] = useState({ wake: initial.wake, bed: initial.bed })
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)

  async function apply(change: MarkChange) {
    setBusy(true)
    setProblem('')
    try {
      if (change.kind === 'put') await db.put('sleep', change.record)
      if (change.kind === 'remove') await db.remove('sleep', change.id)
      onDone()
    } catch (failure) {
      setProblem(`Не записалось: ${describe(failure)}`)
    } finally {
      setBusy(false)
    }
  }

  function save() {
    const found = checkMark(draft, day, today)
    if (found) {
      setProblem(MARK_PROBLEMS[found])
      return
    }
    void apply(markChange(records, draft, day))
  }

  // noValidate: время проверяет `checkMark` и называет причину по-русски.
  return (
    <form
      className="form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <div className="row row--wrap">
        <label className="field">
          <span>Подъём</span>
          <input
            name="mark-wake"
            type="time"
            value={draft.wake}
            onChange={(event) => setDraft({ ...draft, wake: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Отбой</span>
          <input
            name="mark-bed"
            type="time"
            value={draft.bed}
            onChange={(event) => setDraft({ ...draft, bed: event.target.value })}
          />
        </label>
      </div>
      <p className="muted">
        Только этот день: от его подъёма и отбоя считается неучтённое. Распорядок в «Настройках» не меняется.
      </p>
      {problem && <p className="error">{problem}</p>}
      <div className="form__actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          Сохранить
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void apply(usualChange(records, day))}>
          {MARK_USUAL}
        </button>
      </div>
    </form>
  )
}
