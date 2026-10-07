import { describe, expect, it } from 'vitest'
import type { Category, Sleep, SpecialDays, TimeBlock } from '../../app/model.ts'
import { periodSummary } from './period.ts'
import { periodShares, shareText, wholeShares, type WholeShares } from './shares.ts'

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

describe('доли от всего — Р-98', () => {
  const DAY = 24 * 60
  const categories = [cat('a', 'Чтение', 0, { group: 'Развитие' }), cat('c', 'Ютуб', 1, { group: 'Отдых' })]
  const routine = (since: string, wake: string, bed: string, extra: Partial<Sleep> = {}): Sleep => ({
    id: `routine:${since}`,
    updatedAt: AT,
    since,
    wake,
    bed,
    ...extra,
  })
  const mark = (day: string, wake: string, bed: string): Sleep => ({ id: `sleep:${day}`, updatedAt: AT, day, wake, bed })
  /** Распорядок 8–24 с начала месяца: окно 16 ч, сон 8 ч. */
  const usual = routine('2026-09-01', '08:00', '00:00')
  const MONDAY_AFTER = '2026-09-14'

  const ready = (result: WholeShares) => {
    if (result.status !== 'ready') throw new Error(`ждали долей, а не «${result.status}»`)
    return result
  }
  const parts = (result: ReturnType<typeof ready>) =>
    (result.shares.groups ?? []).reduce((sum, group) => sum + group.minutes, 0) +
    result.unaccounted.minutes +
    result.sleep.minutes

  it('сутки = группы + неучтено + сон; доля — от суток', () => {
    const list = [block('1', 'a', '2026-09-07', 60), block('2', 'c', '2026-09-08', 180)]
    const result = ready(wholeShares(list, categories, [usual], WEEK, MONDAY_AFTER))
    expect(result.shares.total).toBe(7 * DAY)
    expect(result.shares.groups?.map((group) => [group.name, group.minutes])).toEqual([
      ['Отдых', 180],
      ['Развитие', 60],
    ])
    expect(result.unaccounted.minutes).toBe(7 * 16 * 60 - 240)
    expect(result.sleep.minutes).toBe(7 * 8 * 60)
    expect(result.sleep.text).toBe('33 %')
    expect(parts(result)).toBe(7 * DAY)
    expect(result.basis).toEqual({ days: 7, marked: 0, routine: 7, today: false, beforeRoutine: 0, special: 0 })
  })

  it('дни до первого распорядка без отметки и сегодняшние блоки — не в счёте', () => {
    const list = [
      block('1', 'a', '2026-09-07', 60),
      block('2', 'a', '2026-09-10', 30),
      block('3', 'c', '2026-09-12', 120),
    ]
    const result = ready(wholeShares(list, categories, [routine('2026-09-10', '08:00', '00:00')], WEEK, '2026-09-12'))
    expect(result.basis).toEqual({ days: 2, marked: 0, routine: 2, today: true, beforeRoutine: 3, special: 0 })
    expect(result.shares.categories.map((row) => [row.name, row.minutes])).toEqual([['Чтение', 30]])
    expect(result.shares.total).toBe(2 * DAY)
    expect(parts(result)).toBe(2 * DAY)
  })

  it('отметка дня и распорядок вперемешку: отметка главнее, и до распорядка тоже в счёте', () => {
    const records = [
      routine('2026-09-10', '08:00', '00:00'),
      mark('2026-09-08', '06:00', '23:00'),
      mark('2026-09-11', '09:00', '00:00'),
    ]
    const result = ready(wholeShares([], categories, records, WEEK, MONDAY_AFTER))
    expect(result.basis).toEqual({ days: 5, marked: 2, routine: 3, today: false, beforeRoutine: 2, special: 0 })
    // 8-е — окно 17 ч, 11-е — 15 ч, 10, 12, 13 — по 16 ч.
    expect(result.sleep.minutes).toBe((7 + 9 + 3 * 8) * 60)
    expect(result.unaccounted.minutes).toBe((17 + 15 + 3 * 16) * 60)
  })

  it('смена распорядка внутри периода и отбой после полуночи', () => {
    const records = [usual, routine('2026-09-10', '07:00', '00:30')]
    const result = ready(wholeShares([], categories, records, WEEK, MONDAY_AFTER))
    // 7–9: окно 16 ч, сон 8 ч; 10–13: окно 17,5 ч, сон 6,5 ч.
    expect(result.sleep.minutes).toBe(3 * 480 + 4 * 390)
    expect(result.unaccounted.minutes).toBe(3 * 960 + 4 * 1050)
    expect(parts(result)).toBe(7 * DAY)
  })

  it('учтённое сверх окна отнимается от сна, а не выходит за сутки', () => {
    const list = [block('1', 'a', '2026-09-07', 1000)]
    const result = ready(wholeShares(list, categories, [usual], { from: '2026-09-07', to: '2026-09-07' }, MONDAY_AFTER))
    expect(result.unaccounted.minutes).toBe(0)
    expect(result.sleep.minutes).toBe(DAY - 1000)
    expect(parts(result)).toBe(DAY)
  })

  it('сегодня, будущие и особые дни — не в счёте', () => {
    const trip: SpecialDays = { id: 't', updatedAt: AT, from: '2026-09-08', to: '2026-09-08', title: 'Поездка' }
    const list = [
      block('1', 'a', '2026-09-07', 60),
      block('2', 'a', '2026-09-08', 600),
      block('3', 'a', '2026-09-10', 120),
      block('4', 'a', '2026-09-12', 120),
    ]
    const result = ready(wholeShares(list, categories, [usual], WEEK, '2026-09-10', [trip]))
    expect(result.basis).toEqual({ days: 2, marked: 0, routine: 2, today: true, beforeRoutine: 0, special: 1 })
    expect(result.shares.categories.map((row) => row.minutes)).toEqual([60])
    expect(parts(result)).toBe(2 * DAY)
  })

  it('фоновое — ни в долю, ни в целое — Р-43', () => {
    const list = [block('1', 'a', '2026-09-07', 60, { bgCategoryId: 'c' })]
    const result = ready(wholeShares(list, categories, [usual], WEEK, MONDAY_AFTER))
    expect(result.shares.categories.map((row) => [row.name, row.minutes])).toEqual([['Чтение', 60]])
    expect(result.unaccounted.minutes).toBe(7 * 960 - 60)
    expect(parts(result)).toBe(7 * DAY)
  })

  it('без распорядка — режим не считается: отметки и удалённый распорядок его не заменяют', () => {
    expect(wholeShares([], categories, [], WEEK, MONDAY_AFTER)).toEqual({ status: 'no-routine' })
    const records = [mark('2026-09-08', '07:00', '23:00'), routine('2026-09-01', '08:00', '00:00', { deleted: true })]
    expect(wholeShares([], categories, records, WEEK, MONDAY_AFTER)).toEqual({ status: 'no-routine' })
  })

  it('нет прошедших дней — без строк', () => {
    const result = wholeShares([block('1', 'a', '2026-09-07', 60)], categories, [usual], WEEK, '2026-09-07')
    expect(result).toEqual({
      status: 'no-days',
      basis: { days: 0, marked: 0, routine: 0, today: true, beforeRoutine: 0, special: 0 },
    })
  })
})
