/**
 * Распорядок и сон (Р-94): подъём и отбой — окно дня учёта.
 *
 * Запись без `day` — распорядок: действует с дня `since` до следующего
 * распорядка, прошлые дни остаются со своим. Запись с `day` — отметка одного
 * дня. Окно дня — отметка этого дня, иначе распорядок, действующий на него,
 * иначе окно по умолчанию (`DAY_WINDOW`).
 *
 * Id — из даты: одна дата на двух устройствах — одна запись, как
 * `cat:<название>` (Р-29).
 *
 * Чистые функции, без React и без базы.
 */

import { isDateStr, nowIso, type DateStr } from '../../shared/core/dates.ts'
import type { Sleep } from '../../app/model.ts'
import { DAY_WINDOW, type DayWindow } from './day.ts'

const HOURS_PER_DAY = 24
const MINUTES_PER_HOUR = 60

const CLOCK = /^(\d{2}):(\d{2})$/

/** `"07:30"` → 450 минут от полуночи. Не `"ЧЧ:ММ"` или вне суток — null. */
export function clockMinutes(value: string): number | null {
  const match = CLOCK.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours >= HOURS_PER_DAY || minutes >= MINUTES_PER_HOUR) return null
  return hours * MINUTES_PER_HOUR + minutes
}

/** Id распорядка: `routine:<since>`. */
export function routineId(since: DateStr): string {
  return `routine:${since}`
}

/** Id отметки дня: `sleep:<day>`. */
export function sleepId(day: DateStr): string {
  return `sleep:${day}`
}

/** Почему подъём и отбой не годятся. */
export type SleepProblem = 'clock' | 'same'

/** Можно ли сохранить: оба времени — «ЧЧ:ММ», и они не совпадают. Null — можно. */
export function checkSleep(entry: Pick<Sleep, 'wake' | 'bed'>): SleepProblem | null {
  const wake = clockMinutes(entry.wake)
  const bed = clockMinutes(entry.bed)
  if (wake === null || bed === null) return 'clock'
  return wake === bed ? 'same' : null
}

/**
 * Окно из подъёма и отбоя. Отбой не позже подъёма по часам — после полуночи:
 * 8:00 / 0:30 — с 8 до 24.5. Кривое время или подъём, равный отбою, —
 * null: такая запись окна не задаёт.
 */
export function windowOf(entry: Pick<Sleep, 'wake' | 'bed'>): DayWindow | null {
  const wake = clockMinutes(entry.wake)
  const bed = clockMinutes(entry.bed)
  if (wake === null || bed === null || wake === bed) return null
  const end = bed > wake ? bed : bed + HOURS_PER_DAY * MINUTES_PER_HOUR
  return { from: wake / MINUTES_PER_HOUR, to: end / MINUTES_PER_HOUR }
}

