import { useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../core/db.ts'
import { formatDateLong, type DateStr } from '../../core/dates.ts'
import type { Category } from '../../core/model.ts'
import { useNow } from '../../ui/useNow.ts'
import { activeCategories, MINUTES_PER_DAY } from './categories.ts'
import { categoryName } from './day.ts'
import { BLOCK_PROBLEMS, runningLine, savedLine, startedLine, UNKNOWN_CATEGORY } from './labels.ts'
import { blockProblem } from './retro.ts'
import { blockFromTimer, runningMinutes, stopMinutes, timerDate } from './timer.ts'
import type { Timer } from './useTimer.ts'

/** Как часто перерисовывать идущие минуты. Чаще минуты незачем, реже — отстаёт. */
const TICK_MS = 10_000

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/** Строка идущего таймера на «Сегодня»: видно, что идёт, и где остановить. */
export function TimerLine({ timer, categories }: { timer: Timer; categories: Category[] }) {
  const now = useNow(TICK_MS, timer.timer !== null)
  if (!timer.timer) return null
  const name = categoryName(categories, timer.timer.categoryId) ?? UNKNOWN_CATEGORY
  return (
    <p className="added">
      <span className="lead">{runningLine(name, runningMinutes(timer.timer, now))}</span>
      <Link to="/time">Остановить →</Link>
    </p>
  )
}

/**
 * Таймер на «Времени»: запуск, остановка с правкой минут, сброс.
 *
 * Остановка не пишет сразу: сначала показывает минуты, которые запишутся,
 * и день, на который лягут. Забытый на ночь таймер правится до записи,
 * а не после.
 */
export function TimerPanel({ timer, categories, today }: { timer: Timer; categories: Category[]; today: DateStr }) {
  const active = activeCategories(categories)
  const [choice, setChoice] = useState('')
  /** Минуты в поле остановки. Null — не останавливаем. */
  const [stopping, setStopping] = useState<string | null>(null)
  const [problem, setProblem] = useState('')
  const [saved, setSaved] = useState('')
  const now = useNow(TICK_MS, timer.timer !== null && stopping === null)

  if (!timer.known) return null
  if (timer.error) return <p className="error">Таймер не прочитался: {timer.error}</p>

  async function run(action: () => Promise<void>) {
    setProblem('')
    try {
      await action()
    } catch (failure) {
      setProblem(describe(failure))
    }
  }

  const running = timer.timer
  if (running === null) {
    const categoryId = active.some((each) => each.id === choice) ? choice : (active[0]?.id ?? '')
    return (
      <>
        <div className="row row--wrap">
          <select
            name="timer-category"
            aria-label="Категория таймера"
            value={categoryId}
            onChange={(event) => setChoice(event.target.value)}
          >
            {active.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!categoryId}
            onClick={() =>
              void run(async () => {
                setSaved('')
                await timer.start(categoryId)
              })
            }
          >
            Старт
          </button>
        </div>
        {saved && <p className="muted">{saved}</p>}
        {problem && <p className="error">{problem}</p>}
      </>
    )
  }

  const name = categoryName(categories, running.categoryId) ?? UNKNOWN_CATEGORY
  const date = timerDate(running)

  if (stopping === null) {
    return (
      <>
        <p className="lead">{runningLine(name, runningMinutes(running, now))}</p>
        <p className="muted">{startedLine(new Date(running.startedAt), date, today)}</p>
        <div className="row">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setStopping(String(stopMinutes(running, new Date())))}
          >
            Стоп
          </button>
        </div>
        {problem && <p className="error">{problem}</p>}
      </>
    )
  }

  const save = () => {
    const minutes = Number(stopping)
    const found = blockProblem({ categoryId: running.categoryId, minutes, date }, today)
    if (found) {
      setProblem(BLOCK_PROBLEMS[found])
      return
    }
    void run(async () => {
      await db.put('time', blockFromTimer(running, minutes))
      await timer.clear()
      setStopping(null)
      setSaved(savedLine(name, minutes, date, today))
    })
  }

  // noValidate: иначе браузер сам не пустит ноль минут своей подсказкой
  // на своём языке, и наша причина с пределами не покажется.
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
        <span>
          {name} — минут, ляжет на {formatDateLong(date)}
        </span>
        <input
          name="timer-minutes"
          type="number"
          inputMode="numeric"
          min={1}
          max={MINUTES_PER_DAY}
          value={stopping}
          onChange={(event) => setStopping(event.target.value)}
        />
      </label>
      {problem && <p className="error">{problem}</p>}
      <div className="form__actions">
        <button
          type="button"
          className="btn"
          onClick={() =>
            void run(async () => {
              await timer.clear()
              setStopping(null)
              setSaved('')
            })
          }
        >
          Сбросить
        </button>
        <button type="button" className="btn" onClick={() => setStopping(null)}>
          Продолжить
        </button>
        <button type="submit" className="btn btn--primary">
          Записать
        </button>
      </div>
    </form>
  )
}
