/**
 * Тексты заметок. Числа в них — из констант кода, а не цифрами
 * (правило в CLAUDE.md).
 */

import { days, formatMonth, plural, type DateStr } from '../../core/dates.ts'
import type { Note, NoteKind } from '../../core/model.ts'
import { ageDays, type GoalProgress } from './inbox.ts'

/** Вид записи на переключателе и в карточке (Р-13, Р-31). */
export const KIND_NAMES: Record<NoteKind, string> = {
  task: 'Дело',
  thought: 'Мысль',
  goal: 'Замысел',
}

/** Вид во множественном — на чипах отбора. */
export const KIND_PLURALS: Record<NoteKind, string> = {
  task: 'Дела',
  thought: 'Мысли',
  goal: 'Замыслы',
}

/** Что ещё не разобрано — заголовок списка на экране заметок (Р-32). */
export const UNSORTED_TITLE = 'Неразобранное'

/** С какого возраста он называется неделями, месяцами и годами. */
export const AGE_WEEKS_FROM = 14
export const AGE_MONTHS_FROM = 60
export const AGE_YEARS_FROM = 365

const DAYS_PER_WEEK = 7
const DAYS_PER_MONTH = 30

function counted(count: number, forms: [string, string, string]): string {
  return `${count} ${plural(count, forms)}`
}

/**
 * Возраст записи: «сегодня», «вчера», «5 дней назад», «3 недели назад»,
 * «2 месяца назад». Без даты — так и сказано; кривая дата — как лежит.
 * Серым и без оценки: давно записанное не провинилось (как в Р-05).
 */
export function ageText(note: Note, today: DateStr): string {
  if (note.capturedOn === null) return 'без даты'
  const age = ageDays(note, today)
  if (age === null) return note.capturedOn
  if (age === 0) return 'сегодня'
  if (age === 1) return 'вчера'
  if (age < AGE_WEEKS_FROM) return `${days(age)} назад`
  if (age < AGE_MONTHS_FROM) return `${counted(Math.floor(age / DAYS_PER_WEEK), ['неделю', 'недели', 'недель'])} назад`
  if (age < AGE_YEARS_FROM) return `${counted(Math.floor(age / DAYS_PER_MONTH), ['месяц', 'месяца', 'месяцев'])} назад`
  return `${counted(Math.floor(age / AGE_YEARS_FROM), ['год', 'года', 'лет'])} назад`
}

/** «12 записей». */
export function recordsText(count: number): string {
  return counted(count, ['запись', 'записи', 'записей'])
}

/** Сколько показано. Фильтр не прячет записи молча: скрытое названо числом. */
export function shownText(shown: number, total: number): string {
  return shown === total ? recordsText(total) : `Показано ${shown} из ${total}`
}

/** Заголовок месяца: «Сентябрь 2026»; без даты — «Без даты». */
export function monthHeading(month: string | null): string {
  if (month === null) return 'Без даты'
  const text = formatMonth(month)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Дела замысла — число с основанием: «3 дела, сделано 1». */
export function progressText(progress: GoalProgress): string {
  if (progress.total === 0) return 'дел пока нет'
  return `${counted(progress.total, ['дело', 'дела', 'дел'])}, сделано ${progress.done}`
}

/** Отклик после записи. */
export function savedLine(kind: NoteKind): string {
  return `Записано: ${KIND_NAMES[kind].toLowerCase()}`
}

/** Кнопка выполнения: у дела — «Сделано», у замысла — «Достигнут» (Р-31). У мысли её нет. */
export const DONE_LABELS: Partial<Record<NoteKind, string>> = {
  task: 'Сделано',
  goal: 'Достигнут',
}

/** Отклик после «Сделано»: запись уходит из списка, и это сказано (Р-30). */
export function doneLine(kind: NoteKind): string {
  return kind === 'goal' ? 'Замысел достигнут — убран из замыслов' : `Сделано — убрано из «${UNSORTED_TITLE}»`
}

/** Сколько знаков текста называют запись в вопросе и в отчёте. */
const SHORT_TEXT = 40

/** Запись одной короткой строкой: начало первой строки текста. */
export function shortText(text: string): string {
  const first = text.split('\n')[0] ?? ''
  return first.length > SHORT_TEXT ? `${first.slice(0, SHORT_TEXT)}…` : first
}

/** Вопрос перед удалением: запись названа началом её текста. */
export function deleteConfirm(text: string): string {
  return `Удалить запись «${shortText(text)}»?`
}

/** Первая строка текста: в выборе замысла и в списке его дел. */
export function firstLine(text: string): string {
  return text.split('\n')[0] ?? ''
}

/** Подпись дела со ссылкой на замысел. */
export function goalLine(goal: Note): string {
  return `к замыслу «${firstLine(goal.text)}»`
}
