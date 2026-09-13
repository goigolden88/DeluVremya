import { describe, expect, it } from 'vitest'
import { isUlid } from '../../core/id.ts'
import type { Note } from '../../core/model.ts'
import {
  ageDays,
  captureNote,
  compareNotes,
  DEFAULT_KIND,
  goalIdOf,
  goalOf,
  goalProgress,
  goalsOf,
  groupByMonth,
  inboxOf,
  kindCounts,
  markDone,
  matchesQuery,
  noteRef,
  queryWords,
  reopen,
  withGoal,
  withKind,
  withText,
} from './inbox.ts'

function note(id: string, over: Partial<Note> = {}): Note {
  return {
    id,
    updatedAt: '2026-09-13T10:00:00.000Z',
    text: `запись ${id}`,
    kind: 'task',
    capturedOn: '2026-09-13',
    plannedFor: null,
    status: 'open',
    ...over,
  }
}

const ids = (list: readonly Note[]) => list.map((each) => each.id)

describe('захват одной строкой — Р-09, Р-13', () => {
  it('текст — единственное, что нужно: остальное ставится само', () => {
    const captured = captureNote('  купить фильтр  ', '2026-09-13')
    expect(captured).toMatchObject({
      text: 'купить фильтр',
      kind: 'task',
      capturedOn: '2026-09-13',
      plannedFor: null,
      status: 'open',
    })
    expect(isUlid(captured?.id ?? '')).toBe(true)
  })

  it('вид по умолчанию — дело; выбранный при записи — свой', () => {
    expect(DEFAULT_KIND).toBe('task')
    expect(captureNote('Выучить испанский', '2026-09-13', 'goal')?.kind).toBe('goal')
  })

  it('переводы строк внутри текста сохраняются', () => {
    expect(captureNote('Статья\nhttps://example.com', '2026-09-13')?.text).toBe('Статья\nhttps://example.com')
  })

  it('пустое и пробелы не записываются', () => {
    expect(captureNote('', '2026-09-13')).toBeNull()
    expect(captureNote('   \n ', '2026-09-13')).toBeNull()
  })
})

describe('неразобранное и порядок', () => {
  it('только не поставленное в план, открытое и не замысел', () => {
    const list = inboxOf([
      note('01A'),
      note('01B', { plannedFor: '2026-09-14' }),
      note('01C', { status: 'done' }),
      note('01D', { status: 'someday' }),
      note('01E', { deleted: true }),
      note('01F', { kind: 'goal' }),
      note('01G', { kind: 'thought' }),
    ])
    expect(ids(list)).toEqual(['01G', '01A'])
  })

  it('порядок — по дню записи, а не по id: импортированная мартовская не встаёт выше сегодняшней', () => {
    const imported = note('01Z', { capturedOn: '2026-03-01' })
    const fresh = note('01A', { capturedOn: '2026-09-13' })
    expect(ids(inboxOf([imported, fresh]))).toEqual(['01A', '01Z'])
  })

  it('внутри дня — свежие сверху по id; без даты и с кривой датой — в конце', () => {
    const list = [note('01A'), note('01B'), note('01C', { capturedOn: null }), note('01D', { capturedOn: 'вчера' })]
    expect(ids([...list].sort(compareNotes))).toEqual(['01B', '01A', '01D', '01C'])
  })

  it('мысль без даты видна — Р-08', () => {
    expect(inboxOf([note('01A', { kind: 'thought', capturedOn: null })])).toHaveLength(1)
  })

  it('замыслы в работе — отдельно: достигнутые и удалённые не в счёт', () => {
    const list = goalsOf([
      note('01A', { kind: 'goal' }),
      note('01B', { kind: 'goal', status: 'done' }),
      note('01C', { kind: 'goal', deleted: true }),
      note('01D'),
    ])
    expect(ids(list)).toEqual(['01A'])
  })

  it('группы по месяцам записи, без даты — последней группой', () => {
    const groups = groupByMonth([
      note('01A', { capturedOn: '2026-03-12' }),
      note('01B', { capturedOn: null }),
      note('01C', { capturedOn: '2026-09-01' }),
      note('01D', { capturedOn: '2026-03-02' }),
    ])
    expect(groups.map((group) => [group.month, ids(group.notes)])).toEqual([
      ['2026-09', ['01C']],
      ['2026-03', ['01A', '01D']],
      [null, ['01B']],
    ])
  })

  it('виды считаются по отдельности', () => {
    expect(kindCounts([note('01A'), note('01B', { kind: 'thought' }), note('01C')])).toEqual({
      task: 2,
      thought: 1,
      goal: 0,
    })
  })
})

