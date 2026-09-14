import { describe, expect, it } from 'vitest'
import { exportSpan, monthChoices, yearChoices } from './period.ts'

describe('выбор месяца и года — Р-77', () => {
  it('от первого месяца с записями до текущего, свежие сверху; кривое и будущее не в счёт', () => {
    expect(monthChoices(['2026-07-15', 'вчера', '2027-01-01', '2026-09-01', ''], '2026-09-14')).toEqual([
      '2026-09',
      '2026-08',
      '2026-07',
    ])
  })

  it('записей нет — только текущий; показанный раньше первой записи — тоже в списке', () => {
    expect(monthChoices([], '2026-09-14')).toEqual(['2026-09'])
    expect(monthChoices(['2026-09-01'], '2026-09-14', '2026-07')).toEqual(['2026-09', '2026-08', '2026-07'])
  })

  it('годы — по тем же месяцам, свежие сверху', () => {
    expect(yearChoices(['2027-01', '2026-12', '2026-11'])).toEqual([2027, 2026])
  })
})

describe('период выгрузки — Р-79', () => {
  it('всё время, год, месяц; кривое — всё время', () => {
    expect(exportSpan('')).toBeNull()
    expect(exportSpan('y:2026')).toEqual({ period: { from: '2026-01-01', to: '2026-12-31' }, label: '2026 год' })
    expect(exportSpan('m:2026-02')).toEqual({ period: { from: '2026-02-01', to: '2026-02-28' }, label: 'февраль 2026' })
    expect(exportSpan('m:2026-13')).toBeNull()
    expect(exportSpan('y:двадцать')).toBeNull()
  })
})
