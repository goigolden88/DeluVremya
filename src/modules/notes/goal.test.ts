import { describe, expect, it } from 'vitest'
import type { Note } from '../../app/model.ts'
import { notesLink } from './feed.ts'
import {
  attachable,
  attachDetail,
  captureForGoal,
  entryDetail,
  findAttachable,
  findGoal,
  goalEntries,
  goalLink,
  goalTitle,
  goalVision,
} from './goal.ts'
import { goalIdOf, groupByMonth, isUnsorted, noteRef, queryWords, withGoal } from './inbox.ts'

function note(id: string, over: Partial<Note> = {}): Note {
  return {
    id,
    updatedAt: '2026-10-11T10:00:00.000Z',
    text: `Запись ${id}`,
    kind: 'task',
    capturedOn: '2026-10-10',
    plannedFor: null,
    status: 'open',
    ...over,
  }
}

const goal = note('g', { kind: 'goal', text: 'Выучить испанский\nЧитать книги без словаря\n\nЧерез год' })
const of = (id: string, over: Partial<Note> = {}) => note(id, { refs: [noteRef('g')], ...over })

describe('экран замысла — Р-103', () => {
  it('название — первая строка, видение — остальное', () => {
    expect(goalTitle(goal)).toBe('Выучить испанский')
    expect(goalVision(goal)).toBe('Читать книги без словаря\n\nЧерез год')
    expect(goalVision(note('x', { kind: 'goal', text: 'Одна строка' }))).toBe('')
  })

  it('адрес — #/goal/<id>', () => {
    expect(goalLink('01ABC')).toBe('/goal/01ABC')
  })

  it('замысел находится, пока он живой замысел — в работе или достигнут', () => {
    const done = note('d', { kind: 'goal', status: 'done', doneOn: '2026-10-11' })
    const notes = [goal, done, note('t'), note('x', { kind: 'goal', deleted: true })]
    expect(findGoal('g', notes)).toBe(goal)
    expect(findGoal('d', notes)).toBe(done)
    expect(findGoal('t', notes)).toBeNull()
    expect(findGoal('x', notes)).toBeNull()
    expect(findGoal('нет', notes)).toBeNull()
  })

  it('лента — дела и мысли замысла, свежие сверху, без даты внизу', () => {
    const notes = [
      goal,
      of('old', { capturedOn: '2026-09-01' }),
      of('new', { kind: 'thought', capturedOn: '2026-10-11' }),
      of('none', { capturedOn: null }),
      of('dropped', { status: 'dropped' }),
      of('gone', { deleted: true }),
      note('other'),
    ]
    const entries = goalEntries('g', notes)
    expect(entries.map((each) => each.id)).toEqual(['new', 'old', 'none'])
    expect(groupByMonth(entries).map((group) => group.month)).toEqual(['2026-10', '2026-09', null])
  })

  it('подпись: дело открыто, в плане, сделано; мысль', () => {
    expect(entryDetail(of('a'))).toBe('дело · открыто')
    expect(entryDetail(of('b', { plannedFor: '2026-10-15' }))).toBe('дело · в плане на 15.10')
    expect(entryDetail(of('c', { status: 'done', doneOn: '2026-10-14', plannedFor: '2026-10-12' }))).toBe(
      'дело · сделано 14.10',
    )
    expect(entryDetail(of('d', { kind: 'thought' }))).toBe('мысль')
  })

  it('переход на «Заметки» — только у неразобранного', () => {
    expect(notesLink(of('a'))).toBe('/inbox?open=a')
    expect(notesLink(of('b', { kind: 'thought' }))).toBe('/inbox?open=b')
    expect(notesLink(of('c', { plannedFor: '2026-10-15' }))).toBeNull()
    expect(notesLink(of('d', { status: 'done', doneOn: '2026-10-14' }))).toBeNull()
  })

  it('добавленное — во входящих и сразу к замыслу', () => {
    const task = captureForGoal('  Купить учебник ', '2026-10-11', 'task', 'g')
    expect(task).toMatchObject({ text: 'Купить учебник', kind: 'task', capturedOn: '2026-10-11', plannedFor: null })
    expect(task && isUnsorted(task)).toBe(true)
    expect(task && goalIdOf(task)).toBe('g')
    const thought = captureForGoal('Сериалы с субтитрами', '2026-10-11', 'thought', 'g')
    if (thought === null) throw new Error('мысль не записалась')
    expect(goalIdOf(thought)).toBe('g')
    expect(goalEntries('g', [goal, thought]).map((each) => each.id)).toEqual([thought.id])
    expect(captureForGoal('   ', '2026-10-11', 'task', 'g')).toBeNull()
  })
})

describe('«Прикрепить» и «Открепить» — задача #66', () => {
  const other = note('o', { kind: 'goal', text: 'Байкал\nЛетом' })
  const elsewhere = note('elsewhere', { refs: [noteRef('o')], text: 'Билеты' })
  const notes = [
    goal,
    other,
    of('mine'),
    note('free', { capturedOn: '2026-09-01' }),
    note('thought', { kind: 'thought', capturedOn: '2026-10-11' }),
    note('planned', { plannedFor: '2026-10-15' }),
    elsewhere,
    note('done', { status: 'done', doneOn: '2026-10-11' }),
    note('dropped', { status: 'dropped' }),
    note('gone', { deleted: true }),
  ]

  it('в выборе — открытые дела и мысли, кроме уже этого замысла; замыслов нет', () => {
    expect(attachable('g', notes).map((each) => each.id)).toEqual(['thought', 'planned', 'elsewhere', 'free'])
  })

  it('все уже здесь — выбирать нечего', () => {
    expect(attachable('g', [goal, of('a'), of('b', { kind: 'thought' }), note('d', { status: 'done' })])).toEqual([])
  })

  it('поиск — как на «Заметках», и по названию замысла записи', () => {
    const candidates = attachable('g', notes)
    expect(findAttachable(candidates, queryWords('байкал'), notes).map((each) => each.id)).toEqual(['elsewhere'])
    expect(findAttachable(candidates, queryWords('сентябрь'), notes).map((each) => each.id)).toEqual(['free'])
    expect(findAttachable(candidates, queryWords('нет такого'), notes)).toEqual([])
    expect(findAttachable(candidates, [], notes)).toEqual(candidates)
  })

  it('подпись называет, к какому замыслу запись относится сейчас', () => {
    expect(attachDetail(elsewhere, notes)).toBe('дело · открыто · сейчас к «Байкал»')
    expect(attachDetail(note('free'), notes)).toBe('дело · открыто')
    // Замысел удалён — ссылка молчит (Р-31).
    expect(attachDetail(elsewhere, [goal, elsewhere])).toBe('дело · открыто')
  })

  it('прикреплённая — в ленте и уходит из другого замысла; откреплённая — без замысла', () => {
    const moved = withGoal(elsewhere, 'g')
    expect(goalIdOf(moved)).toBe('g')
    expect(goalEntries('g', [goal, other, moved]).map((each) => each.id)).toEqual(['elsewhere'])
    expect(goalEntries('o', [goal, other, moved])).toEqual([])
    expect(attachable('g', [goal, moved])).toEqual([])
    const detached = withGoal(moved, null)
    expect(goalIdOf(detached)).toBeNull()
    expect(detached.refs).toBeUndefined()
    expect(attachable('g', [goal, detached]).map((each) => each.id)).toEqual(['elsewhere'])
  })
})
