/**
 * Дело при записи на «Заметках» (Р-73, Р-108): куда оно встаёт сразу —
 * в неразобранное, в план дня (и на период) или повтором. Ничего не выбрано —
 * в неразобранное: обязательных полей нет (Р-09).
 *
 * Чистые функции, без React и без базы (02-Архитектура, «Структура кода»).
 */

import { isDateStr, type DateStr } from '../../shared/core/dates.ts'
import type { Note, NoteKind } from '../../app/model.ts'
import { captureNote } from './inbox.ts'
import { SPAN_ERROR } from './labels.ts'
import { withPlanSpan } from './plan.ts'
import { readRule, toPattern, type RuleDraft } from './repeat.ts'

/** «Другой день» выбран, а поле дня пустое. */
export const NO_DAY_ERROR = 'Не выбран день'

/** День в прошлом: в прошлое дело не ставится. */
export const PAST_DAY_ERROR = 'День — не раньше сегодня'

/**
 * Куда встаёт дело: никуда — в неразобранное; на день и, по желанию, по какой
 * день (Р-101); повтором — правило из формы, как в карточке (Р-107). День —
 * строкой поля: пустой — ещё не выбран.
 */
export type CaptureWhen =
  | { at: 'unsorted' }
  | { at: 'day'; day: string; to: DateStr | null }
  | { at: 'repeat'; rule: RuleDraft }

/**
 * Черновик записи. Null — текста нет, записывать нечего. Ошибка — день,
 * период или правило кривые: не пишется ничего. У мысли и замысла выбор
 * не действует — в план и в повтор ставится дело.
 */
export function captureDraft(
  text: string,
  today: DateStr,
  kind: NoteKind,
  when: CaptureWhen,
): { note: Note } | { error: string } | null {
  const draft = captureNote(text, today, kind)
  if (draft === null) return null
  if (kind !== 'task' || when.at === 'unsorted') return { note: draft }
  if (when.at === 'day') {
    if (!isDateStr(when.day)) return { error: NO_DAY_ERROR }
    if (when.day < today) return { error: PAST_DAY_ERROR }
    const planned = withPlanSpan(draft, when.day, when.to)
    return planned === null ? { error: SPAN_ERROR } : { note: planned }
  }
  const read = readRule(when.rule)
  return 'error' in read ? read : { note: toPattern(draft, read.rule) }
}
