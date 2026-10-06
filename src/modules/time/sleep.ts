/**
 * Распорядок и отметка сна — окно дня (Р-94).
 *
 * Запись `Sleep` без `day` — распорядок: действует с дня `since` до
 * следующего распорядка. С `day` — отметка одного дня. Окно — от подъёма до
 * отбоя; отбой не позже подъёма по часам — после полуночи. Окно дня D:
 * отметка D, иначе распорядок, действующий на D, иначе `DAY_WINDOW` — каким
 * окно было до распорядка (Р-21).
 *
 * Отметку дня ставит экран следующей задачей; здесь — только выбор окна
 * и распорядок «Настроек».
 *
 * Чистые функции, без React и без базы.
 */

import { isDateStr, nowIso, type DateStr } from '../../shared/core/dates.ts'
import type { Sleep } from '../../app/model.ts'
import { MINUTES_PER_DAY } from './categories.ts'
import { DAY_WINDOW, type DayWindow } from './day.ts'

const MINUTES_PER_HOUR = 60

/** Подъём и отбой — то, что вводится в форме. */
export type SleepTimes = Pick<Sleep, 'wake' | 'bed'>

/** Время «ЧЧ:ММ» → минуты от полуночи. Кривое — null. */
export function clockMinutes(clock: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(clock)
  if (!match) return null
  return Number(match[1]) * MINUTES_PER_HOUR + Number(match[2])
}

/** Часы окна → «ЧЧ:ММ» по часам: 8 → «08:00», 24 → «00:00», 24,5 → «00:30». */
export function clockOf(hours: number): string {
  const minutes = Math.round(hours * MINUTES_PER_HOUR) % MINUTES_PER_DAY
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(Math.floor(minutes / MINUTES_PER_HOUR))}:${pad(minutes % MINUTES_PER_HOUR)}`
}

/** Подъём и отбой без распорядка — границы `DAY_WINDOW`: «08:00» и «00:00». */
export const DEFAULT_TIMES: SleepTimes = { wake: clockOf(DAY_WINDOW.from), bed: clockOf(DAY_WINDOW.to) }

/**
 * Окно по подъёму и отбою, в часах от полуночи дня подъёма. Отбой не позже
 * подъёма по часам — после полуночи: 8:00 и 0:30 — до 24,5; 15:00 и 7:00 —
 * до 31. Кривое время или подъём, совпавший с отбоем, — null.
 */
export function sleepWindow(times: SleepTimes): DayWindow | null {
  const wake = clockMinutes(times.wake)
  const bed = clockMinutes(times.bed)
  if (wake === null || bed === null || wake === bed) return null
  const end = bed > wake ? bed : bed + MINUTES_PER_DAY
  return { from: wake / MINUTES_PER_HOUR, to: end / MINUTES_PER_HOUR }
}

/** Живые записи, у которых окно читается. Кривые — как будто их нет. */
function usable(sleeps: readonly Sleep[]): Sleep[] {
  return sleeps.filter((sleep) => !sleep.deleted && sleepWindow(sleep) !== null)
}

/** Поздняя правка — первой: две записи на одну дату бывают только после правки руками. */
function byLatest(a: Sleep, b: Sleep): number {
  return b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id)
}

/** Отметка дня — запись с этим `day`. Нет — null. */
export function markOn(sleeps: readonly Sleep[], day: DateStr): Sleep | null {
  return usable(sleeps).filter((sleep) => sleep.day === day).sort(byLatest)[0] ?? null
}

/**
 * Распорядок, действующий на день: без `day`, с самым поздним `since`
 * не позже дня. Распорядок без читаемого `since` не действует. Нет — null.
 */
export function routineOn(sleeps: readonly Sleep[], day: DateStr): Sleep | null {
  return (
    usable(sleeps)
      .filter((sleep) => sleep.day === undefined && sleep.since !== undefined && isDateStr(sleep.since) && sleep.since <= day)
      .sort((a, b) => (b.since ?? '').localeCompare(a.since ?? '') || byLatest(a, b))[0] ?? null
  )
}

/** Окно дня: отметка этого дня, иначе действующий распорядок, иначе `DAY_WINDOW`. */
export function dayWindow(sleeps: readonly Sleep[], day: DateStr): DayWindow {
  const own = markOn(sleeps, day) ?? routineOn(sleeps, day)
  return (own && sleepWindow(own)) ?? DAY_WINDOW
}

/**
 * Id распорядка — из дня, с которого он действует: распорядок одного дня
 * на двух устройствах — одна запись, как `cat:<название>` (Р-29).
 */
export function routineId(since: DateStr): string {
  return `routine:${since}`
}

/** Подъём и отбой для формы «Распорядка»: действующие сегодня, без распорядка — по умолчанию. */
export function routineTimes(sleeps: readonly Sleep[], today: DateStr): SleepTimes {
  const routine = routineOn(sleeps, today)
  return routine ? { wake: routine.wake, bed: routine.bed } : DEFAULT_TIMES
}

/** Почему распорядок не сохраняется: время не читается или подъём совпал с отбоем. */
export type RoutineProblem = 'clock' | 'same'

/** Можно ли сохранить распорядок. Null — можно. */
export function checkRoutine(times: SleepTimes): RoutineProblem | null {
  if (clockMinutes(times.wake) === null || clockMinutes(times.bed) === null) return 'clock'
  return sleepWindow(times) === null ? 'same' : null
}

/**
 * Что сохранить из «Распорядка». Тот же, что действует сегодня, — ничего:
 * лишняя запись окно не поменяет. Иначе — распорядок с сегодняшнего дня:
 * правка в тот же день ложится в ту же запись, прошлые дни остаются при
 * своём распорядке.
 */
export function routineToSave(times: SleepTimes, sleeps: readonly Sleep[], today: DateStr): Sleep | null {
  const current = routineTimes(sleeps, today)
  if (current.wake === times.wake && current.bed === times.bed) return null
  return { id: routineId(today), updatedAt: nowIso(), since: today, wake: times.wake, bed: times.bed }
}
