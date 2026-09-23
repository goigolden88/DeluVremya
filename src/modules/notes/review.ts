/**
 * Разбор в обзоре недели: висяки и «когда-нибудь» (Р-46), замыслы без
 * движения (Р-47), возврат мыслей (Р-49).
 *
 * Чистые функции, без React и без базы (02-Архитектура, «Структура кода»).
 */

import { addDays, daysBetween, inPeriod, isDateStr, weekPeriod, type DateStr, type Period } from '../../shared/core/dates.ts'
import type { Note } from '../../app/model.ts'
import { ageDays, compareNotes, goalsOf, isUnsorted, tasksOfGoal } from './inbox.ts'
import { withoutMain } from './plan.ts'

// ─── Пороги (Р-48) ─────────────────────────────────────────────────────────

/** Висяк — дело неразобранного не моложе стольких дней: «что висит месяц» (Р-46). */
export const STALE_DAYS = 30
/** Замысел без движения — ни одного дела за столько дней (Р-47). */
export const GOAL_STILL_DAYS = 28
/** Пределы порога в настройках: от дня до года. */
export const MIN_THRESHOLD = 1
export const MAX_THRESHOLD = 365

/** Сколько висяков за один обзор: иначе он не уложится в десять минут (Р-46). */
export const STALE_BATCH = 5

// ─── Висяки и «когда-нибудь» (Р-46) ────────────────────────────────────────

/**
 * Висяки: дела неразобранного, чей возраст по `capturedOn` не меньше порога.
 * Старые первыми — они ждут дольше. Без даты возраста нет, и висяком такое
 * дело не станет (Р-08). Мысли не висят — у них возврат; замыслы — тоже (Р-31).
 */
export function staleTasks(notes: readonly Note[], today: DateStr, days: number): Note[] {
  return notes
    .filter((note) => isUnsorted(note) && note.kind === 'task' && (ageDays(note, today) ?? -1) >= days)
    .sort((a, b) => (a.capturedOn ?? '').localeCompare(b.capturedOn ?? '') || a.id.localeCompare(b.id))
}

/** «Когда-нибудь»: из неразобранного и из плана уходит, отметка главного снимается. */
export function withSomeday(note: Note): Note {
  return { ...withoutMain(note), plannedFor: null, status: 'someday' }
}

/** «Вернуть» — обратно в неразобранное. */
export function fromSomeday(note: Note): Note {
  return { ...note, status: 'open' }
}

/** Отложенное на «когда-нибудь», в порядке экрана. */
export function somedayOf(notes: readonly Note[]): Note[] {
  return notes.filter((note) => !note.deleted && note.status === 'someday').sort(compareNotes)
}

// ─── Замыслы без движения (Р-47) ───────────────────────────────────────────

export type StuckGoal = {
  goal: Note
  /** Последнее движение: запись замысла, запись или выполнение его дела. Null — дат нет. */
  since: DateStr | null
}

function lastMove(goal: Note, notes: readonly Note[]): DateStr | null {
  const dates = [goal.capturedOn, ...tasksOfGoal(goal.id, notes).flatMap((task) => [task.capturedOn, task.doneOn ?? null])]
  return dates.reduce<DateStr | null>((last, date) => {
    if (date === null || !isDateStr(date)) return last
    return last === null || date > last ? date : last
  }, null)
}

/**
 * Открытые замыслы, у которых за `days` дней не было движения. Без единой
 * даты — тоже здесь: сказать, что двигался, нечем.
 */
export function stuckGoals(notes: readonly Note[], today: DateStr, days: number): StuckGoal[] {
  return goalsOf(notes).flatMap((goal) => {
    const since = lastMove(goal, notes)
    return since !== null && daysBetween(since, today) < days ? [] : [{ goal, since }]
  })
}

// ─── Возврат мыслей (Р-49) ─────────────────────────────────────────────────

/** Сколько недель назад смотреть: «месяц назад» и «три месяца назад». */
export const RECALL_WEEKS: readonly number[] = [4, 13]

export type Recall = { weeksAgo: number; period: Period; notes: Note[] }

/**
 * Мысли, записанные в ту же неделю столько-то недель назад. Неделя — любой
 * день недели обзора. Без даты в возврат не попадают (Р-08).
 */
export function recall(notes: readonly Note[], week: DateStr): Recall[] {
  const from = weekPeriod(week).from
  return RECALL_WEEKS.map((weeksAgo) => {
    const period = weekPeriod(addDays(from, -7 * weeksAgo))
    const found = notes
      .filter(
        (note) =>
          !note.deleted && note.kind === 'thought' && note.capturedOn !== null && inPeriod(note.capturedOn, period),
      )
      .sort((a, b) => (a.capturedOn ?? '').localeCompare(b.capturedOn ?? '') || a.id.localeCompare(b.id))
    return { weeksAgo, period, notes: found }
  })
}
