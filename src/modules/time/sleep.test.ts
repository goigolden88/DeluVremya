import { describe, expect, it } from 'vitest'
import type { Sleep } from '../../app/model.ts'
import { daySummary, DAY_WINDOW, windowElapsed, windowLeft, windowLength } from './day.ts'
import { routineLine, SLEEP_PROBLEMS, windowNote, windowText } from './labels.ts'
import {
  checkSleep,
  clockMinutes,
  clockOf,
  dayWindow,
  markOn,
  routineDraft,
  routineFrom,
  routineId,
  routineOn,
  sleepId,
  windowOf,
} from './sleep.ts'

const AT = '2026-10-06T10:00:00.000Z'

function routine(since: string, wake: string, bed: string, extra: Partial<Sleep> = {}): Sleep {
  return { id: routineId(since), updatedAt: AT, since, wake, bed, ...extra }
}

function mark(day: string, wake: string, bed: string, extra: Partial<Sleep> = {}): Sleep {
  return { id: sleepId(day), updatedAt: AT, day, wake, bed, ...extra }
}

describe('время «ЧЧ:ММ»', () => {
  it('минуты от полуночи; кривое и вне суток — null', () => {
    expect(clockMinutes('07:30')).toBe(450)
    expect(clockMinutes('00:00')).toBe(0)
    expect(clockMinutes('23:59')).toBe(1439)
    for (const bad of ['24:00', '7:30', '07:60', '', 'утро']) expect(clockMinutes(bad)).toBeNull()
  })

  it('час окна — обратно в «ЧЧ:ММ» для поля времени, за полночью — по часам', () => {
    expect(clockOf(DAY_WINDOW.from)).toBe('08:00')
    expect(clockOf(DAY_WINDOW.to)).toBe('00:00')
    expect(clockOf(24.5)).toBe('00:30')
    expect(clockOf(7.5)).toBe('07:30')
  })

  it('оба времени нужны и не совпадают', () => {
    expect(checkSleep({ wake: '08:00', bed: '00:30' })).toBeNull()
    expect(checkSleep({ wake: '', bed: '00:30' })).toBe('clock')
    expect(checkSleep({ wake: '08:00', bed: '08:00' })).toBe('same')
    expect(SLEEP_PROBLEMS.same).toContain('совпадают')
  })
})

describe('окно из подъёма и отбоя', () => {
  it('отбой позже подъёма — в те же сутки', () => {
    expect(windowOf({ wake: '07:00', bed: '23:00' })).toEqual({ from: 7, to: 23 })
  })

  it('отбой не позже подъёма по часам — после полуночи: 8:00 / 0:30 — до 24:30', () => {
    expect(windowOf({ wake: '08:00', bed: '00:30' })).toEqual({ from: 8, to: 24.5 })
    expect(windowOf({ wake: '08:00', bed: '00:00' })).toEqual(DAY_WINDOW)
    // Лечь в 7 утра и встать в 15 — окно 15:00–7:00 следующих суток (Р-94, «Цена»).
    expect(windowOf({ wake: '15:00', bed: '07:00' })).toEqual({ from: 15, to: 31 })
  })

  it('кривое время или подъём, равный отбою, окна не задают', () => {
    expect(windowOf({ wake: '08:00', bed: '08:00' })).toBeNull()
    expect(windowOf({ wake: 'восемь', bed: '00:30' })).toBeNull()
  })
})

describe('окно дня: отметка → распорядок → по умолчанию', () => {
  const DAY = '2026-10-15'

  it('без распорядка и отметок — как было, 8–24', () => {
    expect(dayWindow([], DAY)).toEqual(DAY_WINDOW)
  })

  it('распорядок, действующий на день, — если отметки нет', () => {
    expect(dayWindow([routine('2026-10-01', '07:00', '23:00')], DAY)).toEqual({ from: 7, to: 23 })
  })

  it('отметка дня — главнее распорядка, и только на свой день', () => {
    const records = [routine('2026-10-01', '07:00', '23:00'), mark(DAY, '10:00', '02:00')]
    expect(dayWindow(records, DAY)).toEqual({ from: 10, to: 26 })
    expect(dayWindow(records, '2026-10-16')).toEqual({ from: 7, to: 23 })
    expect(markOn(records, DAY)?.id).toBe('sleep:2026-10-15')
  })

  it('удалённые и кривые записи не в счёт — окно уходит на следующее правило', () => {
    const records = [
      routine('2026-10-01', '07:00', '23:00'),
      routine('2026-10-10', '06:00', '22:00', { deleted: true }),
      mark(DAY, '10:00', '10:00'),
      routine('2026-10-12', 'утро', '22:00'),
    ]
    expect(dayWindow(records, DAY)).toEqual({ from: 7, to: 23 })
  })
})

