/**
 * Тексты заметок. Числа в них — из констант кода, а не цифрами
 * (правило в CLAUDE.md).
 */

import { days, daysBetween, formatDateLong, formatMonth, isDateStr, plural, type DateStr } from '../../core/dates.ts'
import type { Note, NoteKind } from '../../core/model.ts'
import { quoted } from '../../ui/screenNames.ts'
import { ageDays, type GoalProgress } from './inbox.ts'
import type { Realism } from './plan.ts'

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

// ─── План дня (Р-33) ───────────────────────────────────────────────────────

/** Заголовки блоков плана на «Сегодня». */
export const MAIN_TITLE = 'Главное'
export const PLAN_TITLE = 'План'
export const OVERDUE_TITLE = 'С прошлых дней'
export const AHEAD_TITLE = 'Впереди'
export const DONE_OFF_PLAN_TITLE = 'Сделано вне плана'
export const FROM_UNSORTED_TITLE = `Из «${UNSORTED_TITLE}»`
/** Кнопка возврата пункта из плана. */
export const TO_UNSORTED = `В «${UNSORTED_TITLE}»`

const MINUTES_PER_HOUR = 60

/**
 * Длительность: «45 мин», «2 ч», «1 ч 30 мин». Та же запись, что у учёта
 * времени, — своя копия: модули друг о друге не знают.
 */
export function durationText(total: number): string {
  const rounded = Math.max(0, Math.round(total))
  const hours = Math.floor(rounded / MINUTES_PER_HOUR)
  const minutes = rounded % MINUTES_PER_HOUR
  if (hours === 0) return `${minutes} мин`
  return minutes === 0 ? `${hours} ч` : `${hours} ч ${minutes} мин`
}

/**
 * Влезает ли план в остаток дня (Р-35) — число с основанием: по скольким
 * пунктам из скольких посчитано. Без оценок — так и сказано, а не ноль.
 */
export function realismText(realism: Realism): string {
  if (realism.estimated === 0) {
    return realism.total === 1
      ? 'Влезает ли в день — не посчитать: у пункта нет оценки'
      : `Влезает ли в день — не посчитать: оценки нет ни у одного из ${realism.total} ${plural(realism.total, ['пункта', 'пунктов', 'пунктов'])}`
  }
  const basis =
    `по ${realism.estimated} ${plural(realism.estimated, ['пункту', 'пунктам', 'пунктам'])}` +
    (realism.estimated < realism.total ? ` из ${realism.total}` : '')
  const left = realism.left > 0 ? `до конца дня ${durationText(realism.left)}` : 'окно дня закончилось'
  const spare = realism.left - realism.minutes
  const verdict =
    realism.over > 0
      ? `не влезает на ${durationText(realism.over)}`
      : spare === 0
        ? 'влезает впритык'
        : `влезает, в запасе ${durationText(spare)}`
  return `Намечено ${durationText(realism.minutes)} ${basis} — ${left}: ${verdict}`
}

/** День плана словами: «вчера», «завтра», «20 сентября 2026». Кривой — как лежит. */
export function dayText(day: string, today: DateStr): string {
  if (!isDateStr(day)) return day
  const diff = daysBetween(today, day)
  if (diff === 0) return 'сегодня'
  if (diff === -1) return 'вчера'
  if (diff === 1) return 'завтра'
  return formatDateLong(day)
}

/** Отклик после «В план»: куда поставлено. */
export function plannedLine(day: DateStr, today: DateStr): string {
  return `Поставлено на ${dayText(day, today)}`
}

/**
 * Под неразобранным: поставленное в план отсюда ушло — сказано числом
 * и где искать. `screen` — название главного экрана на этом устройстве (Р-26).
 */
export function plannedCountText(count: number, screen: string): string {
  return `Ещё ${recordsText(count)} в плане — экран ${quoted(screen)}`
}
