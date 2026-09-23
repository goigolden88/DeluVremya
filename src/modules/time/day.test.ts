import { describe, expect, it } from 'vitest'
import type { Category, TimeBlock } from '../../app/model.ts'
import { createPreset } from './categories.ts'
import { blockFromPreset, blocksOn, daySummary, DAY_WINDOW, viewedDay, windowElapsed, windowLeft } from './day.ts'

const AT = '2026-09-13T10:00:00.000Z'
const DAY = '2026-09-13'
const WINDOW = (DAY_WINDOW.to - DAY_WINDOW.from) * 60

function cat(id: string, name: string, order: number, extra: Partial<Category> = {}): Category {
  return { id, updatedAt: AT, name, order, kind: 'neutral', ...extra }
}

function block(id: string, categoryId: string, minutes: number, extra: Partial<TimeBlock> = {}): TimeBlock {
  return { id, updatedAt: AT, date: DAY, categoryId, minutes, ...extra }
}

describe('блок из кнопки', () => {
  it('категория и минуты кнопки, дата — переданная', () => {
    const made = blockFromPreset(createPreset('cat:чтение', 30), DAY)
    expect(made).toMatchObject({ date: DAY, categoryId: 'cat:чтение', minutes: 30 })
    expect(made.bgCategoryId).toBeUndefined()
  })

  it('два тапа — два блока, а не один (Р-20)', () => {
    const preset = createPreset('cat:чтение', 30)
    expect(blockFromPreset(preset, DAY).id).not.toBe(blockFromPreset(preset, DAY).id)
  })
})

describe('блоки дня', () => {
  it('только этот день, без удалённых, свежие сверху', () => {
    const blocks = [
      block('01A', 'a', 30),
      block('01C', 'a', 30),
      block('01B', 'a', 30, { deleted: true }),
      block('01D', 'a', 30, { date: '2026-09-12' }),
    ]
    expect(blocksOn(blocks, DAY).map((each) => each.id)).toEqual(['01C', '01A'])
  })
})

describe('итог дня', () => {
  const categories = [
    cat('b', 'Ютуб', 1),
    cat('a', 'Чтение', 0),
    cat('p', 'Покер', 2, { archived: true }),
    cat('x', 'Старое', 3, { deleted: true }),
  ]
  const now = new Date(2026, 8, 13, 20, 0)

  it('сумма, основание и разбивка в порядке категорий', () => {
    const summary = daySummary(
      [block('1', 'b', 60), block('2', 'a', 30), block('3', 'a', 45), block('4', 'x', 15)],
      categories,
      DAY,
      now,
    )
    expect(summary.total).toBe(150)
    expect(summary.count).toBe(4)
    expect(summary.byCategory.map((each) => [each.name, each.minutes, each.count])).toEqual([
      ['Чтение', 75, 2],
      ['Ютуб', 60, 1],
      // Удалённая категория называется своим последним именем.
      ['Старое', 15, 1],
    ])
  })

  it('фоновая не удваивает сумму и считается отдельно', () => {
    const summary = daySummary([block('1', 'b', 60, { bgCategoryId: 'p' }), block('2', 'a', 30)], categories, DAY, now)
    expect(summary.total).toBe(90)
    expect(summary.background.map((each) => [each.name, each.minutes])).toEqual([['Покер', 60]])
  })

  it('неизвестная категория — без имени и в конце', () => {
    const summary = daySummary([block('1', 'нет', 10), block('2', 'a', 30)], categories, DAY, now)
    expect(summary.byCategory.map((each) => each.name)).toEqual(['Чтение', null])
  })

  it('неучтённое — от прошедшей части окна, не меньше нуля', () => {
    // В двадцать часов прошло двенадцать часов окна.
    const elapsed = (20 - DAY_WINDOW.from) * 60
    const summary = daySummary([block('1', 'a', 90)], categories, DAY, now)
    expect(summary.elapsed).toBe(elapsed)
    expect(summary.unaccounted).toBe(elapsed - 90)
    const overfull = daySummary([block('1', 'a', elapsed + 60)], categories, DAY, now)
    expect(overfull.unaccounted).toBe(0)
  })

  it('пустой день — нули, без разбивки', () => {
    const summary = daySummary([], categories, DAY, now)
    expect([summary.total, summary.count, summary.byCategory.length]).toEqual([0, 0, 0])
  })
})

describe('показанный день — Р-25', () => {
  it('прошлый и сегодняшний — из адреса', () => {
    expect(viewedDay('2026-09-12', DAY)).toBe('2026-09-12')
    expect(viewedDay(DAY, DAY)).toBe(DAY)
  })

  it('нет, кривой или будущий — сегодня', () => {
    expect(viewedDay(null, DAY)).toBe(DAY)
    expect(viewedDay('вчера', DAY)).toBe(DAY)
    expect(viewedDay('2026-02-30', DAY)).toBe(DAY)
    expect(viewedDay('2026-09-14', DAY)).toBe(DAY)
  })
})

describe('прошедшая часть окна дня', () => {
  it('прошлый день — всё окно, будущий — ноль', () => {
    const now = new Date(2026, 8, 13, 12, 0)
    expect(windowElapsed('2026-09-12', now)).toBe(WINDOW)
    expect(windowElapsed('2026-09-14', now)).toBe(0)
  })

  it('сегодня: до начала окна ноль, дальше — от начала, не больше окна', () => {
    expect(windowElapsed(DAY, new Date(2026, 8, 13, DAY_WINDOW.from - 1, 30))).toBe(0)
    expect(windowElapsed(DAY, new Date(2026, 8, 13, DAY_WINDOW.from + 4, 30))).toBe(4 * 60 + 30)
    expect(windowElapsed(DAY, new Date(2026, 8, 13, 23, 59))).toBe(Math.min(WINDOW, (23 - DAY_WINDOW.from) * 60 + 59))
  })

  it('окно через параметр — для проверки правила, а не константы', () => {
    expect(windowElapsed(DAY, new Date(2026, 8, 13, 10, 0), { from: 9, to: 18 })).toBe(60)
    expect(windowElapsed(DAY, new Date(2026, 8, 13, 20, 0), { from: 9, to: 18 })).toBe(9 * 60)
  })

  it('остаток окна — до его конца: утром всё, в обед часть, прошедший день — ноль (Р-35)', () => {
    expect(windowLeft(DAY, new Date(2026, 8, 13, DAY_WINDOW.from - 1, 0))).toBe(WINDOW)
    expect(windowLeft(DAY, new Date(2026, 8, 13, 17, 0), { from: 9, to: 18 })).toBe(60)
    expect(windowLeft('2026-09-12', new Date(2026, 8, 13, 12, 0))).toBe(0)
    expect(windowLeft('2026-09-14', new Date(2026, 8, 13, 12, 0))).toBe(WINDOW)
  })
})
