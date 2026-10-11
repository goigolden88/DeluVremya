/**
 * Экран замысла (Р-103): название и видение, лента его дел и мыслей.
 *
 * Видение — тот же `text`: первая строка — название, остальное — видение.
 * Модель не растёт, старые замыслы читаются как есть.
 *
 * Чистые функции, без React и без базы.
 */

import type { DateStr } from '../../shared/core/dates.ts'
import type { Note, NoteKind } from '../../app/model.ts'
import { stateParts } from './feed.ts'
import { captureNote, compareNotes, tasksOfGoal, thoughtsOfGoal, withGoal } from './inbox.ts'
import { firstLine } from './labels.ts'

/** Адрес экрана замысла. */
export function goalLink(id: string): string {
  return `/goal/${encodeURIComponent(id)}`
}

/** Замысел по id: живая запись вида «замысел», в работе или достигнутая. Null — не найден. */
export function findGoal(id: string, notes: readonly Note[]): Note | null {
  return notes.find((note) => note.id === id && !note.deleted && note.kind === 'goal') ?? null
}

/** Название — первая строка текста. */
export function goalTitle(goal: Note): string {
  return firstLine(goal.text).trim()
}

/** Видение — всё после первой строки. Пустая строка — видения не записано. */
export function goalVision(goal: Note): string {
  return goal.text.split('\n').slice(1).join('\n').trim()
}

/**
 * Лента замысла: его дела и мысли одним списком, свежие сверху, без даты —
 * внизу (порядок «Заметок»). Отброшенных нет — как в счёте у замысла.
 */
export function goalEntries(goalId: string, notes: readonly Note[]): Note[] {
  return [...tasksOfGoal(goalId, notes), ...thoughtsOfGoal(goalId, notes)].sort(compareNotes)
}

/**
 * Подпись строки ленты: «дело · открыто», «дело · сделано 14.10»,
 * «дело · в плане на 15.10», «мысль». День записи стоит в строке отдельно.
 */
export function entryDetail(note: Note): string {
  const parts = stateParts(note)
  if (note.kind === 'task' && note.status === 'open' && note.plannedFor === null) parts.push('открыто')
  return parts.join(' · ')
}

/**
 * Запись с экрана замысла: как с «Заметок» — во входящие, сегодняшним
 * днём, — и сразу к замыслу. Null — текста нет.
 */
export function captureForGoal(text: string, today: DateStr, kind: NoteKind, goalId: string): Note | null {
  const draft = captureNote(text, today, kind)
  return draft === null ? null : withGoal(draft, goalId)
}