/** Час окна — в `"ЧЧ:ММ"` для поля времени: 7.5 → `"07:30"`, 24 и 24.5 — `"00:00"` и `"00:30"`. */
export function clockOf(hours: number): string {
  const minutes = Math.round(hours * MINUTES_PER_HOUR) % (HOURS_PER_DAY * MINUTES_PER_HOUR)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(minutes / MINUTES_PER_HOUR))}:${pad(minutes % MINUTES_PER_HOUR)}`
}

/**
 * Обычные подъём и отбой дня: распорядок на него, нет — окно по умолчанию.
 * Это и форма «Распорядка» на сегодня, и «как обычно» у отметки дня.
 */
export function routineDraft(records: readonly Sleep[], day: DateStr): Pick<Sleep, 'wake' | 'bed'> {
  const routine = routineOn(records, day)
  return routine
    ? { wake: routine.wake, bed: routine.bed }
    : { wake: clockOf(DAY_WINDOW.from), bed: clockOf(DAY_WINDOW.to) }
}

/** Живые записи, задающие окно: время читается. */
function usable(records: readonly Sleep[]): Sleep[] {
  return records.filter((record) => !record.deleted && windowOf(record) !== null)
}

/** Отметка дня. Нет — null. */
export function markOn(records: readonly Sleep[], day: DateStr): Sleep | null {
  return usable(records).find((record) => record.day === day) ?? null
}

/**
 * Распорядок, действующий на день: с самым поздним `since`, не позже дня.
 * Нет — null.
 */
export function routineOn(records: readonly Sleep[], day: DateStr): Sleep | null {
  let found: Sleep | null = null
  for (const record of usable(records)) {
    if (record.day !== undefined || record.since === undefined || !isDateStr(record.since)) continue
    if (record.since > day) continue
    if (found === null || (found.since ?? '') < record.since) found = record
  }
  return found
}

/** Окно дня: отметка дня, иначе распорядок на него, иначе по умолчанию. */
export function dayWindow(records: readonly Sleep[], day: DateStr): DayWindow {
  const entry = markOn(records, day) ?? routineOn(records, day)
  return (entry && windowOf(entry)) ?? DAY_WINDOW
}

/**
 * Распорядок из «Настроек»: действует с сегодня. Правка в тот же день —
 * та же запись, по id из даты; прошлые дни не меняются — у них свой.
 */
export function routineFrom(draft: Pick<Sleep, 'wake' | 'bed'>, today: DateStr): Sleep {
  return { id: routineId(today), updatedAt: nowIso(), since: today, wake: draft.wake, bed: draft.bed }
}

// ─── Отметка дня (Р-96) ────────────────────────────────────────────────────

/** Откуда подъём и отбой дня: отметка, распорядок или окно по умолчанию. */
export type SleepSource = 'mark' | 'routine' | 'default'

/** Подъём и отбой показанного дня — для строки над итогом и формы отметки. */
export type DaySleep = Pick<Sleep, 'wake' | 'bed'> & { source: SleepSource }

/** Подъём и отбой дня: отметка, иначе распорядок на него, иначе по умолчанию. */
export function daySleep(records: readonly Sleep[], day: DateStr): DaySleep {
  const mark = markOn(records, day)
  if (mark) return { wake: mark.wake, bed: mark.bed, source: 'mark' }
  return { ...routineDraft(records, day), source: routineOn(records, day) ? 'routine' : 'default' }
}

/** Почему отметку не сохранить: время не годится или день ещё не наступил. */
export type MarkProblem = SleepProblem | 'future'

/** Можно ли отметить день: сегодня или прошлый, время годится. Null — можно. */
export function checkMark(draft: Pick<Sleep, 'wake' | 'bed'>, day: DateStr, today: DateStr): MarkProblem | null {
  if (day > today) return 'future'
  return checkSleep(draft)
}

/** Что сделать с базой: записать отметку, снять её или ничего. */
export type MarkChange = { kind: 'put'; record: Sleep } | { kind: 'remove'; id: string } | { kind: 'none' }

function sameClock(a: Pick<Sleep, 'wake' | 'bed'>, b: Pick<Sleep, 'wake' | 'bed'>): boolean {
  return clockMinutes(a.wake) === clockMinutes(b.wake) && clockMinutes(a.bed) === clockMinutes(b.bed)
}

/**
 * «Сохранить» отметку дня. Время, как у распорядка этого дня (нет его —
 * как окно по умолчанию), — отметка не нужна: была — снимается, не было —
 * ничего. Иначе — отметка `sleep:<день>`: правка того же дня — та же запись.
 * Годность времени и дня проверяет `checkMark` до этого.
 */
export function markChange(records: readonly Sleep[], draft: Pick<Sleep, 'wake' | 'bed'>, day: DateStr): MarkChange {
  if (sameClock(draft, routineDraft(records, day))) return usualChange(records, day)
  return { kind: 'put', record: { id: sleepId(day), updatedAt: nowIso(), day, wake: draft.wake, bed: draft.bed } }
}

/** «Как обычно»: отметка дня снимается — день снова по распорядку. Нет её — ничего. */
export function usualChange(records: readonly Sleep[], day: DateStr): MarkChange {
  const live = records.some((record) => record.id === sleepId(day) && !record.deleted)
  return live ? { kind: 'remove', id: sleepId(day) } : { kind: 'none' }
}
