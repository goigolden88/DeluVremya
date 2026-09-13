import { describe, expect, it } from 'vitest'
import { MINUTES_PER_DAY } from './categories.ts'
import {
  blockFromTimer,
  parseTimer,
  runningMinutes,
  startTimer,
  stopMinutes,
  timerDate,
} from './timer.ts'

const MINUTE = 60_000

describe('таймер в настройках', () => {
  it('запуск и разбор — туда и обратно', () => {
    const now = new Date(2026, 8, 13, 21, 0)
    expect(parseTimer(startTimer('cat:ютуб', now))).toEqual({ categoryId: 'cat:ютуб', startedAt: now.toISOString() })
    expect(parseTimer(startTimer('cat:ютуб', now, 'cat:покер'))).toMatchObject({ bgCategoryId: 'cat:покер' })
  })

  it('кривое значение — «не идёт»', () => {
    for (const value of [null, 'x', {}, { categoryId: 'a' }, { categoryId: '', startedAt: '2026-09-13T10:00:00Z' }, { categoryId: 'a', startedAt: 'вчера' }, { categoryId: 'a', startedAt: '2026-09-13T10:00:00Z', bgCategoryId: 5 }]) {
      expect(parseTimer(value)).toBeNull()
    }
  })
})

describe('минуты таймера', () => {
  const start = new Date(2026, 8, 13, 21, 0)
  const timer = startTimer('a', start)
  const after = (ms: number) => new Date(start.getTime() + ms)

  it('на экране — полные минуты, при остановке — ближайшая', () => {
    expect(runningMinutes(timer, after(29 * MINUTE + 40_000))).toBe(29)
    expect(stopMinutes(timer, after(29 * MINUTE + 40_000))).toBe(30)
  })

  it('часы перевели назад — ноль, забыли на двое суток — не больше суток', () => {
    expect(runningMinutes(timer, after(-5 * MINUTE))).toBe(0)
    expect(stopMinutes(timer, after(-5 * MINUTE))).toBe(0)
    expect(stopMinutes(timer, after(2 * MINUTES_PER_DAY * MINUTE))).toBe(MINUTES_PER_DAY)
  })
})

describe('блок из таймера', () => {
  it('день — день начала, даже если остановили после полуночи (Р-19)', () => {
    const timer = startTimer('cat:ютуб', new Date(2026, 8, 13, 23, 30), 'cat:покер')
    expect(timerDate(timer)).toBe('2026-09-13')
    expect(blockFromTimer(timer, 60)).toMatchObject({
      date: '2026-09-13',
      categoryId: 'cat:ютуб',
      bgCategoryId: 'cat:покер',
      minutes: 60,
    })
  })

  it('без фоновой — поля нет вовсе', () => {
    const block = blockFromTimer(startTimer('a', new Date(2026, 8, 13, 10, 0)), 15)
    expect('bgCategoryId' in block).toBe(false)
  })
})
