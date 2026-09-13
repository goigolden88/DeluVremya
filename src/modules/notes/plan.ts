/**
 * План дня: пункты, главное дело, хвост прошлых дней, будущие пункты,
 * сумма оценок.
 *
 * Пункт плана — та же заметка с `plannedFor` (Р-12): поставить в план
 * и вернуть обратно — правка полей, а не превращение одной записи в другую.
 *
 * Чистые функции, без React и без базы (02-Архитектура, «Структура кода»).
 */

import { isDateStr, type DateStr } from '../../core/dates.ts'
import type { Note } from '../../core/model.ts'
import { captureNote } from './inbox.ts'

// ─── Пункты дня ────────────────────────────────────────────────────────────

/** Новый пункт с экрана дня: дело, записано сегодня, стоит на `day`. Null — текста нет. */
export function planNote(text: string, today: DateStr, day: DateStr): Note | null {
  const note = captureNote(text, today)
  return note && { ...note, plannedFor: day }
}

/** Стоит в плане дня: живая, открытая или сделанная. */
function isPlannedOn(note: Note, day: DateStr): boolean {
  return !note.deleted && note.plannedFor === day && (note.status === 'open' || note.status === 'done')
}

/** Порядок пунктов — порядок добавления: ULID сортируется по времени создания. */
function byId(a: Note, b: Note): number {
  return a.id.localeCompare(b.id)
}

/**
 * Главное дело среди пунктов дня. Слот один (Р-07); если после обмена
 * устройств отмечено два — позднее по времени правки, при равенстве —
 * по id: на обоих устройствах ответ один (Р-40).
 */
export function mainOf(items: readonly Note[]): Note | null {
  let found: Note | null = null
  for (const item of items) {
    if (!item.main) continue
    if (
      found === null ||
      item.updatedAt > found.updatedAt ||
      (item.updatedAt === found.updatedAt && item.id > found.id)
    ) {
      found = item
    }
  }
  return found
}

export type DayPlan = {
  /** Главное дело — открытое или уже сделанное. */
  main: Note | null
  /** Открытые, кроме главного, в порядке добавления. */
  open: Note[]
  /** Сделанные, кроме главного. */
  done: Note[]
  /** Все пункты дня вместе с главным. */
  all: Note[]
}

export function dayPlan(notes: readonly Note[], day: DateStr): DayPlan {
  const all = notes.filter((note) => isPlannedOn(note, day)).sort(byId)
  const main = mainOf(all)
  const rest = all.filter((note) => note !== main)
  return {
    main,
    open: rest.filter((note) => note.status === 'open'),
    done: rest.filter((note) => note.status === 'done'),
    all,
  }
}

// ─── Правки ────────────────────────────────────────────────────────────────

export function withoutMain(note: Note): Note {
  if (!('main' in note)) return note
  const { main: _main, ...rest } = note
  return rest
}

/**
 * Поставить на день или вернуть в неразобранное (`null`). Отметка главного
 * снимается: главное выбирается на свой день (Р-34).
 */
export function withPlan(note: Note, day: DateStr | null): Note {
  return { ...withoutMain(note), plannedFor: day }
}

/**
 * Сделать главным. Прежнее главное того же дня теряет отметку — всё,
 * что вернулось, записывается одним действием (Р-40). `items` — пункты дня.
 */
export function makeMain(note: Note, items: readonly Note[]): Note[] {
  const others = items.filter((item) => item.id !== note.id && item.main).map(withoutMain)
  return [{ ...note, main: true }, ...others]
}

// ─── Оценка ────────────────────────────────────────────────────────────────

/** Оценки кнопками, минут. Остальное — полем. */
export const ESTIMATE_CHOICES: readonly number[] = [15, 30, 60, 120]

/** Длиннее суток пункт на день не бывает: такое дело — проект (Р-38). */
export const MAX_ESTIMATE = 24 * 60

/** Новая оценка; `null` — убрать. */
export function withEstimate(note: Note, minutes: number | null): Note {
  if (minutes !== null) return { ...note, estMin: minutes }
  if (!('estMin' in note)) return note
  const { estMin: _estMin, ...rest } = note
  return rest
}

