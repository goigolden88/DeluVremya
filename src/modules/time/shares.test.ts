import { describe, expect, it } from 'vitest'
import type { Category, SpecialDays, TimeBlock } from '../../app/model.ts'
import { periodSummary } from './period.ts'
import { periodShares, shareText } from './shares.ts'

const AT = '2026-09-13T10:00:00.000Z'
const WEEK = { from: '2026-09-07', to: '2026-09-13' }
const SUNDAY = '2026-09-13'

function cat(id: string, name: string, order: number, extra: Partial<Category> = {}): Category {
  return { id, updatedAt: AT, name, order, kind: 'neutral', ...extra }
}

function block(id: string, categoryId: string, date: string, minutes: number, extra: Partial<TimeBlock> = {}): TimeBlock {
  return { id, updatedAt: AT, date, categoryId, minutes, ...extra }
}

describe('доли учтённого — Р-95', () => {
  const grouped = [
    cat('a', 'Чтение', 0, { group: 'Развитие' }),
    cat('b', 'Ходьба', 1, { group: 'Развитие' }),
    cat('c', 'Ютуб', 2, { group: 'Отдых' }),
    cat('d', 'Дорога', 3),
  ]
  const blocks = [
    block('1', 'a', '2026-09-07', 60),
    block('2', 'b', '2026-09-08', 30),
    block('3', 'c', '2026-09-09', 180),
    block('4', 'd', '2026-09-10', 30),
  ]
  const shares = (list: readonly TimeBlock[], categories: readonly Category[], specials: SpecialDays[] = []) =>
    periodShares(periodSummary(list, categories, WEEK, SUNDAY, specials), categories)

  it('доли — от всего учтённого; группа — сумма своих категорий; порядок — по убыванию', () => {
    const result = shares(blocks, grouped)
    expect(result.total).toBe(300)
    expect(result.groups?.map((group) => [group.name, group.minutes, group.text])).toEqual([
      ['Отдых', 180, '60 %'],
      ['Развитие', 90, '30 %'],
      [null, 30, '10 %'],
    ])
    expect(result.groups?.[1]?.part).toBeCloseTo(0.3)
  })

  it('доля категории — от всего учтённого, а не от своей группы; внутри группы — по убыванию', () => {
    const development = shares(blocks, grouped).groups?.find((group) => group.key === 'развитие')
    expect(development?.categories.map((row) => [row.name, row.text])).toEqual([
      ['Чтение', '20 %'],
      ['Ходьба', '10 %'],
    ])
  })

  it('групп нет — сразу категории, по убыванию', () => {
    const plain = grouped.map(({ group: _group, ...rest }) => rest)
    const result = shares(blocks, plain)
    expect(result.groups).toBeNull()
    expect(result.categories.map((row) => [row.name, row.text])).toEqual([
      ['Ютуб', '60 %'],
      ['Чтение', '20 %'],
      ['Ходьба', '10 %'],
      ['Дорога', '10 %'],
    ])
  })

  it('больше нуля, но меньше процента — «<1 %»; целые проценты', () => {
    expect(shareText(1, 1000)).toBe('<1 %')
    expect(shareText(5, 1000)).toBe('<1 %')
    expect(shareText(10, 1000)).toBe('1 %')
    expect(shareText(15, 1000)).toBe('2 %')
    expect(shareText(1, 3)).toBe('33 %')
    expect(shareText(0, 100)).toBe('0 %')
    expect(shareText(0, 0)).toBe('0 %')
    const result = shares([block('1', 'a', '2026-09-07', 1), block('2', 'c', '2026-09-08', 999)], grouped)
    expect(result.categories.map((row) => [row.name, row.text])).toEqual([
      ['Ютуб', '100 %'],
      ['Чтение', '<1 %'],
    ])
  })

  it('без времени — без строки: категория только фоном и группа без минут не входят', () => {
    const result = shares([block('1', 'a', '2026-09-07', 60, { bgCategoryId: 'c' })], grouped)
    expect(result.categories.map((row) => row.name)).toEqual(['Чтение'])
    expect(result.groups?.map((group) => group.name)).toEqual(['Развитие'])
    expect(shares([], grouped)).toEqual({ total: 0, groups: [], categories: [] })
  })

  it('фоновое — ни в долю, ни в целое — Р-43', () => {
    const result = shares([block('1', 'a', '2026-09-07', 60, { bgCategoryId: 'c' }), block('2', 'c', '2026-09-08', 60)], grouped)
    expect(result.total).toBe(120)
    expect(result.categories.map((row) => [row.name, row.minutes, row.text])).toEqual([
      ['Чтение', 60, '50 %'],
      ['Ютуб', 60, '50 %'],
    ])
  })

  it('особые дни не входят — Р-91', () => {
    const trip: SpecialDays = { id: 't', updatedAt: AT, from: '2026-09-09', to: '2026-09-09', title: 'Поездка' }
    const result = shares(blocks, grouped, [trip])
    expect(result.total).toBe(120)
    expect(result.groups?.map((group) => [group.name, group.text])).toEqual([
      ['Развитие', '75 %'],
      [null, '25 %'],
    ])
  })
})
