import { describe, expect, it } from 'vitest'
import { monthPeriod, weekPeriod } from '../../shared/core/dates.ts'
import type { Note } from '../../app/model.ts'
import { goalsPeriod } from './goalPeriod.ts'
import { noteRef } from './inbox.ts'
import { goalMoveText, goalsStillText, goalsUndatedText } from './labels.ts'

function note(id: string, over: Partial<Note> = {}): Note {
  return {
    id,
    updatedAt: '2026-10-11T10:00:00.000Z',
    text: `Запись ${id}`,
    kind: 'task',
    capturedOn: '2026-10-07',
    plannedFor: null,
    status: 'open',
    ...over,
  }
}

const goal = (id: string, text: string, over: Partial<Note> = {}) =>
  note(id, { kind: 'goal', text, capturedOn: '2026-09-01', ...over })
const of = (goalId: string, id: string, over: Partial<Note> = {}) => note(id, { refs: [noteRef(goalId)], ...over })

/** Неделя с понедельника 5 по воскресенье 11 октября 2026. */
const week = weekPeriod('2026-10-08')

describe('замыслы за промежуток — Р-104', () => {
  it('неделя — с понедельника, как у обзора', () => {
    expect(week).toEqual({ from: '2026-10-05', to: '2026-10-11' })
  })

  it('сделано — по дню выполнения, записано — по дню записи', () => {
    const notes = [
      goal('g', 'Испанский'),
      // Записано раньше, сделано на неделе: только «сделано».
      of('g', 'a', { capturedOn: '2026-09-20', status: 'done', doneOn: '2026-10-06' }),
      // Записано и сделано на неделе: и то и другое.
      of('g', 'b', { capturedOn: '2026-10-05', status: 'done', doneOn: '2026-10-11' }),
      // Записано на неделе, открыто.
      of('g', 'c', { capturedOn: '2026-10-09' }),
      // Записано на неделе, сделано позже: только «записано».
      of('g', 'd', { capturedOn: '2026-10-10', status: 'done', doneOn: '2026-10-12' }),
      of('g', 't', { kind: 'thought', capturedOn: '2026-10-08' }),
      // Мысль прошлой недели — мимо.
      of('g', 'u', { kind: 'thought', capturedOn: '2026-10-04' }),
    ]
    const result = goalsPeriod(notes, week)
    expect(result.goals).toBe(1)
    expect(result.moves).toHaveLength(1)
    expect(result.moves[0]).toMatchObject({ done: 2, tasks: 3, thoughts: 1, reached: false })
    expect(goalMoveText(result.moves[0]!)).toBe('сделано дел 2 · записано дел 3 · мыслей 1')
  })

  it('нулевые части не пишутся', () => {
    const base = { goal: goal('g', 'Испанский'), done: 0, tasks: 0, thoughts: 0, reached: false }
    expect(goalMoveText({ ...base, done: 1 })).toBe('сделано дел 1')
    expect(goalMoveText({ ...base, thoughts: 2 })).toBe('записано мыслей 2')
    expect(goalMoveText({ ...base, tasks: 1 })).toBe('записано дел 1')
    expect(goalMoveText({ ...base, reached: true })).toBe('достигнут')
    expect(goalMoveText({ ...base, done: 1, thoughts: 2, reached: true })).toBe('сделано дел 1 · записано мыслей 2 · достигнут')
  })

  it('замысел, достигнутый в промежутке, — в блоке с пометкой, даже без дел', () => {
    const notes = [
      goal('g', 'Испанский', { status: 'done', doneOn: '2026-10-07' }),
      goal('h', 'Марафон', { status: 'done', doneOn: '2026-09-30' }),
    ]
    const result = goalsPeriod(notes, week)
    expect(result.goals).toBe(2)
    expect(result.moves.map((move) => [move.goal.id, move.reached])).toEqual([['g', true]])
  })

  it('без движения — пусто, но замыслы есть; замыслов нет — ноль', () => {
    const still = goalsPeriod([goal('g', 'Испанский'), of('g', 'a', { capturedOn: '2026-09-01' })], week)
    expect(still).toMatchObject({ goals: 1, moves: [] })
    expect(goalsStillText('неделю')).toBe('За неделю по замыслам движения нет')
    expect(goalsStillText('месяц')).toBe('За месяц по замыслам движения нет')

    expect(goalsPeriod([note('a'), note('t', { kind: 'thought' })], week).goals).toBe(0)
    // Удалённый замысел — не замысел.
    expect(goalsPeriod([goal('g', 'Испанский', { deleted: true })], week).goals).toBe(0)
  })

  it('удалённые и отброшенные записи и записи без замысла не считаются', () => {
    const notes = [
      goal('g', 'Испанский'),
      of('g', 'a', { deleted: true }),
      of('g', 'b', { status: 'dropped' }),
      note('c'),
      // Дело удалённого замысла — его замысла нет.
      of('x', 'd'),
      goal('x', 'Удалённый', { deleted: true }),
    ]
    expect(goalsPeriod(notes, week).moves).toEqual([])
  })

  it('без даты — в счёт не идут и названы числом', () => {
    const notes = [
      goal('g', 'Испанский'),
      of('g', 'a', { capturedOn: null }),
      of('g', 'b', { kind: 'thought', capturedOn: null }),
      // Сделано, а дня выполнения нет: «сделано» не посчитать.
      of('g', 'c', { capturedOn: '2026-09-01', status: 'done' }),
      // Кривая дата — как без даты.
      of('g', 'd', { capturedOn: '2026-13-01' }),
      of('g', 'e', { capturedOn: '2026-10-06' }),
    ]
    const result = goalsPeriod(notes, week)
    expect(result.undated).toBe(4)
    expect(result.moves[0]).toMatchObject({ done: 0, tasks: 1, thoughts: 0 })
    expect(goalsUndatedText(result.undated)).toBe('Без даты — 4 записи замыслов: в счёт не идут')
  })

  it('месяц — календарный', () => {
    const notes = [
      goal('g', 'Испанский'),
      of('g', 'a', { capturedOn: '2026-09-30' }),
      of('g', 'b', { capturedOn: '2026-10-01' }),
      of('g', 'c', { capturedOn: '2026-10-31' }),
      of('g', 'd', { capturedOn: '2026-11-01' }),
    ]
    expect(goalsPeriod(notes, monthPeriod('2026-10')).moves[0]).toMatchObject({ tasks: 2 })
  })

  it('больше движения — выше; при равном — по названию', () => {
    const notes = [
      goal('a', 'Яхта'),
      goal('b', 'Арфа'),
      goal('c', 'Марафон'),
      of('a', '1'),
      of('b', '2'),
      of('c', '3'),
      of('c', '4', { kind: 'thought' }),
    ]
    expect(goalsPeriod(notes, week).moves.map((move) => move.goal.id)).toEqual(['c', 'b', 'a'])
  })
})
