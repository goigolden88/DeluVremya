import { describe, expect, it } from 'vitest'
import { addDays } from '../../shared/core/dates.ts'
import type { Category, TimeBlock } from '../../app/model.ts'
import { weekdayLine } from './labels.ts'
import { weekdayIndex, weekdayPattern, weekdayWindow } from './weekdays.ts'

const AT = '2026-09-13T10:00:00.000Z'
/** Обозреваемая неделя 07–13.09.2026, сегодня — понедельник после неё. */
const WEEK = '2026-09-07'
const TODAY = '2026-09-14'
/** Понедельник первой недели окна: 8 недель, кончая 13.09. */
const FIRST = '2026-07-20'

function cat(id: string, name: string, order: number, extra: Partial<Category> = {}): Category {
  return { id, updatedAt: AT, name, order, kind: 'neutral', ...extra }
}

let seq = 0
function block(categoryId: string, date: string, minutes: number, extra: Partial<TimeBlock> = {}): TimeBlock {
  seq += 1
  return { id: `b${seq}`, updatedAt: AT, date, categoryId, minutes, ...extra }
}

/** День окна: неделя `week` (0…7), день недели `weekday` (пн — 0). */
function day(week: number, weekday: number): string {
  return addDays(FIRST, 7 * week + weekday)
}

/** Блоки категории в день недели `weekday` в недели `weeks`. */
function on(categoryId: string, weekday: number, weeks: readonly number[], minutes = 60, extra: Partial<TimeBlock> = {}) {
  return weeks.map((week) => block(categoryId, day(week, weekday), minutes, extra))
}

const ALL = [0, 1, 2, 3, 4, 5, 6, 7]
/** Работа — каждый день всех недель: все дни — дни учёта, работа никому не свойственна. */
const work = ALL.flatMap((week) => [0, 1, 2, 3, 4, 5, 6].map((weekday) => block('w', day(week, weekday), 480)))
const categories = [cat('w', 'Работа', 0), cat('s', 'Спорт', 1), cat('r', 'Чтение', 2), cat('g', 'Игры', 3)]

function row(blocks: readonly TimeBlock[], weekday: number, list: readonly Category[] = categories) {
  const found = weekdayPattern(blocks, list, WEEK, TODAY).rows[weekday]
  if (!found) throw new Error('нет строки')
  return found
}

describe('окно по дням недели — Р-110', () => {
  it('восемь полных недель, кончая обозреваемой, если она закончилась', () => {
    expect(weekdayWindow(WEEK, TODAY)).toEqual({ from: FIRST, to: '2026-09-13' })
    expect(weekdayWindow('2026-09-10', '2026-12-01')).toEqual({ from: FIRST, to: '2026-09-13' })
  })

  it('неделя ещё идёт, и в воскресенье тоже, — кончая прошлой', () => {
    expect(weekdayWindow('2026-09-10', '2026-09-10')).toEqual({ from: '2026-07-13', to: '2026-09-06' })
    expect(weekdayWindow('2026-09-13', '2026-09-13')).toEqual({ from: '2026-07-13', to: '2026-09-06' })
  })

  it('на стыке месяцев и года', () => {
    expect(weekdayWindow('2026-09-28', '2026-10-05')).toEqual({ from: '2026-08-10', to: '2026-10-04' })
    expect(weekdayWindow('2027-01-04', '2027-01-11')).toEqual({ from: '2026-11-16', to: '2027-01-10' })
    expect(weekdayWindow('2027-01-01', '2027-01-01')).toEqual({ from: '2026-11-02', to: '2026-12-27' })
  })

  it('день недели — пн 0 … вс 6, через год', () => {
    expect(weekdayIndex('2026-12-28')).toBe(0)
    expect(weekdayIndex('2027-01-03')).toBe(6)
  })
})