/**
 * Оценка из поля: целые минуты. Пусто — оценки нет, это не ошибка:
 * оценка необязательна (02-Архитектура). Кривое — причина с пределами.
 */
export function readEstimate(input: string): { minutes: number | null } | { error: string } {
  const text = input.trim()
  if (!text) return { minutes: null }
  const minutes = Number(text)
  if (!/^\d+$/.test(text) || minutes < 1 || minutes > MAX_ESTIMATE) {
    return { error: `Оценка — целое число минут от 1 до ${MAX_ESTIMATE}` }
  }
  return { minutes }
}

// ─── Другие дни ────────────────────────────────────────────────────────────

/**
 * Хвост прошлых дней (Р-34): открытые пункты, чей день прошёл. Ждут решения,
 * сколько бы дней ни прошло. Старые сверху — ждут дольше. Кривая дата плана —
 * тоже здесь: ни в плане, ни в неразобранном её не было бы вовсе.
 */
export function overdue(notes: readonly Note[], today: DateStr): Note[] {
  return notes
    .filter(
      (note) =>
        !note.deleted &&
        note.status === 'open' &&
        note.plannedFor !== null &&
        (!isDateStr(note.plannedFor) || note.plannedFor < today),
    )
    .sort((a, b) => (a.plannedFor ?? '').localeCompare(b.plannedFor ?? '') || byId(a, b))
}

export type DayGroup = { day: DateStr; notes: Note[] }

/** Впереди: открытые пункты будущих дней, по дням, ближние сверху (Р-37). */
export function ahead(notes: readonly Note[], today: DateStr): DayGroup[] {
  const future = notes
    .filter(
      (note) =>
        !note.deleted &&
        note.status === 'open' &&
        note.plannedFor !== null &&
        isDateStr(note.plannedFor) &&
        note.plannedFor > today,
    )
    .sort((a, b) => (a.plannedFor ?? '').localeCompare(b.plannedFor ?? '') || byId(a, b))

  const groups: DayGroup[] = []
  for (const note of future) {
    const day = note.plannedFor ?? ''
    const last = groups.at(-1)
    if (last && last.day === day) last.notes.push(note)
    else groups.push({ day, notes: [note] })
  }
  return groups
}

/**
 * Сделано сегодня, но не из сегодняшнего плана: в «Заметках», из хвоста,
 * заранее. Иначе сделанное пропадало бы из виду молча.
 */
export function doneOffPlan(notes: readonly Note[], today: DateStr): Note[] {
  return notes
    .filter((note) => !note.deleted && note.status === 'done' && note.doneOn === today && note.plannedFor !== today)
    .sort(byId)
}

/** Сколько открытых записей стоит в плане на любой день — в неразобранном их нет, и это сказано числом. */
export function plannedCount(notes: readonly Note[]): number {
  return notes.filter((note) => !note.deleted && note.status === 'open' && note.plannedFor !== null).length
}

// ─── Реализм (Р-35) ────────────────────────────────────────────────────────

export type PlanLoad = {
  /** Сумма оценок, минут. */
  minutes: number
  /** У скольких открытых пунктов оценка есть. */
  estimated: number
  /** Сколько открытых пунктов всего. */
  total: number
}

/** Сумма оценок открытых пунктов — с основанием: по скольким из скольких. */
export function planLoad(items: readonly Note[]): PlanLoad {
  const open = items.filter((item) => item.status === 'open')
  const estimated = open.filter((item) => item.estMin !== undefined)
  return {
    minutes: estimated.reduce((sum, item) => sum + (item.estMin ?? 0), 0),
    estimated: estimated.length,
    total: open.length,
  }
}

export type Realism = PlanLoad & {
  /** Сколько минут осталось до конца окна дня. */
  left: number
  /** На сколько минут не влезает; ноль — влезает. */
  over: number
}

/**
 * Влезает ли намеченное в остаток дня. Null — открытых пунктов нет,
 * говорить не о чем. `left` считает экран: окно дня — дело учёта времени,
 * а модули друг о друге не знают.
 */
export function realism(items: readonly Note[], left: number): Realism | null {
  const load = planLoad(items)
  if (load.total === 0) return null
  return { ...load, left, over: Math.max(0, load.minutes - left) }
}
