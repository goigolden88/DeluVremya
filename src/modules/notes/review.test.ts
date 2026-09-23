import { describe, expect, it } from 'vitest'
import type { Note } from '../../app/model.ts'
import { isUnsorted, noteRef } from './inbox.ts'
import { fromSomeday, recall, RECALL_WEEKS, somedayOf, staleTasks, stuckGoals, withSomeday } from './review.ts'

const TODAY = '2026-09-13'

function note(id: string, over: Partial<Note> = {}): Note {
  return {
    id,
    updatedAt: '2026-09-13T08:00:00.000Z',
    text: `запись ${id}`,
    kind: 'task',
    capturedOn: '2026-08-01',
    plannedFor: null,
    status: 'open',
    ...over,
  }
}

const ids = (list: readonly Note[]) => list.map((each) => each.id)

describe('висяки — Р-46', () => {
  it('дела неразобранного не моложе порога, старые первыми', () => {
    const notes = [
      note('01', { capturedOn: '2026-08-14' }), // ровно тридцать дней
      note('02', { capturedOn: '2026-08-15' }), // двадцать девять
      note('03', { capturedOn: '2026-07-01' }),
      note('04', { capturedOn: '2026-07-01', kind: 'thought' }),
      note('05', { capturedOn: '2026-07-01', kind: 'goal' }),
      note('06', { capturedOn: '2026-07-01', plannedFor: TODAY }),
      note('07', { capturedOn: null }),
      note('08', { capturedOn: '2026-07-01', status: 'someday' }),
    ]
    expect(ids(staleTasks(notes, TODAY, 30))).toEqual(['03', '01'])
  })

  it('«когда-нибудь» уводит из неразобранного и плана, «Вернуть» — обратно', () => {
    const later = withSomeday(note('01', { plannedFor: TODAY, main: true }))
    expect(later).toMatchObject({ status: 'someday', plannedFor: null })
    expect('main' in later).toBe(false)
    expect(isUnsorted(later)).toBe(false)
    expect(isUnsorted(fromSomeday(later))).toBe(true)
  })

  it('отложенное — живое, в порядке экрана', () => {
    const notes = [
      note('01', { status: 'someday', capturedOn: '2026-08-01' }),
      note('02', { status: 'someday', capturedOn: '2026-09-01' }),
      note('03', { status: 'someday', deleted: true }),
      note('04'),
    ]
    expect(ids(somedayOf(notes))).toEqual(['02', '01'])
  })
})

describe('замыслы без движения — Р-47', () => {
  const goal = (id: string, capturedOn: string | null) => note(id, { kind: 'goal', capturedOn })

  it('без дел — от записи самого замысла', () => {
    const list = stuckGoals([goal('G1', '2026-08-01'), goal('G2', '2026-09-01')], TODAY, 28)
    expect(list).toEqual([{ goal: goal('G1', '2026-08-01'), since: '2026-08-01' }])
  })

  it('движение — запись или выполнение дела; удалённое дело не движение', () => {
    const old = goal('G1', '2026-06-01')
    const recent = note('T1', { capturedOn: '2026-07-01', status: 'done', doneOn: '2026-09-01', refs: [noteRef('G1')] })
    const deleted = note('T2', { capturedOn: '2026-09-10', refs: [noteRef('G1')], deleted: true })
    expect(stuckGoals([old, recent], TODAY, 28)).toEqual([])
    expect(stuckGoals([old, deleted], TODAY, 28)).toEqual([{ goal: old, since: '2026-06-01' }])
  })

  it('без единой даты — без движения; достигнутый — не здесь', () => {
    expect(stuckGoals([goal('G1', null)], TODAY, 28)).toEqual([{ goal: goal('G1', null), since: null }])
    expect(stuckGoals([{ ...goal('G2', '2026-01-01'), status: 'done' }], TODAY, 28)).toEqual([])
  })
})

describe('возврат мыслей — Р-49', () => {
  it('мысли той же недели столько-то недель назад; дела и без даты — нет', () => {
    // Неделя обзора — 07.09–13.09; четыре недели назад — 10.08–16.08.
    const notes = [
      note('01', { kind: 'thought', capturedOn: '2026-08-12' }),
      note('02', { kind: 'thought', capturedOn: '2026-08-10' }),
      note('03', { kind: 'thought', capturedOn: '2026-08-17' }),
      note('04', { kind: 'task', capturedOn: '2026-08-12' }),
      note('05', { kind: 'thought', capturedOn: null }),
      note('06', { kind: 'thought', capturedOn: '2026-06-10' }),
      note('07', { kind: 'thought', capturedOn: '2026-08-11', deleted: true }),
    ]
    const found = recall(notes, '2026-09-10')
    expect(found.map((each) => each.weeksAgo)).toEqual([...RECALL_WEEKS])
    expect(found[0]?.period).toEqual({ from: '2026-08-10', to: '2026-08-16' })
    expect(ids(found[0]?.notes ?? [])).toEqual(['02', '01'])
    // Тринадцать недель назад — 08.06–14.06.
    expect(ids(found[1]?.notes ?? [])).toEqual(['06'])
  })
})
