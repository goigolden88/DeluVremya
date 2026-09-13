import { describe, expect, it } from 'vitest'
import type { TimeBlock } from '../../core/model.ts'
import { unfilledNotice } from './remind.ts'

const AT = '2026-09-13T10:00:00.000Z'
const DAY = '2026-09-13'

function block(id: string, extra: Partial<TimeBlock> = {}): TimeBlock {
  return { id, updatedAt: AT, date: DAY, categoryId: 'a', minutes: 30, ...extra }
}

describe('незаполненный день — Р-24', () => {
  it('за сегодня ни одного блока — напоминает', () => {
    expect(unfilledNotice([], DAY, 'Учёт')?.title).toBe('Сегодня ничего не учтено')
  })

  it('хоть один блок сегодня — молчит, сколько бы минут в нём ни было', () => {
    expect(unfilledNotice([block('1', { minutes: 5 })], DAY, 'Учёт')).toBeNull()
  })

  it('вчерашние и удалённые не в счёт', () => {
    expect(unfilledNotice([block('1', { date: '2026-09-12' }), block('2', { deleted: true })], DAY, 'Учёт')).not.toBeNull()
  })

  it('экран назван своим именем, в кавычках и без склонения — Р-26', () => {
    expect(unfilledNotice([], DAY, 'Хронометраж')?.body).toContain('на экране «Хронометраж»')
  })
})
