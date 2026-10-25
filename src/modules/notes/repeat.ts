/**
 * Повтор дела (Р-106): правило у дела-образца, пункты дней — обычные дела.
 *
 * Образец — заметка с полем `repeat`: не в плане, не в неразобранном, свой
 * блок «Повторы» на «Заметках». Пункт дня встаёт, когда открыт план этого
 * дня — сегодня; прошлые дни задним числом не заполняются. id пункта —
 * `<id образца>:<день>`: два устройства заводят одну и ту же запись, и после
 * синхронизации она одна. Штамп `updatedAt` у порождённого — неподвижный
 * и старый, как у стартовых категорий: любая настоящая правка — «сделано»,
 * перенос, удаление — при встрече его побеждает, и удалённый пункт
 * не возвращается.
 *
 * Чистые функции, без React и без базы (02-Архитектура, «Структура кода»).
 */

import { daysBetween, formatDate, isDateStr, lastDayOf, plural, weekStart, type DateStr } from '../../shared/core/dates.ts'
import type { Note, NoteRepeat } from '../../app/model.ts'
import { compareNotes } from './inbox.ts'
import { withoutMain } from './plan.ts'

/** Как часто — в порядке переключателя. */
export const REPEAT_EVERY: readonly NoteRepeat['every'][] = ['days', 'week', 'month']

/** Подписи переключателя. */
export const EVERY_NAMES: Record<NoteRepeat['every'], string> = {
  days: 'Каждые N дней',
  week: 'По дням недели',
  month: 'Каждый месяц',
}

/** Дни недели по порядку, с понедельника: номер в правиле — место здесь плюс один. */
export const WEEKDAY_NAMES: readonly string[] = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
export const DAYS_PER_WEEK = WEEKDAY_NAMES.length

/** «Каждый пн», «каждую ср», «каждое вс» — по роду полного названия дня. */
const EVERY_WEEKDAY: readonly string[] = ['каждый', 'каждый', 'каждую', 'каждый', 'каждую', 'каждую', 'каждое']

/** Реже раза в год «каждые N дней» не ставится: такое — месяцем или вовсе не повтор. */
export const MAX_STEP = 365

/** Самое большое число месяца; в коротком месяце — последний день. */
export const MAX_MONTH_DAY = 31

/**
 * Штамп порождённого пункта. Старше любой настоящей правки: пункт, который
 * второе устройство отметило, перенесло или удалило, при встрече побеждает.
 */
export const REPEAT_STAMP = '2000-01-01T00:00:00.000Z'

/** Ссылка пункта на свой образец в `refs`. */
const REPEAT_REF = 'repeat:'

// ─── Правило дат ───────────────────────────────────────────────────────────

/** День недели: 1 — понедельник … 7 — воскресенье. */
export function weekdayOf(day: DateStr): number {
  return daysBetween(weekStart(day), day) + 1
}

