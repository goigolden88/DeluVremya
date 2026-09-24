/**
 * План против факта за промежуток дней (Р-44).
 *
 * Пункт относится к промежутку по `plannedFor`; сделанное — в какой бы день
 * ни сделано, `doneOn` — день факта. Удалённые не считаются: надгробием
 * уходят и пункты, снятые «Отменить» после шаблона. Перенесённый считается
 * днём, на котором стоит сейчас: прежнего дня запись не помнит (Р-38).
 *
 * Промежуток, а не неделя: на тех же расчётах встанут месяц и год (Р-52).
 * Чистые функции, без React и без базы (02-Архитектура, «Структура кода»).
 */

import { inPeriod, type DateStr, type Period } from '../../shared/core/dates.ts'
import type { Note } from '../../app/model.ts'
import { normalize } from './inbox.ts'
import { mainOf } from './plan.ts'

/** Пункты плана промежутка: живые, открытые или сделанные, по порядку добавления. */
export function plannedIn(notes: readonly Note[], period: Period): Note[] {
  return notes
    .filter(
      (note) =>
        !note.deleted &&
        note.plannedFor !== null &&
        inPeriod(note.plannedFor, period) &&
        (note.status === 'open' || note.status === 'done'),
    )
    .sort((a, b) => a.id.localeCompare(b.id))
}

/** Одинаковый текст в разные дни — так видны привычки из шаблонов (Р-03, Р-39). */
export type Repeat = {
  /** Текст первого такого пункта. */
  text: string
  /** В скольких днях стоял. */
  days: number
  /** В скольких из них сделан. */
  done: number
}

/** Как считается план против факта (Р-44): число не врёт молча. */
export const PLAN_FACT_BASIS = 'Пункт считается днём, на котором стоит сейчас; удалённые не считаются.'

/** С какого числа дней одинаковый пункт считается повтором. */
export const REPEAT_FROM = 2

export type PlanFact = {
  /** Намечено: живые пункты промежутка. */
  planned: number
  done: number
  /** Сделано позже своего дня — например, из хвоста. */
  late: number
  /** Открытые, чей день прошёл: ждут решения в хвосте (Р-34). */
  waiting: number
  /** Открытые сегодняшнего дня: он не кончился, это не хвост и не «впереди» (Р-76). */
  today: number
  /** Открытые, чей день ещё не настал. */
  ahead: number
  /** В скольких днях главное было выбрано (Р-40) и в скольких сделано. */
  mainDays: number
  mainDone: number
  /** Сколько пунктов с оценкой — основание сумм ниже (Р-35). */
  estimated: number
  /** Сумма оценок всех пунктов с оценкой и сделанных из них, минут. */
  estPlanned: number
  estDone: number
  repeats: Repeat[]
}

const sumEstimates = (list: readonly Note[]) => list.reduce((sum, note) => sum + (note.estMin ?? 0), 0)

export function planFact(notes: readonly Note[], period: Period, today: DateStr): PlanFact {
  const items = plannedIn(notes, period)
  const done = items.filter((note) => note.status === 'done')
  const open = items.filter((note) => note.status === 'open')

  const byDay = new Map<string, Note[]>()
  for (const item of items) {
    const day = item.plannedFor ?? ''
    byDay.set(day, [...(byDay.get(day) ?? []), item])
  }
  let mainDays = 0
  let mainDone = 0
  for (const list of byDay.values()) {
    const main = mainOf(list)
    if (!main) continue
    mainDays += 1
    if (main.status === 'done') mainDone += 1
  }

  // Регистр, «ё» и лишние пробелы не в счёт — как при применении шаблона.
  const groups = new Map<string, { text: string; days: Set<string>; done: Set<string> }>()
  for (const item of items) {
    const key = normalize(item.text)
    const group = groups.get(key) ?? { text: item.text, days: new Set<string>(), done: new Set<string>() }
    group.days.add(item.plannedFor ?? '')
    if (item.status === 'done') group.done.add(item.plannedFor ?? '')
    groups.set(key, group)
  }
  const repeats = [...groups.values()]
    .filter((group) => group.days.size >= REPEAT_FROM)
    .map((group) => ({ text: group.text, days: group.days.size, done: group.done.size }))
    .sort((a, b) => b.days - a.days || a.text.localeCompare(b.text, 'ru'))

  const estimated = items.filter((note) => note.estMin !== undefined)

  return {
    planned: items.length,
    done: done.length,
    late: done.filter((note) => note.doneOn !== undefined && note.plannedFor !== null && note.doneOn > note.plannedFor)
      .length,
    waiting: open.filter((note) => (note.plannedFor ?? '') < today).length,
    today: open.filter((note) => note.plannedFor === today).length,
    ahead: open.filter((note) => (note.plannedFor ?? '') > today).length,
    mainDays,
    mainDone,
    estimated: estimated.length,
    estPlanned: sumEstimates(estimated),
    estDone: sumEstimates(estimated.filter((note) => note.status === 'done')),
    repeats,
  }
}
