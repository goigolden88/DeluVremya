/**
 * Заметки: захват одной строкой, неразобранное, замыслы, поиск.
 *
 * Чистые функции, без React и без базы (02-Архитектура, «Структура кода»).
 */

import { daysBetween, isDateStr, nowIso, type DateStr } from '../../core/dates.ts'
import { dateWords, normalize } from '../../core/feed.ts'
import { ulid } from '../../core/id.ts'
import type { Note, NoteKind } from '../../core/model.ts'

/** Вид записи, когда при захвате его не выбрали (Р-13). */
export const DEFAULT_KIND: NoteKind = 'task'

/** Виды в порядке переключателя и чипов (Р-31). */
export const NOTE_KINDS: readonly NoteKind[] = ['task', 'thought', 'goal']

/**
 * Запись из одного поля. Кроме текста — ничего обязательного (Р-09):
 * дата записи — сегодня, в план не поставлена, открыта, вид — дело,
 * если другой не выбрали. Null — текста нет, записывать нечего.
 */
export function captureNote(
  text: string,
  today: string,
  kind: NoteKind = DEFAULT_KIND,
  /** Сразу в план на этот день — только дело и только по желанию (Р-73). */
  plannedFor: string | null = null,
): Note | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  return {
    id: ulid(),
    updatedAt: nowIso(),
    text: trimmed,
    kind,
    capturedOn: today,
    plannedFor: kind === 'task' ? plannedFor : null,
    status: 'open',
  }
}

// ─── Порядок и группы ──────────────────────────────────────────────────────

/** День записи, если он читается. Null — даты нет или она кривая. */
function dayOf(note: Note): DateStr | null {
  return note.capturedOn !== null && isDateStr(note.capturedOn) ? note.capturedOn : null
}

/**
 * Порядок записей: по дню записи, свежие сверху; внутри дня — по `id`,
 * ULID сортируется по времени создания. Не по одному `id`: у заметки,
 * пришедшей импортом, он — момент импорта, и мартовская встала бы выше
 * сегодняшних. Без даты — в конце: сверху им не место, их находят поиском (Р-08).
 */
export function compareNotes(a: Note, b: Note): number {
  const first = dayOf(a)
  const second = dayOf(b)
  if (first !== second) {
    if (first === null) return 1
    if (second === null) return -1
    return second.localeCompare(first)
  }
  return b.id.localeCompare(a.id)
}

/** Лежит в неразобранном: не в плане, открыто, не замысел — у него свой блок (Р-31). */
export function isUnsorted(note: Note): boolean {
  return !note.deleted && note.plannedFor === null && note.status === 'open' && note.kind !== 'goal'
}

/** Неразобранное в порядке экрана. */
export function inboxOf(notes: readonly Note[]): Note[] {
  return notes.filter(isUnsorted).sort(compareNotes)
}

/** Замыслы в работе: не достигнуты, не отброшены, не удалены. */
export function goalsOf(notes: readonly Note[]): Note[] {
  return notes.filter((note) => !note.deleted && note.kind === 'goal' && note.status === 'open').sort(compareNotes)
}

/** Записи одного месяца. `month` — `ГГГГ-ММ`; null — без даты. */
export type MonthGroup = { month: string | null; notes: Note[] }

/** Разбивка по месяцам записи — «где то, что я записал в марте?». На входе порядок любой. */
export function groupByMonth(notes: readonly Note[]): MonthGroup[] {
  const groups: MonthGroup[] = []
  for (const note of [...notes].sort(compareNotes)) {
    const day = dayOf(note)
    const month = day === null ? null : day.slice(0, 7)
    const last = groups.at(-1)
    if (last && last.month === month) last.notes.push(note)
    else groups.push({ month, notes: [note] })
  }
  return groups
}

/** Сколько записей каждого вида. */
export function kindCounts(notes: readonly Note[]): Record<NoteKind, number> {
  const counts: Record<NoteKind, number> = { task: 0, thought: 0, goal: 0 }
  for (const note of notes) counts[note.kind] += 1
  return counts
}

// ─── Поиск ─────────────────────────────────────────────────────────────────

// Приведение текста, слова запроса и слова даты — общее правило ядра:
// лента ищет так же (Р-61). Отсюда их берут шаблоны и план против факта.
export { normalize, queryWords } from '../../core/feed.ts'

/**
 * Подходит ли запись. Слова ищутся по отдельности и нужны все: «воды
 * фильтр» находит «Купить фильтр для воды»; дата — и цифрами, и словами.
 * `extra` — что ещё ищется, но в тексте записи не стоит: название замысла
 * у его дела.
 */
