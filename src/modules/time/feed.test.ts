import { describe, expect, it } from 'vitest'
import { filterFeed, type FeedItem } from '../../core/feed.ts'
import type { Category, TimeBlock } from '../../core/model.ts'
import { timeFeed, timeMarkdown } from './feed.ts'

const at = '2026-09-14T10:00:00.000Z'

function category(name: string, order: number, over: Partial<Category> = {}): Category {
  return { id: `cat:${name.toLowerCase()}`, updatedAt: at, name, order, kind: 'neutral', ...over }
}

const categories = [
  category('Чтение', 1),
  category('Ютуб', 2),
  category('Покер', 3),
  category('Шахматы', 4),
  category('Старое', 5, { deleted: true }),
]

function block(id: string, date: string, name: string, minutes: number, over: Partial<TimeBlock> = {}): TimeBlock {
  return { id, updatedAt: at, date, categoryId: `cat:${name}`, minutes, ...over }
}

const row = (items: FeedItem[], id: string) => items.find((each) => each.id === id)

describe('учёт в ленте — строка на день, Р-58', () => {
  it('строка на день, а не на блок', () => {
    const items = timeFeed(
      [block('1', '2026-09-10', 'чтение', 30), block('2', '2026-09-10', 'ютуб', 60), block('3', '2026-09-11', 'шахматы', 10)],
      categories,
    )
    expect(items.map((each) => each.id).sort()).toEqual(['day:2026-09-10', 'day:2026-09-11'])
    expect(row(items, 'day:2026-09-10')?.title).toBe('Учтено 1 ч 30 мин · 2 блока')
  })

  it('самые крупные категории — первыми, остальные числом', () => {
    const items = timeFeed(
      [
        block('1', '2026-09-10', 'чтение', 20),
        block('2', '2026-09-10', 'ютуб', 60),
        block('3', '2026-09-10', 'шахматы', 10),
        block('4', '2026-09-10', 'старое', 5),
      ],
      categories,
    )
    expect(row(items, 'day:2026-09-10')?.detail).toBe('Ютуб 1 ч · Чтение 20 мин · Шахматы 10 мин · ещё 1 категория')
  })

  it('фоновое в сумму не входит, но ищется — Р-43', () => {
    const items = timeFeed([block('1', '2026-09-10', 'ютуб', 60, { bgCategoryId: 'cat:покер' })], categories)
    expect(row(items, 'day:2026-09-10')?.title).toBe('Учтено 1 ч · 1 блок')
    expect(filterFeed(items, { query: 'фоном покер' })).toHaveLength(1)
  })

  it('заметки блоков ищутся', () => {
    const items = timeFeed([block('1', '2026-09-10', 'ютуб', 60, { note: 'стрим турнира' })], categories)
    expect(filterFeed(items, { query: 'турнир' })).toHaveLength(1)
  })

  it('тап — день на экране учёта; кривая дата — без перехода, как лежит', () => {
    const items = timeFeed([block('1', '2026-09-10', 'ютуб', 60), block('2', 'вчера', 'ютуб', 30)], categories)
    expect(row(items, 'day:2026-09-10')?.link).toBe('/time?day=2026-09-10')
    expect(row(items, 'day:вчера')?.link).toBeUndefined()
    expect(row(items, 'day:вчера')?.date).toBe('вчера')
  })

  it('удалённый блок не считается; удалённая категория — своим именем, неизвестная — «без категории»', () => {
    const items = timeFeed(
      [
        block('1', '2026-09-10', 'старое', 30),
        block('2', '2026-09-10', 'нет', 20),
        block('3', '2026-09-10', 'ютуб', 60, { deleted: true }),
      ],
      categories,
    )
    expect(row(items, 'day:2026-09-10')?.title).toBe('Учтено 50 мин · 2 блока')
    expect(row(items, 'day:2026-09-10')?.detail).toBe('Старое 30 мин · без категории 20 мин')
  })
})

describe('учёт в markdown — Р-63', () => {
  it('пусто — так и сказано', () => {
    expect(timeMarkdown([], categories, '2026-09-14')).toBe('Записей нет.')
  })

  it('месяц с итогом и основанием, день строкой, фоновое отдельно, заметки подпунктами', () => {
    const text = timeMarkdown(
      [
        block('2', '2026-09-10', 'ютуб', 60, { bgCategoryId: 'cat:покер', note: 'под стрим' }),
        block('1', '2026-09-10', 'чтение', 30),
        block('3', '2026-09-11', 'шахматы', 10),
      ],
      categories,
      '2026-09-14',
    )
    expect(text).toBe(
      [
        '### Сентябрь 2026',
        '',
        'Учтено 1 ч 40 мин · 3 блока · учёт был в 2 днях из 14',
        '',
        '- 10.09 — 1 ч 30 мин: Чтение 30 мин, Ютуб 1 ч; фоном Покер 1 ч',
        '  - Ютуб 1 ч: под стрим',
        '- 11.09 — 10 мин: Шахматы 10 мин',
      ].join('\n'),
    )
  })

  it('месяцы от старых к новым; кривая дата — в конце, названа', () => {
    const text = timeMarkdown(
      [block('1', '2026-09-01', 'ютуб', 60), block('2', '2026-08-31', 'ютуб', 30), block('3', 'вчера', 'ютуб', 10)],
      categories,
      '2026-09-14',
    )
    const heads = text.split('\n').filter((line) => line.startsWith('###'))
    expect(heads).toEqual(['### Август 2026', '### Сентябрь 2026', '### Дата не разобрана'])
    expect(text).toContain('- «вчера» — 10 мин: Ютуб 10 мин')
  })
})
