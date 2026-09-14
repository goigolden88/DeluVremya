import { describe, expect, it } from 'vitest'
import { filterFeed, groupFeed, type FeedItem } from '../../core/feed.ts'
import type { Note } from '../../core/model.ts'
import { noteFeed, noteMarkdown } from './feed.ts'
import { noteRef } from './inbox.ts'

function note(id: string, over: Partial<Note> = {}): Note {
  return {
    id,
    updatedAt: '2026-09-14T10:00:00.000Z',
    text: `Запись ${id}`,
    kind: 'task',
    capturedOn: '2026-09-10',
    plannedFor: null,
    status: 'open',
    ...over,
  }
}

const row = (items: FeedItem[], id: string) => items.find((each) => each.id === id)

describe('заметки в ленте — Р-59', () => {
  it('строка в дне записи; без даты — пустая дата', () => {
    const items = noteFeed([note('a'), note('b', { capturedOn: null })])
    expect(row(items, 'a')?.date).toBe('2026-09-10')
    expect(row(items, 'b')?.date).toBe('')
  })

  it('подпись — вид и состояние', () => {
    const items = noteFeed([
      note('open'),
      note('done', { status: 'done', doneOn: '2026-09-14', plannedFor: '2026-09-12' }),
      note('plan', { plannedFor: '2026-09-15', main: true }),
      note('later', { status: 'someday' }),
      note('goal', { kind: 'goal', status: 'done', doneOn: '2026-09-13' }),
      note('thought', { kind: 'thought' }),
    ])
    expect(row(items, 'open')?.detail).toBe('дело')
    expect(row(items, 'done')?.detail).toBe('дело · сделано 14.09')
    expect(row(items, 'plan')?.detail).toBe('дело · в плане на 15.09 · главное')
    expect(row(items, 'later')?.detail).toBe('дело · когда-нибудь')
    expect(row(items, 'goal')?.detail).toBe('замысел · достигнут 13.09')
    expect(row(items, 'thought')?.detail).toBe('мысль')
  })

  it('заголовок — первая строка текста, весь текст ищется', () => {
    const items = noteFeed([note('a', { text: 'Купить фильтр\nдля воды на кухню' })])
    expect(row(items, 'a')?.title).toBe('Купить фильтр')
    expect(filterFeed(items, { query: 'кухню' })).toHaveLength(1)
  })

  it('дело с замыслом — подпись, и замысел ищется', () => {
    const goal = note('goal', { kind: 'goal', text: 'Выучить испанский' })
    const task = note('task', { text: 'Купить учебник', refs: [noteRef('goal')] })
    const items = noteFeed([goal, task])
    expect(row(items, 'task')?.detail).toBe('дело · к замыслу «Выучить испанский»')
    expect(filterFeed(items, { query: 'испанский учебник' }).map((each) => each.id)).toEqual(['task'])
  })

  it('дни плана и выполнения ищутся словами', () => {
    const items = noteFeed([note('a', { capturedOn: '2026-03-02', status: 'done', doneOn: '2026-09-14' })])
    expect(filterFeed(items, { query: 'сентябрь' })).toHaveLength(1)
    expect(filterFeed(items, { query: '14 сентября' })).toHaveLength(1)
  })

  it('переход — только у неразобранного и у замысла в работе', () => {
    const items = noteFeed([
      note('open'),
      note('goal', { kind: 'goal' }),
      note('plan', { plannedFor: '2026-09-15' }),
      note('done', { status: 'done', doneOn: '2026-09-14' }),
      note('later', { status: 'someday' }),
      note('reached', { kind: 'goal', status: 'done' }),
    ])
    expect(row(items, 'open')?.link).toBe('/inbox?open=open')
    expect(row(items, 'goal')?.link).toBe('/inbox?open=goal')
    for (const id of ['plan', 'done', 'later', 'reached']) expect(row(items, id)?.link).toBeUndefined()
  })

  it('удалённые не попадают', () => {
    expect(noteFeed([note('a', { deleted: true }), note('b')]).map((each) => each.id)).toEqual(['b'])
  })

  it('без даты — внизу ленты, группой «Без даты» — Р-08', () => {
    const groups = groupFeed(noteFeed([note('a', { capturedOn: null }), note('b')]))
    expect(groups.map((group) => group.month)).toEqual(['2026-09', null])
  })
})

describe('заметки в markdown — Р-63', () => {
  it('пусто — так и сказано', () => {
    expect(noteMarkdown([])).toBe('Записей нет.')
    expect(noteMarkdown([note('a', { deleted: true })])).toBe('Записей нет.')
  })

  it('дневником: месяцы от старых к новым, внутри — по дню, без даты — в конце', () => {
    const text = noteMarkdown([
      note('a', { status: 'done', doneOn: '2026-09-14' }),
      note('old', { kind: 'thought', capturedOn: '2026-03-12', text: 'Ёлки у реки' }),
      note('undated', { kind: 'thought', capturedOn: null, text: 'Старая' }),
      note('b', { capturedOn: '2026-09-02' }),
    ])
    expect(text).toBe(
      [
        '### Март 2026',
        '',
        '- 12.03 · Ёлки у реки — мысль',
        '',
        '### Сентябрь 2026',
        '',
        '- 02.09 · Запись b — дело',
        '- 10.09 · Запись a — дело · сделано 14.09.2026',
        '',
        '### Без даты',
        '',
        '- Старая — мысль',
      ].join('\n'),
    )
  })

  it('текст экранируется и не рвёт пункт; кривая дата названа', () => {
    const text = noteMarkdown([note('a', { text: '*важно*\nвторая строка', capturedOn: 'вчера' })])
    expect(text).toContain('- \\*важно\\* вторая строка — дело · дата не разобрана: «вчера»')
  })

  it('замысел у дела назван', () => {
    const text = noteMarkdown([
      note('goal', { kind: 'goal', text: 'Байкал' }),
      note('task', { text: 'Билеты', refs: [noteRef('goal')] }),
    ])
    expect(text).toContain('Билеты — дело · к замыслу «Байкал»')
  })
})

describe('заметки в markdown за период — Р-79', () => {
  it('только записанные в периоде; без даты и с кривой датой — нет', () => {
    const text = noteMarkdown(
      [
        note('a', { text: 'Мартовская', capturedOn: '2026-03-05' }),
        note('b', { text: 'Апрельская', capturedOn: '2026-04-05' }),
        note('c', { text: 'Недатированная', capturedOn: null }),
        note('d', { text: 'Кривая', capturedOn: 'вчера' }),
      ],
      { from: '2026-03-01', to: '2026-03-31' },
    )
    expect(text).toContain('Мартовская')
    expect(text).not.toContain('Апрельская')
    expect(text).not.toContain('Недатированная')
    expect(text).not.toContain('Кривая')
  })
})