export function matchesQuery(note: Note, words: readonly string[], extra = ''): boolean {
  if (words.length === 0) return true
  const haystack = normalize(`${note.text} ${dateWords(note.capturedOn)} ${extra}`)
  return words.every((word) => haystack.includes(word))
}

/**
 * Ссылки в тексте — в карточке они нажимаются: текст записи сам кнопка,
 * и ссылка внутри неё не нажалась бы. Знак препинания в конце ссылке
 * не принадлежит; повтор — один раз.
 */
export function linksOf(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>«»"]+/g) ?? []
  return [...new Set(found.map((link) => link.replace(/[.,;:!?)\]]+$/, '')))]
}

// ─── Возраст ───────────────────────────────────────────────────────────────

/**
 * Сколько дней записи. Null — дата неизвестна или не читается. Дата
 * в будущем — ноль: часы устройства бывают неверны, отрицательный возраст
 * ничего не значит.
 */
export function ageDays(note: Note, today: DateStr): number | null {
  const day = dayOf(note)
  return day === null ? null : Math.max(0, daysBetween(day, today))
}

// ─── Правки из карточки (Р-30) ─────────────────────────────────────────────

/** Новый текст. Null — пустой: запись без текста не бывает. Прежний — та же запись. */
export function withText(note: Note, text: string): Note | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  return trimmed === note.text ? note : { ...note, text: trimmed }
}

/** Смена вида. Переставая быть делом, запись теряет ссылку на замысел: она про дело (Р-31). */
export function withKind(note: Note, kind: NoteKind): Note {
  if (note.kind === kind) return note
  const next = { ...note, kind }
  return kind === 'task' ? next : withGoal(next, null)
}

/** Сделано — или замысел достигнут: из неразобранного и из блока замыслов уходит. */
export function markDone(note: Note, today: DateStr): Note {
  return { ...note, status: 'done', doneOn: today }
}

/** «Отменить» после «Сделано»: снова открыта, дня выполнения нет. */
export function reopen(note: Note): Note {
  const { doneOn: _doneOn, ...rest } = note
  return { ...rest, status: 'open' }
}

// ─── Замыслы и их дела (Р-31) ──────────────────────────────────────────────

/** Ссылка на заметку в `refs`: вид записи — в начале строки (02-Архитектура). */
const NOTE_REF = 'note:'

export function noteRef(id: string): string {
  return `${NOTE_REF}${id}`
}

/** id замысла, к которому относится дело. Null — ни к какому. */
export function goalIdOf(note: Note): string | null {
  const ref = note.refs?.find((each) => each.startsWith(NOTE_REF))
  return ref === undefined ? null : ref.slice(NOTE_REF.length)
}

/**
 * Отнести к замыслу или отвязать (`null`). Одно дело — один замысел:
 * прежняя ссылка на заметку заменяется. Ссылки на заметки сейчас бывают
 * только такие; другие связи в `refs` не трогаются.
 */
export function withGoal(note: Note, goalId: string | null): Note {
  const others = (note.refs ?? []).filter((each) => !each.startsWith(NOTE_REF))
  const refs = goalId === null ? others : [...others, noteRef(goalId)]
  const { refs: _refs, ...rest } = note
  return refs.length > 0 ? { ...rest, refs } : rest
}

/**
 * Замысел дела — живая запись вида «замысел». Удалённый или переделанный
 * в другой вид не показывается: ссылка просто молчит (Р-31).
 */
export function goalOf(note: Note, notes: readonly Note[]): Note | null {
  const id = goalIdOf(note)
  if (id === null) return null
  return notes.find((each) => each.id === id && !each.deleted && each.kind === 'goal') ?? null
}

/** Дела замысла: живые, не отброшенные, в порядке экрана. */
export function tasksOfGoal(goalId: string, notes: readonly Note[]): Note[] {
  return notes
    .filter((note) => !note.deleted && note.kind === 'task' && note.status !== 'dropped' && goalIdOf(note) === goalId)
    .sort(compareNotes)
}

export type GoalProgress = { total: number; done: number }

/** Сколько дел у замысла и сколько из них сделано — число с основанием. */
export function goalProgress(goalId: string, notes: readonly Note[]): GoalProgress {
  const tasks = tasksOfGoal(goalId, notes)
  return { total: tasks.length, done: tasks.filter((task) => task.status === 'done').length }
}
