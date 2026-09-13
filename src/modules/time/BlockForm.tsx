import { useState } from 'react'
import { db } from '../../core/db.ts'
import type { DateStr } from '../../core/dates.ts'
import type { Category, Preset, TimeBlock } from '../../core/model.ts'
import { activeCategories, MINUTES_PER_DAY, presetsOf } from './categories.ts'
import { BLOCK_PROBLEMS } from './labels.ts'
import { blockFromDraft, blockProblem, DEFAULT_MINUTES, medianMinutes, quickDates } from './retro.ts'

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/**
 * Блок задним числом — или правка записанного, той же формой.
 *
 * Минуты подставляются медианой своей истории категории, а без истории —
 * самой короткой кнопкой категории (01-Проект, модуль 3). У даты — кнопки
 * «сегодня» и «вчера» (Р-19).
 *
 * `onDone` — записано (блок) или отменено (null).
 */
export function BlockForm({
  categories,
  presets,
  blocks,
  today,
  defaultDate,
  existing,
  onDone,
}: {
  categories: Category[]
  presets: Preset[]
  blocks: TimeBlock[]
  /** Настоящее сегодня: позже него день не ставится. */
  today: DateStr
  /** День нового блока по умолчанию — показанный на экране (Р-25). */
  defaultDate?: DateStr
  existing?: TimeBlock
  onDone: (saved: TimeBlock | null) => void
}) {
  // Архивная категория правимого блока остаётся в выборе: иначе форма
  // молча переписала бы его на первую попавшуюся.
  const active = activeCategories(categories)
  const own = existing && !active.some((each) => each.id === existing.categoryId)
    ? categories.filter((each) => each.id === existing.categoryId)
    : []
  const choices = [...active, ...own]

  const suggest = (categoryId: string) =>
    medianMinutes(blocks, categoryId, presetsOf(presets, categoryId)[0]?.minutes ?? DEFAULT_MINUTES)

  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? choices[0]?.id ?? '')
  const [minutes, setMinutes] = useState(String(existing?.minutes ?? (categoryId ? suggest(categoryId) : DEFAULT_MINUTES)))
  const [date, setDate] = useState(existing?.date ?? defaultDate ?? today)
  const [background, setBackground] = useState(existing?.bgCategoryId ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)

  // Фоном — любая другая рабочая категория; архивная фоновая правимого
  // блока остаётся в выборе по той же причине, что и основная.
  const ownBackground =
    existing?.bgCategoryId && !active.some((each) => each.id === existing.bgCategoryId)
      ? categories.filter((each) => each.id === existing.bgCategoryId)
      : []
  const backgrounds = [...active, ...ownBackground].filter((each) => each.id !== categoryId)

  async function run(action: () => Promise<TimeBlock | null>) {
    setBusy(true)
    setProblem('')
    try {
      onDone(await action())
    } catch (failure) {
      setProblem(describe(failure))
    } finally {
      setBusy(false)
    }
  }

  function save() {
    const base = { categoryId, minutes: Number(minutes), date }
    const withBackground = background ? { ...base, bgCategoryId: background } : base
    const draft = note.trim() ? { ...withBackground, note: note.trim() } : withBackground
    const found = blockProblem(draft, today)
    if (found) {
      setProblem(BLOCK_PROBLEMS[found])
      return
    }
    void run(() => db.put('time', blockFromDraft(draft, existing)))
  }

  // noValidate: пределы полей проверяет `blockProblem` и называет причину
  // по-русски; браузер со своей подсказкой её бы перехватил.
  return (
    <form
      className="form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <label className="field">
        <span>Категория</span>
        <select
          name="block-category"
          value={categoryId}
          onChange={(event) => {
            setCategoryId(event.target.value)
            // Основная стала той, что была фоном, — фоновая снимается.
            if (event.target.value === background) setBackground('')
            // Новый блок подсказывает минуты своей категории; правка — нет:
            // там минуты уже записаны человеком.
            if (!existing) setMinutes(String(suggest(event.target.value)))
          }}
        >
          {choices.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Фоном — если что-то шло параллельно; в сумму дня не входит</span>
        <select name="block-bg" value={background} onChange={(event) => setBackground(event.target.value)}>
          <option value="">нет</option>
          {backgrounds.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Минут</span>
        <input
          name="block-minutes"
          type="number"
          inputMode="numeric"
          min={1}
          max={MINUTES_PER_DAY}
          value={minutes}
          onChange={(event) => setMinutes(event.target.value)}
        />
      </label>

      <div className="field">
        <span>День</span>
        <div className="row row--wrap">
          <input
            name="block-date"
            type="date"
            aria-label="День"
            max={today}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          {quickDates(today).map((quick) => (
            <button
              key={quick.label}
              type="button"
              className={date === quick.date ? 'chip chip--today chip--on' : 'chip chip--today'}
              onClick={() => setDate(quick.date)}
            >
              {quick.label}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span>Заметка — необязательно</span>
        <textarea name="block-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>

      {problem && <p className="error">{problem}</p>}

      <div className="form__actions">
        {existing && (
          <>
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await db.remove('time', existing.id)
                  return null
                })
              }
            >
              Убрать
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => onDone(null)}>
              Отмена
            </button>
          </>
        )}
        <button type="submit" className="btn btn--primary" disabled={busy || !categoryId}>
          {existing ? 'Сохранить' : 'Записать'}
        </button>
      </div>
    </form>
  )
}