describe('что свойственно дню недели — Р-110', () => {
  it('категория одного дня — с основанием и средним; ровная — нигде', () => {
    const blocks = [...work, ...on('s', 1, [0, 1, 2, 3, 4, 5])]
    const tuesday = row(blocks, 1)
    expect(tuesday).toMatchObject({ weekday: 1, days: 8, few: false })
    expect(tuesday.items).toEqual([{ categoryId: 's', name: 'Спорт', days: 6, minutes: 360, average: 60 }])
    expect(weekdayLine(tuesday)).toBe('вт: Спорт — в среднем 1 ч, 6 из 8 вт')
    expect(weekdayLine(row(blocks, 2))).toBe('ср: ничего особенного — дней учёта 8')
  })

  it('половина дней — подходит, меньше — нет', () => {
    expect(row([...work, ...on('s', 1, [0, 1, 2, 3])], 1).items.map((item) => item.days)).toEqual([4])
    expect(row([...work, ...on('s', 1, [0, 1, 2])], 1).items).toEqual([])
  })

  it('половина — из дней учёта, а не из недель окна', () => {
    // Вторников с учётом — четыре; спорт в двух из них.
    expect(row(on('s', 1, [0, 1]).concat(on('r', 1, [2, 3])), 1)).toMatchObject({ days: 4, few: false })
    expect(row(on('s', 1, [0, 1]).concat(on('r', 1, [2, 3])), 1).items.map((item) => item.categoryId)).toEqual([
      's',
      'r',
    ])
  })

  it('вдвое чаще остальных дней — ровно вдвое подходит, чуть меньше — нет', () => {
    // Вт — 4 из 8; остальные дни учёта — 48, вдвое реже — 12 из 48.
    const twice = [...work, ...on('s', 1, [0, 1, 2, 3]), ...on('s', 2, ALL), ...on('s', 3, [0, 1, 2, 3])]
    expect(row(twice, 1).items.map((item) => item.categoryId)).toEqual(['s'])
    const less = [...twice, ...on('s', 4, [0])]
    expect(row(less, 1).items).toEqual([])
  })

  it('дней учёта меньше трёх — «мало данных», строка не прячется', () => {
    const blocks = on('s', 6, [0, 1])
    const sunday = row(blocks, 6)
    expect(sunday).toEqual({ weekday: 6, days: 2, few: true, items: [] })
    expect(weekdayLine(sunday)).toBe('вс: мало данных — дней учёта 2, нужно от 3')
    expect(weekdayPattern(blocks, categories, WEEK, TODAY).rows).toHaveLength(7)
    expect(row(on('s', 6, [0, 1, 2]), 6).few).toBe(false)
  })

  it('блок на надгробии слитой категории — под живой', () => {
    const list = [...categories, cat('old', 'Спорт', 9, { deleted: true, movedTo: 's' })]
    const blocks = [...work, ...on('old', 1, [0, 1, 2]), ...on('s', 1, [3, 4, 5])]
    expect(row(blocks, 1, list).items).toEqual([{ categoryId: 's', name: 'Спорт', days: 6, minutes: 360, average: 60 }])
  })

  it('архивная считается, фоновая — нет, удалённые блоки и дни вне окна — нет', () => {
    const list = [...categories, cat('a', 'Шахматы', 4, { archived: true })]
    const blocks = [
      ...work,
      ...on('a', 3, ALL),
      ...on('w', 1, ALL, 60, { bgCategoryId: 'g' }),
      ...on('r', 4, ALL, 60, { deleted: true }),
      // Неделя после окна и неделя до него.
      ...['2026-09-15', '2026-09-22', '2026-07-14', '2026-07-07'].map((date) => block('r', date, 60)),
    ]
    expect(row(blocks, 3, list).items.map((item) => item.name)).toEqual(['Шахматы'])
    expect(row(blocks, 1, list).items).toEqual([])
    expect(row(blocks, 4, list).items).toEqual([])
  })

  it('в среднем — минуты в те дни, когда была', () => {
    const blocks = [...work, ...on('s', 1, [0, 1], 30), ...on('s', 1, [2, 3], 90), block('s', day(0, 1), 15)]
    const [item] = row(blocks, 1).items
    expect(item).toMatchObject({ days: 4, minutes: 255, average: 63.75 })
    expect(weekdayLine(row(blocks, 1))).toBe('вт: Спорт — в среднем 1 ч 4 мин, 4 из 8 вт')
  })

  it('не больше трёх: самые частые, при равенстве — больше минут', () => {
    const list = [...categories, cat('m', 'Музыка', 5)]
    const blocks = [
      ...work,
      ...on('g', 5, [0, 1, 2, 3, 4], 30),
      ...on('r', 5, [0, 1, 2, 3, 4, 5], 30),
      ...on('s', 5, [0, 1, 2, 3, 4, 5], 40),
      ...on('m', 5, ALL, 10),
    ]
    expect(row(blocks, 5, list).items.map((item) => item.name)).toEqual(['Музыка', 'Спорт', 'Чтение'])
  })
})
