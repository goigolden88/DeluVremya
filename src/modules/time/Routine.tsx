import { useState } from 'react'
import { db } from '../../app/core.ts'
import type { Sleep } from '../../app/model.ts'
import type { DateStr } from '../../shared/core/dates.ts'
import { Fold } from '../../shared/ui/Fold.tsx'
import { NO_ROUTINE, ROUTINE_PROBLEMS, routineLine, routineSavedLine, windowText } from './labels.ts'
import { checkRoutine, dayWindow, nextRoutine, routineDraft, routineFrom, routineOn } from './sleep.ts'
import { useSleep } from './useSleep.ts'

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/**
 * «Распорядок» в «Настройках» (Р-94): подъём и отбой — окно дня учёта.
 * Сохранение — распорядок с выбранного дня, сегодня или прошлого (Р-99);
 * тот же день — та же запись.
 * У свёрнутого — распорядок на сегодня или что действует окно по умолчанию.
 */
export function RoutineSettings({ today }: { today: DateStr }) {
  const data = useSleep()
  const routine = data.status === 'ready' ? routineOn(data.records, today) : null
  const summary =
    data.status !== 'ready' ? undefined : routine ? routineLine(routine) : NO_ROUTINE

  return (
    <Fold id="settings:routine" title="Распорядок" summary={summary} folded>
      {data.status === 'failed' && <p className="error">Распорядок не прочитался: {data.error}</p>}
      {/* Ключ — день: после полуночи форма встаёт заново, уже на новый день. */}
      {data.status === 'ready' && <RoutineForm key={today} today={today} records={data.records} />}
    </Fold>
  )
}

function RoutineForm({ today, records }: { today: DateStr; records: Sleep[] }) {
  const [draft, setDraft] = useState(() => routineDraft(records, today))
  // Смена дня не подставляет в форму время того дня: форма держит введённое (Р-99).
  const [since, setSince] = useState(today)
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    const found = checkRoutine(draft, since, today)
    if (found) {
      setProblem(ROUTINE_PROBLEMS[found])
      return
    }
    const next = nextRoutine(records, since)?.since ?? null
    setBusy(true)
    setProblem('')
    setNote('')
    try {
      const saved = await db.put('sleep', routineFrom(draft, since))
      setNote(routineSavedLine(since, dayWindow([saved], since), next))
    } catch (failure) {
      setProblem(`Не записалось: ${describe(failure)}`)
    } finally {
      setBusy(false)
    }
  }

  // noValidate: время проверяет `checkSleep` и называет причину по-русски.
  return (
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
            name="routine-wake"
            type="time"
            value={draft.wake}
            onChange={(event) => setDraft({ ...draft, wake: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Отбой</span>
          <input
            name="routine-bed"
            type="time"
            value={draft.bed}
            onChange={(event) => setDraft({ ...draft, bed: event.target.value })}
          />
        </label>
        <label className="field">
          <span>С какого дня</span>
          <input
            name="routine-since"
            type="date"
            max={today}
            value={since}
            onChange={(event) => setSince(event.target.value)}
          />
        </label>
      </div>
      <p className="muted">
        Окно дня — с подъёма до отбоя: от него считаются неучтённое и остаток дня в плане. Отбой раньше
        подъёма по часам — после полуночи. Сегодня окно {windowText(dayWindow(records, today))}.
      </p>
      <p className="muted">
        Распорядок действует с выбранного дня до следующего распорядка, если тот есть; дни раньше остаются со
        своим, отметки дней важнее. С прошлого дня пересчитаются «неучтено» прошлых дней, доли «от всего» и
        сон за ночь. Распорядок общий для всех устройств — уезжает с синхронизацией.
      </p>
      {problem && <p className="error">{problem}</p>}
      {note && <p className="muted">{note}</p>}
      <div className="form__actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          Сохранить
        </button>
      </div>
    </form>
  )
}
