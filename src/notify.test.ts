import { describe, expect, it } from 'vitest'
import { DAY_KEYS, REMINDER_TAG } from './shared/notify.ts'
import { REVIEW_KEYS } from './notify.ts'

// Механика напоминаний и её тесты — ядра (`shared/notify.test.ts`, Р-83).
// Здесь — только имена, которые лежат на устройствах «Делу Время».
describe('имена напоминаний на устройствах — не меняются никогда', () => {
  it('фоновая проверка и дни напоминания о дне — Р-24', () => {
    expect(REMINDER_TAG).toBe('remind')
    expect(DAY_KEYS).toEqual({ loud: 'reminderLastDay', quiet: 'reminderQuietDay' })
  })

  it('дни напоминания об обзоре — свои — Р-51', () => {
    expect(REVIEW_KEYS).toEqual({ loud: 'reminderReviewDay', quiet: 'reminderReviewQuietDay' })
  })
})