describe('поиск — слова в любом порядке', () => {
  const filter = note('01A', { text: 'Купить фильтр для воды', capturedOn: '2026-03-12' })
  const found = (target: Note, query: string, extra?: string) => matchesQuery(target, queryWords(query), extra)

  it('нужны все слова, порядок не важен', () => {
    expect(found(filter, 'воды фильтр')).toBe(true)
    expect(found(filter, 'воды кофе')).toBe(false)
  })

  it('регистр, «ё» и лишние пробелы не в счёт', () => {
    const tea = note('01B', { text: 'Ёлка на Новый год' })
    expect(found(tea, '  ЕЛКА   новый ')).toBe(true)
  })

  it('пустой запрос — подходит всё', () => {
    expect(queryWords('   ')).toEqual([])
    expect(found(filter, '')).toBe(true)
  })

  it('дата ищется всеми видами: месяц словом, числом и ГГГГ-ММ', () => {
    for (const query of ['март', 'марта', '12.03.2026', '2026-03', 'фильтр март']) {
      expect(found(filter, query), query).toBe(true)
    }
    expect(found(filter, 'апрель')).toBe(false)
  })

  it('«май» находит майскую запись: именительный — отдельно от «мая»', () => {
    expect(found(note('01C', { capturedOn: '2026-05-04' }), 'май')).toBe(true)
  })

  it('без даты находится словами «без даты»', () => {
    expect(found(note('01D', { capturedOn: null }), 'без даты')).toBe(true)
  })

  it('дополнительный текст ищется, но в запись не пишется: название замысла у дела', () => {
    expect(found(filter, 'байкал', 'Съездить на Байкал')).toBe(true)
  })
})

describe('возраст записи', () => {
  it('в днях от дня записи; без даты и с кривой датой — null; будущее — ноль', () => {
    expect(ageDays(note('01A', { capturedOn: '2026-09-10' }), '2026-09-13')).toBe(3)
    expect(ageDays(note('01B', { capturedOn: null }), '2026-09-13')).toBeNull()
    expect(ageDays(note('01C', { capturedOn: '12.03' }), '2026-09-13')).toBeNull()
    expect(ageDays(note('01D', { capturedOn: '2026-09-20' }), '2026-09-13')).toBe(0)
  })
})

describe('правки из карточки — Р-30', () => {
  it('текст обрезается; пустой не принимается; прежний — та же запись', () => {
    const one = note('01A', { text: 'старое' })
    expect(withText(one, '  новое ')?.text).toBe('новое')
    expect(withText(one, '  ')).toBeNull()
    expect(withText(one, 'старое')).toBe(one)
  })

  it('смена вида; тот же вид — та же запись', () => {
    const one = note('01A')
    expect(withKind(one, 'thought').kind).toBe('thought')
    expect(withKind(one, 'task')).toBe(one)
  })

  it('перестав быть делом, запись теряет замысел, но не чужие связи — Р-31', () => {
    const task = note('01A', { refs: ['dnevniki:x', noteRef('01G')] })
    expect(withKind(task, 'thought').refs).toEqual(['dnevniki:x'])
    expect(withKind(note('01B', { refs: [noteRef('01G')] }), 'goal').refs).toBeUndefined()
  })

  it('«Сделано» ставит день, «Отменить» возвращает как было', () => {
    const done = markDone(note('01A'), '2026-09-13')
    expect(done).toMatchObject({ status: 'done', doneOn: '2026-09-13' })
    const back = reopen(done)
    expect(back.status).toBe('open')
    expect('doneOn' in back).toBe(false)
  })
})

describe('замысел и его дела — Р-31', () => {
  const goal = note('01G', { kind: 'goal', text: 'Выучить испанский' })

  it('ссылка — `note:<id>`; одно дело — один замысел, прежний заменяется', () => {
    const linked = withGoal(note('01A'), '01G')
    expect(linked.refs).toEqual(['note:01G'])
    expect(goalIdOf(linked)).toBe('01G')
    expect(withGoal(linked, '01H').refs).toEqual(['note:01H'])
  })

  it('отвязка убирает ссылку, чужие связи остаются; пустых refs не бывает', () => {
    expect(withGoal(note('01A', { refs: ['note:01G'] }), null).refs).toBeUndefined()
    expect(withGoal(note('01A', { refs: ['dnevniki:x', 'note:01G'] }), null).refs).toEqual(['dnevniki:x'])
  })

  it('замысел дела — только живая запись вида «замысел»', () => {
    const task = withGoal(note('01A'), '01G')
    expect(goalOf(task, [goal, task])?.text).toBe('Выучить испанский')
    expect(goalOf(task, [{ ...goal, deleted: true }, task])).toBeNull()
    expect(goalOf(task, [{ ...goal, kind: 'thought' }, task])).toBeNull()
    expect(goalOf(note('01B'), [goal])).toBeNull()
  })

  it('сколько дел и сколько сделано: удалённые, отброшенные и мысли не в счёт', () => {
    const notes = [
      goal,
      withGoal(note('01A'), '01G'),
      withGoal(note('01B', { status: 'done' }), '01G'),
      withGoal(note('01C', { status: 'dropped' }), '01G'),
      withGoal(note('01D', { deleted: true }), '01G'),
      withGoal(note('01E', { kind: 'thought' }), '01G'),
      withGoal(note('01F'), '01X'),
    ]
    expect(goalProgress('01G', notes)).toEqual({ total: 2, done: 1 })
  })
})
