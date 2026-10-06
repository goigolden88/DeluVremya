import { useState } from 'react'
import { db } from '../../app/core.ts'
import { Fold } from '../../shared/ui/Fold.tsx'
import { useToday } from '../../shared/ui/useToday.ts'
import {
  ROUTINE_NOTE,
  ROUTINE_PROBLEMS,
  ROUTINE_SAME,
  ROUTINE_TITLE,
  routineSavedLine,
  routineSinceLine,
  routineSummary,
} from './labels.ts'
import { checkRoutine, dayWindow, routineOn, routineTimes, routineToSave, type SleepTimes } from './sleep.ts'
import { useSleep } from './useSleep.ts'

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/**
 * «Распорядок» в «Настройках» (Р-94): подъём и отбой — окно дня с
 * сегодняшнего дня; правка в тот же день — та же запись. Прошлые дни не
 * меняются: у них свой распорядок. В отличие от остальных настроек
 * распорядок — запись и уезжает с синхронизацией: он общий для устройств.
 * У свёрнутого — действующий сегодня распорядок.
 */
export function RoutineSection() {
  const sleep = useSleep()
  const today = useToday()
  /** Что введено в поля; null — поля показывают действующий распорядок. */
  const [draft, setDraft] = useState<SleepTimes | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const routine = routineOn(sleep.records, today)
  const value = draft ?? routineTimes(sleep.records, today)

  async function save() {
    setNote('')
    setError('')
    const problem = checkRoutine(value)
    if (problem) {
      setError(ROUTINE_PROBLEMS[problem])
      return
    }
    const record = routineToSave(value, sleep.records, today)
    try {
      if (record) await db.put('sleep', record)
      setDraft(null)
      setNote(record ? routineSavedLine(dayWindow([record], today)) : ROUTINE_SAME)
    } catch (failure) {
      setError(describe(failure))
    }
  }

  return (
    <Fold
      id="settings:routine"
      title={ROUTINE_TITLE}
      summary={sleep.status === 'ready' ? routineSummary(routine) : undefined}
      folded
    >
      {sleep.status === 'failed' && <p className="error">Распорядок не прочитался: {sleep.error}</p>}
      {sleep.status === 'ready' && (
        <form
          className="form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <div className="row row--wrap">
            <label className="field">
              <span>Подъём</span>
              <input
                type="time"
                name="routine-wake"
                value={value.wake}
                onChange={(event) => setDraft({ ...value, wake: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Отбой</span>
              <input
                type="time"
                name="routine-bed"
                value={value.bed}
                onChange={(event) => setDraft({ ...value, bed: event.target.value })}
              />
            </label>
          </div>
          <p className="muted">{routineSinceLine(routine)}</p>
          <p className="muted">{ROUTINE_NOTE}</p>
          {note && <p className="muted">{note}</p>}
          {error && <p className="error">{error}</p>}
          <div className="form__actions">
            <button type="submit" className="btn btn--primary">
              Сохранить
            </button>
          </div>
        </form>
      )}
    </Fold>
  )
}