function isWhole(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

/**
 * Правило, если оно читается. Null — поля нет или оно кривое: приехало
 * со сборки, которой ещё нет, или испорчено руками. Такой образец пунктов
 * не порождает.
 */
export function ruleOf(note: Note): NoteRepeat | null {
  const rule = note.repeat
  if (rule === undefined || typeof rule !== 'object' || rule === null) return null
  if (typeof rule.from !== 'string' || !isDateStr(rule.from)) return null
  if (rule.until !== undefined && (typeof rule.until !== 'string' || !isDateStr(rule.until) || rule.until < rule.from)) {
    return null
  }
  if (rule.every === 'days') return isWhole(rule.step, 1, MAX_STEP) ? rule : null
  if (rule.every === 'week') {
    const days = rule.weekdays
    return Array.isArray(days) && days.length > 0 && days.every((each) => isWhole(each, 1, DAYS_PER_WEEK)) ? rule : null
  }
  if (rule.every === 'month') return isWhole(rule.monthDay, 1, MAX_MONTH_DAY) ? rule : null
  return null
}

/**
 * Выпадает ли повтор на день. Раньше `from` и позже `until` — нет.
 * «Месяц 31-го» в месяце короче — последний день месяца.
 */
export function fallsOn(rule: NoteRepeat, day: DateStr): boolean {
  if (!isDateStr(day) || day < rule.from || (rule.until !== undefined && day > rule.until)) return false
  switch (rule.every) {
    case 'days':
      return rule.step !== undefined && daysBetween(rule.from, day) % rule.step === 0
    case 'week':
      return (rule.weekdays ?? []).includes(weekdayOf(day))
    case 'month': {
      const last = Number(lastDayOf(day.slice(0, 7)).slice(8))
      return Number(day.slice(8)) === Math.min(rule.monthDay ?? 0, last)
    }
  }
}

// ─── Образцы и пункты ──────────────────────────────────────────────────────

/**
 * Образец повтора: живое открытое дело с правилом. Правило кривое — образец
 * всё равно в «Повторах», а не пропадает молча; пунктов он не порождает.
 */
export function isPattern(note: Note): boolean {
  return !note.deleted && note.kind === 'task' && note.status === 'open' && note.repeat !== undefined
}

/** Повторы в порядке экрана — блок «Повторы» на «Заметках». */
export function patternsOf(notes: readonly Note[]): Note[] {
  return notes.filter(isPattern).sort(compareNotes)
}

/** id пункта дня — из образца и дня: на двух устройствах он один. */
export function occurrenceId(patternId: string, day: DateStr): string {
  return `${patternId}:${day}`
}

export function repeatRef(patternId: string): string {
  return `${REPEAT_REF}${patternId}`
}

/** id образца, из которого встал пункт. Null — пункт не из повтора. */
export function patternIdOf(note: Note): string | null {
  const ref = note.refs?.find((each) => each.startsWith(REPEAT_REF))
  return ref === undefined ? null : ref.slice(REPEAT_REF.length)
}

/** Образец пункта — живой повтор. Остановленный не показывается: ссылка молчит. */
export function patternOf(note: Note, notes: readonly Note[]): Note | null {
  const id = patternIdOf(note)
  if (id === null) return null
  return notes.find((each) => each.id === id && isPattern(each)) ?? null
}

/**
 * Пункт дня из образца: текст, оценка и «главное» — как у повтора; замысел
 * образца — тоже. Записан в свой день: в раскладке он ляжет в один и тот же
 * месячный файл на любом устройстве.
 */
export function occurrence(pattern: Note, day: DateStr): Note {
  const goals = (pattern.refs ?? []).filter((each) => !each.startsWith(REPEAT_REF))
  return {
    id: occurrenceId(pattern.id, day),
    updatedAt: REPEAT_STAMP,
    text: pattern.text,
    kind: 'task',
    capturedOn: day,
    plannedFor: day,
    status: 'open',
    ...(pattern.estMin !== undefined ? { estMin: pattern.estMin } : {}),
    ...(pattern.main ? { main: true } : {}),
    refs: [...goals, repeatRef(pattern.id)],
  }
}

/**
 * Пункты повторов, которых в дне ещё нет, — встают, когда открыт план дня.
 * Есть запись с тем же id — живая или удалённая — пункт не ставится:
 * удалённый сам не возвращается. Записывать — слиянием с этим штампом:
 * надгробие на устройстве его не пропустит.
 */
export function dueOccurrences(notes: readonly Note[], day: DateStr): Note[] {
  const taken = new Set(notes.map((note) => note.id))
  return patternsOf(notes).flatMap((pattern) => {
    const rule = ruleOf(pattern)
    const id = occurrenceId(pattern.id, day)
    return rule !== null && fallsOn(rule, day) && !taken.has(id) ? [occurrence(pattern, day)] : []
  })
}

// ─── Правки ────────────────────────────────────────────────────────────────

/**
 * Дело становится образцом: из плана уходит, период, место в дне и день
 * выполнения снимаются. «Главное» остаётся — оно перейдёт пунктам.
 */
export function toPattern(note: Note, rule: NoteRepeat): Note {
  const { plannedTo: _plannedTo, order: _order, doneOn: _doneOn, ...rest } = note
  return { ...rest, kind: 'task', plannedFor: null, status: 'open', repeat: rule }
}

/** «Главное» у образца — отметка перейдёт его пунктам. */
export function withPatternMain(pattern: Note, main: boolean): Note {
  return main ? { ...pattern, main: true } : withoutMain(pattern)
}

/** Пункты повтора с сегодняшнего дня, ещё не отмеченные, — их меняет правка повтора. */
function pendingOf(pattern: Note, notes: readonly Note[], today: DateStr): Note[] {
  return notes.filter(
    (note) =>
      !note.deleted &&
      note.status === 'open' &&
      patternIdOf(note) === pattern.id &&
      note.plannedFor !== null &&
      isDateStr(note.plannedFor) &&
      note.plannedFor >= today,
  )
}

function sameRule(a: NoteRepeat | undefined, b: NoteRepeat | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

/**
 * Правка повтора: новый образец и его пункты с сегодняшнего дня, ещё
 * не отмеченные. Пунктам переходит то, что поменялось, — текст, оценка,
 * «главное»; своё у пункта остаётся. Пункт, который больше не выпадает
 * по новому правилу, убирается — кроме перенесённого рукой: его день выбран
 * человеком. Прошлые и сделанные — как были. Возвращает, что записать.
 */
export function editPattern(before: Note, after: Note, notes: readonly Note[], today: DateStr): Note[] {
  const rule = ruleOf(after)
  const ruleChanged = !sameRule(before.repeat, after.repeat)
  const changed: Note[] = []

  for (const item of pendingOf(before, notes, today)) {
    const day = item.plannedFor ?? ''
    const moved = item.id !== occurrenceId(before.id, day)
    if (ruleChanged && !moved && (rule === null || !fallsOn(rule, day))) {
      changed.push({ ...item, deleted: true })
      continue
    }
    let next = item
    if (after.text !== before.text) next = { ...next, text: after.text }
    if (after.estMin !== before.estMin) {
      if (after.estMin === undefined) {
        const { estMin: _estMin, ...rest } = next
        next = rest
      } else {
        next = { ...next, estMin: after.estMin }
      }
    }
    if (Boolean(after.main) !== Boolean(before.main)) next = after.main ? { ...next, main: true } : withoutMain(next)
    if (next !== item) changed.push(next)
  }

  return after === before ? changed : [after, ...changed]
}

/**
 * «Остановить повтор»: образец удаляется, новых пунктов нет; его пункты
 * с сегодняшнего дня, ещё не отмеченные, убираются. Прошлые и сделанные
 * остаются. Возвращает, что записать.
 */
export function stopPattern(pattern: Note, notes: readonly Note[], today: DateStr): Note[] {
  return [pattern, ...pendingOf(pattern, notes, today)].map((note) => ({ ...note, deleted: true }))
}

// ─── Форма правила ─────────────────────────────────────────────────────────

/** Правило в правке: числа — строками полей, как их вводят. */
export type RuleDraft = {
  from: string
  until: string
  every: NoteRepeat['every']
  step: string
  weekdays: number[]
  monthDay: string
}

/**
 * Правка правила. Нового — с `from`: по дням недели, в тот же день недели;
 * «каждые N дней» — каждый день; месяц — того же числа.
 */
export function draftOfRule(rule: NoteRepeat | null, from: DateStr): RuleDraft {
  const start = rule?.from ?? from
  return {
    from: start,
    until: rule?.until ?? '',
    every: rule?.every ?? 'week',
    step: String(rule?.step ?? 1),
    weekdays: rule?.weekdays ?? [weekdayOf(start)],
    monthDay: String(rule?.monthDay ?? Number(start.slice(8))),
  }
}

/** Выбрать или снять день недели. Порядок — с понедельника. */
export function toggleWeekday(days: readonly number[], day: number): number[] {
  return days.includes(day) ? days.filter((each) => each !== day) : [...days, day].sort((a, b) => a - b)
}

function readWhole(text: string, min: number, max: number): number | null {
  const trimmed = text.trim()
  const value = Number(trimmed)
  return /^\d+$/.test(trimmed) && value >= min && value <= max ? value : null
}

/** Правка → правило. Кривое — причина с пределами. */
export function readRule(draft: RuleDraft): { rule: NoteRepeat } | { error: string } {
  if (!isDateStr(draft.from)) return { error: 'Нет дня, с которого повторять' }
  const until = draft.until.trim()
  if (until !== '' && (!isDateStr(until) || until < draft.from)) {
    return { error: '«До какого дня» — не раньше первого дня' }
  }
  const base: NoteRepeat = { from: draft.from, every: draft.every, ...(until !== '' ? { until } : {}) }

  switch (draft.every) {
    case 'days': {
      const step = readWhole(draft.step, 1, MAX_STEP)
      if (step === null) return { error: `Каждые сколько дней — целое число от 1 до ${MAX_STEP}` }
      return { rule: { ...base, step } }
    }
    case 'week': {
      const weekdays = [...new Set(draft.weekdays)].filter((day) => isWhole(day, 1, DAYS_PER_WEEK)).sort((a, b) => a - b)
      if (weekdays.length === 0) return { error: 'Не выбран ни один день недели' }
      return { rule: { ...base, weekdays } }
    }
    case 'month': {
      const monthDay = readWhole(draft.monthDay, 1, MAX_MONTH_DAY)
      if (monthDay === null) return { error: `Число месяца — от 1 до ${MAX_MONTH_DAY}` }
      return { rule: { ...base, monthDay } }
    }
  }
}

// ─── Словами ───────────────────────────────────────────────────────────────

/** «01.11». */
function shortDay(day: string): string {
  return isDateStr(day) ? formatDate(day).slice(0, 5) : day
}

/** «Каждый» или «каждые» по числу: «каждый 21 день», «каждые 3 дня». */
function everyDays(step: number): string {
  if (step === 1) return 'каждый день'
  const one = step % 10 === 1 && step % 100 !== 11
  return `${one ? 'каждый' : 'каждые'} ${step} ${plural(step, ['день', 'дня', 'дней'])}`
}

/** Как часто словами: «каждый пн», «по пн, ср, пт», «каждые 3 дня», «каждый месяц 5-го». */
export function everyText(rule: NoteRepeat): string {
  switch (rule.every) {
    case 'days':
      return everyDays(rule.step ?? 1)
    case 'week': {
      const days = [...(rule.weekdays ?? [])].sort((a, b) => a - b)
      if (days.length === DAYS_PER_WEEK) return 'каждый день'
      const names = days.map((day) => WEEKDAY_NAMES[day - 1] ?? '')
      const first = days[0]
      if (days.length === 1 && first !== undefined) return `${EVERY_WEEKDAY[first - 1] ?? 'каждый'} ${names[0]}`
      return `по ${names.join(', ')}`
    }
    case 'month':
      return `каждый месяц ${rule.monthDay ?? ''}-го`
  }
}

/** Правило словами: «каждый пн, с 01.11», «… до 31.12». */
export function ruleText(rule: NoteRepeat): string {
  const until = rule.until !== undefined ? `, до ${shortDay(rule.until)}` : ''
  return `${everyText(rule)}, с ${shortDay(rule.from)}${until}`
}

/** Строка образца в блоке «Повторы»; кривое правило — так и сказано. */
export function patternLine(note: Note): string {
  const rule = ruleOf(note)
  return rule === null ? 'правило не читается' : ruleText(rule)
}