describe('смена распорядка в середине месяца', () => {
  const records = [routine('2026-10-01', '07:00', '23:00'), routine('2026-10-15', '08:00', '00:30')]

  it('дни до смены — со старым, со дня смены и дальше — с новым', () => {
    expect(dayWindow(records, '2026-10-14')).toEqual({ from: 7, to: 23 })
    expect(dayWindow(records, '2026-10-15')).toEqual({ from: 8, to: 24.5 })
    expect(dayWindow(records, '2026-10-31')).toEqual({ from: 8, to: 24.5 })
    expect(routineOn(records, '2026-10-20')?.since).toBe('2026-10-15')
  })

  it('дни раньше первого распорядка — по умолчанию', () => {
    expect(dayWindow(records, '2026-09-30')).toEqual(DAY_WINDOW)
  })

  it('порядок записей в базе не важен', () => {
    expect(dayWindow([...records].reverse(), '2026-10-20')).toEqual({ from: 8, to: 24.5 })
  })
})

describe('распорядок из «Настроек»', () => {
  const TODAY = '2026-10-06'

  it('действует с сегодня; id — из даты', () => {
    expect(routineFrom({ wake: '07:30', bed: '00:30' }, TODAY)).toMatchObject({
      id: 'routine:2026-10-06',
      since: TODAY,
      wake: '07:30',
      bed: '00:30',
    })
  })

  it('правка в тот же день — та же запись; на другой день — новая, старая остаётся', () => {
    const first = routineFrom({ wake: '07:30', bed: '00:30' }, TODAY)
    expect(routineFrom({ wake: '06:00', bed: '23:00' }, TODAY).id).toBe(first.id)
    expect(routineFrom({ wake: '06:00', bed: '23:00' }, '2026-10-07').id).not.toBe(first.id)
  })

  it('у отметки дня и распорядка разные id, даже на одну дату', () => {
    expect(routineId(TODAY)).not.toBe(sleepId(TODAY))
  })

  it('форма — распорядок на сегодня, нет — окно по умолчанию', () => {
    expect(routineDraft([], TODAY)).toEqual({ wake: '08:00', bed: '00:00' })
    expect(routineDraft([routine('2026-10-01', '07:00', '23:30')], TODAY)).toEqual({ wake: '07:00', bed: '23:30' })
    // Распорядок с завтра в форму сегодня не встаёт.
    expect(routineDraft([routine('2026-10-07', '07:00', '23:30')], TODAY)).toEqual({ wake: '08:00', bed: '00:00' })
  })
})

describe('окно после полуночи в «неучтено» и реализме', () => {
  const DAY = '2026-10-06'
  const late = { from: 8, to: 24.5 }

  it('длина — с подъёма до отбоя следующих суток', () => {
    expect(windowLength(late)).toBe(16 * 60 + 30)
    expect(windowLength({ from: 7.5, to: 23 })).toBe(15 * 60 + 30)
  })

  it('после полуночи окно вчерашнего дня ещё идёт; сегодняшнее — ещё не началось', () => {
    const night = new Date(2026, 9, 7, 0, 15)
    expect(windowElapsed(DAY, night, late)).toBe(16 * 60 + 15)
    expect(windowLeft(DAY, night, late)).toBe(15)
    expect(windowElapsed('2026-10-07', night, late)).toBe(0)
  })

  it('окно кончилось — прошедший день целиком', () => {
    expect(windowElapsed(DAY, new Date(2026, 9, 7, 1, 0), late)).toBe(windowLength(late))
    expect(windowLeft(DAY, new Date(2026, 9, 8, 12, 0), late)).toBe(0)
  })

  it('подъём с минутами: до него ноль, дальше — от него', () => {
    const window = { from: 7.5, to: 23 }
    expect(windowElapsed(DAY, new Date(2026, 9, 6, 7, 20), window)).toBe(0)
    expect(windowElapsed(DAY, new Date(2026, 9, 6, 9, 0), window)).toBe(90)
  })

  it('итог дня берёт окно дня, а не константу', () => {
    const now = new Date(2026, 9, 6, 9, 0)
    expect(daySummary([], [], DAY, now).elapsed).toBe(60)
    expect(daySummary([], [], DAY, now, { from: 7.5, to: 23 }).elapsed).toBe(90)
  })
})

describe('окно словами', () => {
  it('по умолчанию — «с 8 до 24», как было', () => {
    expect(windowText(DAY_WINDOW)).toBe('с 8 до 24')
    expect(windowNote()).toContain('с 8 до 24')
  })

  it('минуты — через двоеточие; за полночью — по часам следующих суток', () => {
    expect(windowText({ from: 7.5, to: 23 })).toBe('с 7:30 до 23')
    expect(windowText({ from: 8, to: 24.5 })).toBe('с 8 до 0:30 следующих суток')
    expect(windowNote({ from: 15, to: 31 })).toContain('с 15 до 7 следующих суток')
  })

  it('итог «Распорядка» — без ведущего нуля', () => {
    expect(routineLine({ wake: '07:30', bed: '00:30' })).toBe('подъём 7:30, отбой 0:30')
  })
})
