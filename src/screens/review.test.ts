import { describe, expect, it } from 'vitest'
import type { Review } from '../app/model.ts'
import {
  CALL_DAYS,
  DEFAULT_THRESHOLDS,
  doneText,
  dueWeek,
  markReviewed,
  parseThresholds,
  readThreshold,
  reviewCall,
  reviewId,
  reviewNotice,
  reviewOf,
  viewedWeek,
} from './review.ts'

// 13.09.2026 — воскресенье, 14.09.2026 — понедельник.
const SUNDAY = '2026-09-13'
const MONDAY = '2026-09-14'

function review(week: string, extra: Partial<Review> = {}): Review {
  return { id: reviewId(week), updatedAt: '2026-09-13T18:00:00.000Z', weekStart: week, doneAt: '2026-09-13T18:00:00.000Z', ...extra }
}

describe('неделя к обзору — Р-41', () => {
  it('в воскресенье — текущая, в остальные дни — прошлая', () => {
    expect(dueWeek(SUNDAY)).toBe('2026-09-07')
    expect(dueWeek(MONDAY)).toBe('2026-09-07')
    expect(dueWeek('2026-09-19')).toBe('2026-09-07')
    expect(dueWeek('2026-09-20')).toBe('2026-09-14')
  })

  it('из адреса — понедельник прошлой или текущей недели; будущая и кривая — к обзору', () => {
    expect(viewedWeek('2026-08-05', MONDAY)).toBe('2026-08-03')
    expect(viewedWeek('2026-09-16', MONDAY)).toBe('2026-09-14')
    expect(viewedWeek('2026-09-21', MONDAY)).toBe('2026-09-07')
    expect(viewedWeek('неделя', MONDAY)).toBe('2026-09-07')
    expect(viewedWeek(null, SUNDAY)).toBe('2026-09-07')
  })
})

describe('один обзор на неделю — Р-42', () => {
  it('id из понедельника; второй раз — та же запись, ссылки без повторов', () => {
    const first = markReviewed(null, '2026-09-07', '2026-09-13T18:00:00.000Z', ['note:A'])
    expect(first).toEqual({
      id: 'review:2026-09-07',
      updatedAt: '2026-09-13T18:00:00.000Z',
      weekStart: '2026-09-07',
      doneAt: '2026-09-13T18:00:00.000Z',
      refs: ['note:A'],
    })
    const again = markReviewed(first, '2026-09-07', '2026-09-14T09:00:00.000Z', ['note:A', 'note:B'])
    expect(again).toMatchObject({ id: 'review:2026-09-07', doneAt: '2026-09-14T09:00:00.000Z', refs: ['note:A', 'note:B'] })
    expect('refs' in markReviewed(null, '2026-09-07', '2026-09-13T18:00:00.000Z')).toBe(false)
  })

  it('проведённый — живой и той самой недели', () => {
    expect(reviewOf([review('2026-08-31'), review('2026-09-07', { deleted: true })], '2026-09-07')).toBeNull()
    expect(reviewOf([review('2026-09-07')], '2026-09-07')?.weekStart).toBe('2026-09-07')
  })

  it('когда проведён — по часам устройства; кривое время — без даты', () => {
    const at = new Date(2026, 8, 13, 19, 5).toISOString()
    expect(doneText(review('2026-09-07', { doneAt: at }))).toBe('Обзор проведён 13 сентября 2026 в 19:05')
    expect(doneText(review('2026-09-07', { doneAt: 'вчера' }))).toBe('Обзор проведён')
  })
})

describe('звать к обзору — Р-41, Р-51', () => {
  it('в воскресенье и понедельник, пока обзора нет', () => {
    expect(CALL_DAYS).toBe(2)
    expect(reviewCall([], SUNDAY)).toBe('2026-09-07')
    expect(reviewCall([], MONDAY)).toBe('2026-09-07')
    expect(reviewCall([review('2026-09-07')], MONDAY)).toBeNull()
  })

  it('со вторника по субботу — не звать', () => {
    for (const day of ['2026-09-15', '2026-09-16', '2026-09-19']) expect(reviewCall([], day)).toBeNull()
  })

  it('напоминание — про ту же неделю, после обзора — молчит', () => {
    expect(reviewNotice([], SUNDAY)?.body).toContain('7–13 сентября 2026')
    expect(reviewNotice([review('2026-09-07')], SUNDAY)).toBeNull()
  })
})

describe('пороги обзора — Р-48', () => {
  it('по умолчанию 30 и 28 дней', () => {
    expect(DEFAULT_THRESHOLDS).toEqual({ stale: 30, goal: 28 })
  })

  it('из настроек: кривое и пустое — умолчание', () => {
    expect(parseThresholds(45, 14)).toEqual({ stale: 45, goal: 14 })
    expect(parseThresholds('45', 0)).toEqual(DEFAULT_THRESHOLDS)
    expect(parseThresholds(undefined, 3.5)).toEqual(DEFAULT_THRESHOLDS)
  })

  it('из поля — целые дни в пределах', () => {
    expect(readThreshold(' 21 ')).toBe(21)
    expect(readThreshold('0')).toBeNull()
    expect(readThreshold('400')).toBeNull()
    expect(readThreshold('2,5')).toBeNull()
    expect(readThreshold('')).toBeNull()
  })
})
