/**
 * Входящие: захват одной строкой и что лежит неразобранным.
 *
 * Чистые функции, без React и без базы (02-Архитектура, «Структура кода»).
 */

import { nowIso } from '../../core/dates.ts'
import { ulid } from '../../core/id.ts'
import type { Note, NoteKind } from '../../core/model.ts'

/** Вид записи, когда при захвате его не выбрали (Р-13). */
export const DEFAULT_KIND: NoteKind = 'task'

/**
 * Запись во входящие из одного поля. Кроме текста — ничего обязательного
 * (Р-09): дата записи — сегодня, в план не поставлена, открыта, вид — дело.
 * Null — текста нет, записывать нечего.
 */
export function captureNote(text: string, today: string): Note | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  return {
    id: ulid(),
    updatedAt: nowIso(),
    text: trimmed,
    kind: DEFAULT_KIND,
    capturedOn: today,
    plannedFor: null,
    status: 'open',
  }
}

/**
 * Что лежит во входящих: не поставлено ни на какой день и не закрыто.
 * Свежие сверху — по `id`: ULID сортируется по времени создания.
 */
export function inboxOf(notes: readonly Note[]): Note[] {
  return notes
    .filter((note) => !note.deleted && note.plannedFor === null && note.status === 'open')
    .sort((a, b) => b.id.localeCompare(a.id))
}
