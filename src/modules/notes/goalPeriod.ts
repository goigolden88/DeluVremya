/**
 * Замыслы за промежуток дней — блок «Замыслы» обзора недели и итогов месяца
 * (Р-104): что сдвинулось по каждому замыслу.
 *
 * Сделано дело — по `doneOn`, записано дело или мысль — по `capturedOn`,
 * достигнут — замысел с `status: 'done'` и `doneOn` в промежутке. Дела
 * и мысли — живые и не отброшенные, как в счёте у замысла (Р-102). Запись
 * без даты в счёт не идёт, и это названо числом. Время по замыслам
 * не считается.
 *
 * Промежуток, а не неделя: тот же расчёт у недели и у месяца (как Р-52).
 * Чистые функции, без React и без базы (02-Архитектура, «Структура кода»).
 */

import { inPeriod, isDateStr, type Period } from '../../shared/core/dates.ts'
import type { Note } from '../../app/model.ts'
import { tasksOfGoal, thoughtsOfGoal } from './inbox.ts'
import { goalTitle } from './goal.ts'

/** Движение одного замысла за промежуток. */
export type GoalMove = {
  goal: Note
  /** Дел сделано: `doneOn` в промежутке. */
  done: number
  /** Дел записано: `capturedOn` в промежутке. */
  tasks: number
  /** Мыслей записано: `capturedOn` в промежутке. */
  thoughts: number
  /** Замысел достигнут в промежутке. */
  reached: boolean
}

export type GoalsPeriod = {
  /** Замыслов всего — живых, в любом состоянии. Ноль — блока нет. */
  goals: number
  /** Замыслы с движением: больше движения — выше, при равном — по названию. */
  moves: GoalMove[]
  /** Записей замыслов без даты: дат записи или выполнения нет — в счёт не идут. */
  undated: number
}

const dated = (day: string | null | undefined): boolean => typeof day === 'string' && isDateStr(day)
const within = (day: string | null | undefined, period: Period): boolean => typeof day === 'string' && inPeriod(day, period)

/** Сколько всего сдвинулось — для порядка строк. */
const weight = (move: GoalMove) => move.done + move.tasks + move.thoughts + (move.reached ? 1 : 0)

export function goalsPeriod(notes: readonly Note[], period: Period): GoalsPeriod {
  const goals = notes.filter((note) => !note.deleted && note.kind === 'goal')
  let undated = 0
  const moves: GoalMove[] = []

  for (const goal of goals) {
    const tasks = tasksOfGoal(goal.id, notes)
    const thoughts = thoughtsOfGoal(goal.id, notes)
    // Сделанное дело без дня выполнения или запись без дня записи — дата неизвестна.
    undated += [...tasks, ...thoughts].filter(
      (note) => !dated(note.capturedOn) || (note.status === 'done' && !dated(note.doneOn)),
    ).length

    const move: GoalMove = {
      goal,
      done: tasks.filter((task) => task.status === 'done' && within(task.doneOn, period)).length,
      tasks: tasks.filter((task) => within(task.capturedOn, period)).length,
      thoughts: thoughts.filter((thought) => within(thought.capturedOn, period)).length,
      reached: goal.status === 'done' && within(goal.doneOn, period),
    }
    if (weight(move) > 0) moves.push(move)
  }

  moves.sort((a, b) => weight(b) - weight(a) || goalTitle(a.goal).localeCompare(goalTitle(b.goal), 'ru'))
  return { goals: goals.length, moves, undated }
}
