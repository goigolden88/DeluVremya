import { useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../app/core.ts'
import type { SpecialDays } from '../../app/model.ts'
import type { DateStr } from '../../shared/core/dates.ts'
import {
  checkSpecial,
  datesText,
  draftOf,
  specialFromDraft,
  specialOn,
  specialProblemText,
  specialTitle,
  type SpecialDraft,
} from './specials.ts'
import { useSpecials } from './useSpecials.ts'

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/** Название и даты периода — одинаково на «Учёте» и на «Сегодня». */
function PlateText({ special }: { special: SpecialDays }) {
  return (
    <>
      <span className="special__title">{specialTitle(special)}</span>
      <span className="special__dates">{datesText(special)}</span>
    </>
  )
}

/**
 * Особые дни на «Учёте» (Р-91): у показанного дня — кнопка «Особый день»
 * и форма; в дни периода — плашка, тап по ней — правка и удаление.
 */
export function SpecialDay({ day }: { day: DateStr }) {
  const data = useSpecials()
  const [open, setOpen] = useState(false)
  /** Что сделала форма — строкой: период мог и не задеть показанный день. */
  const [done, setDone] = useState('')
  /** Убранный период, каким был до «Убрать», — его возвращает «Отменить» (Р-109). */
  const [removed, setRemoved] = useState<SpecialDays | null>(null)
  const [error, setError] = useState('')

  if (data.status === 'failed') return <p className="error">Особые дни не прочитались: {data.error}</p>
  if (data.status !== 'ready') return null

  const special = specialOn(data.specials, day)
  const close = (line: string, gone: SpecialDays | null = null) => {
    setOpen(false)
    setDone(line)
    setRemoved(gone)
    setError('')
  }
  const reset = () => {
    setDone('')
    setRemoved(null)
    setError('')
  }
  // Пишется тот же объект, без `deleted`; `put` даёт новый `updatedAt`,
  // и надгробие с другого устройства возврат не перебьёт.
  const undo = async (back: SpecialDays) => {
    setError('')
    try {
      await db.put('specials', back)
      setDone('')
      setRemoved(null)
    } catch (failure) {
      setError(`Не записалось: ${describe(failure)}`)
    }
  }
  // Период вернулся другим путём — синхронизацией — отменять нечего.
  const undoable = removed !== null && !data.specials.some((each) => each.id === removed.id)

  return (
    <section className="block special-day">
      {special ? (
        <button
          type="button"
          className="special"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open)
            reset()
          }}
        >
          <PlateText special={special} />
        </button>
      ) : (
        !open && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setOpen(true)
              reset()
            }}
          >
            Особый день
          </button>
        )
      )}
      {open && (
        <SpecialForm
          day={day}
          existing={special ?? undefined}
          specials={data.specials}
          onDone={close}
        />
      )}
      {done && (
        <p className="muted added">
          <span>{done}</span>
          {removed && undoable && (
            <button type="button" className="link-btn" onClick={() => void undo(removed)}>
              Отменить
            </button>
          )}
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  )
}

/**
 * Плашка на «Сегодня» (Р-91) — только если сегодня особый день. Отметки
 * здесь нет: отмечают редко. Тап ведёт на «Учёт», где период правится.
 */
export function SpecialToday({ day }: { day: DateStr }) {
  const data = useSpecials()
  if (data.status !== 'ready') return null
  const special = specialOn(data.specials, day)
  if (!special) return null
  return (
    <Link className="special block" to="/time">
      <PlateText special={special} />
    </Link>
  )
}

/**
 * Форма периода: «с», «по», название. Новый — с показанного дня по него же.
 * Пересечение и «по» раньше «с» не сохраняются — причина словами (Р-91).
 *
 * `onDone` — строка о сделанном; пустая — отменено. После «Убрать» вторым
 * — период, каким был до удаления: его вернёт «Отменить» (Р-109).
 */
function SpecialForm({
  day,
  existing,
  specials,
  onDone,
}: {
  day: DateStr
  existing?: SpecialDays
  specials: SpecialDays[]
  onDone: (line: string, removed?: SpecialDays) => void
}) {
  const [draft, setDraft] = useState<SpecialDraft>(() => draftOf(day, existing))
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<SpecialDraft>) => setDraft((current) => ({ ...current, ...patch }))

  async function run(action: () => Promise<string>, removed?: SpecialDays) {
    setBusy(true)
    setProblem('')
    try {
      onDone(await action(), removed)
    } catch (failure) {
      setProblem(`Не записалось: ${describe(failure)}`)
    } finally {
      setBusy(false)
    }
  }

  function save() {
    const found = checkSpecial({ ...draft, id: existing?.id }, specials)
    if (found) {
      setProblem(specialProblemText(found))
      return
    }
    void run(async () => {
      const saved = await db.put('specials', specialFromDraft(draft, existing))
      return `${existing ? 'Сохранено' : 'Отмечено'}: «${specialTitle(saved)}», ${datesText(saved)}.`
    })
  }

  // noValidate: даты проверяет `checkSpecial` и называет причину по-русски.
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
        <label className="field special-form__date">
          <span>С</span>
          <input name="special-from" type="date" value={draft.from} onChange={(event) => set({ from: event.target.value })} />
        </label>
        <label className="field special-form__date">
          <span>По</span>
          <input name="special-to" type="date" value={draft.to} onChange={(event) => set({ to: event.target.value })} />
        </label>
      </div>

      <label className="field">
        <span>Название — необязательно</span>
        <input
          name="special-title"
          type="text"
          placeholder="Поездка, поход"
          value={draft.title}
          onChange={(event) => set({ title: event.target.value })}
        />
      </label>

      {problem && <p className="error">{problem}</p>}

      <div className="form__actions">
        {existing && (
          <button
            type="button"
            className="btn btn--danger"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await db.remove('specials', existing.id)
                return `Убрано: «${specialTitle(existing)}», ${datesText(existing)}.`
              }, existing)
            }
          >
            Убрать
          </button>
        )}
        <button type="button" className="btn" disabled={busy} onClick={() => onDone('')}>
          Отмена
        </button>
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {existing ? 'Сохранить' : 'Отметить'}
        </button>
      </div>
    </form>
  )
}
