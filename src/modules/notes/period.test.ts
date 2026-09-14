import { describe, expect, it } from 'vitest'
import type { Note } from '../../core/model.ts'
import { planFact, plannedIn } from './period.ts'

const WEEK = { from: '2026-09-07', to: '2026-09-13' }
/** Среда недели: понедельник и вторник прошли, четверг впереди. */
const WEDNESDAY = '2026-09-09'

function note(id: string, over: Partial<Note> = {}): Note {
  return {
    id,
    updatedAt: '2026-09-09T08:00:00.000Z',
    text: `пункт ${id}`,
    kind: 'task',
    capturedOn: '2026-09-01',
    plannedFor: '2026-09-08',
    status: 'open',
    ...over,
  }
}

const ids = (list: readonly Note[]) => list.map((each) => each.id)

describe('пункты промежутка — Р-44', () => {
  it('по дню плана; удалённые, отложенные, неразобранные и чужие недели не в счёт', () => {
    const notes = [
      note('03'),
      note('01', { status: 'done', doneOn: '2026-09-08' }),
      note('02', { deleted: true }),
      note('04', { status: 'someday' }),
      note('05', { plannedFor: null }),
      note('06', { plannedFor: '2026-09-14' }),
      note('07', { plannedFor: 'когда-то' }),
    ]
    expect(ids(plannedIn(notes, WEEK))).toEqual(['01', '03'])
  })
})

describe('план против факта — Р-44', () => {
  it('сделано из намеченного, позже своего дня; открытые — в хвосте или впереди', () => {
    const fact = planFact(
      [
        note('01', { status: 'done', doneOn: '2026-09-08' }),
        // Из хвоста: намечено на понедельник, сделано в среду.
        note('02', { plannedFor: '2026-09-07', status: 'done', doneOn: WEDNESDAY }),
        note('03', { plannedFor: '2026-09-07' }),
        note('04', { plannedFor: WEDNESDAY }),
        note('05', { plannedFor: '2026-09-11' }),
      ],
      WEEK,
      WEDNESDAY,
    )
    // Среда — сегодня: её открытый пункт «на сегодня», а не «впереди» (Р-76).
    expect(fact).toMatchObject({ planned: 5, done: 2, late: 1, waiting: 1, today: 1, ahead: 1 })
  })

  it('главное — по дням, где выбрано; при двух отметках — позднее (Р-40)', () => {
    const fact = planFact(
      [
        note('01', { plannedFor: '2026-09-07', main: true, status: 'done', doneOn: '2026-09-07' }),
        note('02', { plannedFor: '2026-09-08', main: true }),
        note('03', { plannedFor: '2026-09-09', main: true, updatedAt: '2026-09-09T09:00:00.000Z', status: 'done' }),
        note('04', { plannedFor: '2026-09-09', main: true, updatedAt: '2026-09-09T07:00:00.000Z' }),
        note('05', { plannedFor: '2026-09-10' }),
      ],
      WEEK,
      WEDNESDAY,
    )
    expect(fact).toMatchObject({ mainDays: 3, mainDone: 2 })
  })

  it('оценки — сумма намеченного и сделанного по пунктам с оценкой', () => {
    const fact = planFact(
      [
        note('01', { estMin: 60, status: 'done' }),
        note('02', { estMin: 30 }),
        note('03'),
      ],
      WEEK,
      WEDNESDAY,
    )
    expect(fact).toMatchObject({ estimated: 2, estPlanned: 90, estDone: 60 })
  })

  it('повторы — одинаковый текст в разные дни; регистр и пробелы не в счёт', () => {
    const fact = planFact(
      [
        note('01', { text: 'Зарядка', plannedFor: '2026-09-07', status: 'done' }),
        note('02', { text: 'зарядка ', plannedFor: '2026-09-08' }),
        note('03', { text: 'Зарядка', plannedFor: '2026-09-09', status: 'done' }),
        note('04', { text: 'Звонок', plannedFor: '2026-09-09' }),
        note('05', { text: 'Звонок', plannedFor: '2026-09-09' }),
      ],
      WEEK,
      WEDNESDAY,
    )
    // «Звонок» дважды в один день — один день, не повтор.
    expect(fact.repeats).toEqual([{ text: 'Зарядка', days: 3, done: 2 }])
  })

  it('пустая неделя — нули, а не падение', () => {
    expect(planFact([], WEEK, WEDNESDAY)).toMatchObject({ planned: 0, done: 0, mainDays: 0, estimated: 0, repeats: [] })
  })
})
