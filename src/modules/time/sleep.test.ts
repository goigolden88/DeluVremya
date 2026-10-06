import { describe, expect, it } from 'vitest'
import { periodDays } from '../../shared/core/dates.ts'
import type { Sleep, TimeBlock } from '../../app/model.ts'
import { DAY_WINDOW, daySummary, windowElapsed, windowLeft } from './day.ts'
import {
  checkRoutine,
  clockMinutes,
  clockOf,
  dayWindow,
  DEFAULT_TIMES,
  markOn,
  routineId,
  routineOn,
  routineTimes,
  routineToSave,
  sleepWindow,
} from './sleep.ts'

const AT = '2026-10-06T10:00:00.000Z'

function routine(since: string, wake: string, bed: string, extra: Partial<Sleep> = {}): Sleep {
  return { id: routineId(since), updatedAt: AT, since, wake, bed, ...extra }
}

function mark(day: string, wake: string, bed: string, extra: Partial<Sleep> = {}): Sleep {
  return { id: `sleep:${day}`, updatedAt: AT, day, wake, bed, ...extra }
}

/** Сохранить, как `db.put`: запись с тем же id заменяется. */
function saved(sleeps: readonly Sleep[], record: Sleep | null): Sleep[] {
  return record ? [...sleeps.filter((each) => each.id !== record.id), record] : [...sleeps]
}

describe('время «ЧЧ:ММ»', () => {
  it('читается в минуты от полуночи; кривое — null', () => {
    expect(['07:30', '00:00', '23:59'].map(clockMinutes)).toEqual([450, 0, 1439])
    expect(['24:00', '7:30', '07:60', '', 'утро'].map(clockMinutes)).toEqual([null, null, null, null, null])
  })

  it('часы окна — обратно в «ЧЧ:ММ» по часам; по умолчанию — границы прежнего окна', () => {
    expect([8, 24, 24.5, 7.25].map(clockOf)).toEqual(['08:00', '00:00', '00:30', '07:15'])
    expect(DEFAULT_TIMES).toEqual({ wake: '08:00', bed: '00:00' })
    expect(sleepWindow(DEFAULT_TIMES)).toEqual(DAY_WINDOW)
  })
})

describe('окно по подъёму и отбою — Р-94', () => {
  it('отбой позже подъёма — в тот же день', () => {
    expect(sleepWindow({ wake: '07:00', bed: '23:00' })).toEqual({ from: 7, to: 23 })
  })

  it('отбой не позже подъёма по часам — после полуночи', () => {
    expect(sleepWindow({ wake: '08:00', bed: '00:30' })).toEqual({ from: 8, to: 24.5 })
    // Лечь в 7 утра и встать в 15 — окно 15:00–7:00 следующих суток, так и считается.
    expect(sleepWindow({ wake: '15:00', bed: '07:00' })).toEqual({ from: 15, to: 31 })
  })

  it('подъём, совпавший с отбоем, и кривое время — окна нет', () => {
    expect(sleepWindow({ wake: '07:30', bed: '07:30' })).toBeNull()
    expect(sleepWindow({ wake: '', bed: '23:00' })).toBeNull()
    expect(sleepWindow({ wake: '07:00', bed: '25:00' })).toBeNull()
  })
})

describe('выбор окна дня: отметка → распорядок → по умолчанию — Р-94', () => {
  const DAY = '2026-10-06'

  it('без распорядка и отметок — 8–24, как было', () => {
    expect(dayWindow([], DAY)).toEqual(DAY_WINDOW)
    expect(routineOn([], DAY)).toBeNull()
    expect(markOn([], DAY)).toBeNull()
  })

  it('распорядок действует с дня since и дальше, до него — по умолчанию', () => {
    const sleeps = [routine(DAY, '07:00', '00:30')]
    expect(dayWindow(sleeps, DAY)).toEqual({ from: 7, to: 24.5 })
    expect(dayWindow(sleeps, '2026-12-31')).toEqual({ from: 7, to: 24.5 })
    expect(dayWindow(sleeps, '2026-10-05')).toEqual(DAY_WINDOW)
  })

  it('отметка дня главнее распорядка — только в свой день', () => {
    const sleeps = [routine('2026-10-01', '07:00', '23:00'), mark(DAY, '10:00', '02:00')]
    expect(dayWindow(sleeps, DAY)).toEqual({ from: 10, to: 26 })
    expect(dayWindow(sleeps, '2026-10-07')).toEqual({ from: 7, to: 23 })
    expect(markOn(sleeps, DAY)?.id).toBe(`sleep:${DAY}`)
    // Отметка — не распорядок: на следующие дни она не тянется.
    expect(routineOn(sleeps, '2026-10-07')?.id).toBe('routine:2026-10-01')
  })

  it('отметка без распорядка — свой день, остальные по умолчанию', () => {
    const sleeps = [mark(DAY, '09:30', '01:00')]
    expect(dayWindow(sleeps, DAY)).toEqual({ from: 9.5, to: 25 })
    expect(dayWindow(sleeps, '2026-10-07')).toEqual(DAY_WINDOW)
  })

  it('удалённые и кривые записи — как будто их нет', () => {
    const base = routine('2026-10-01', '07:00', '23:00')
    expect(dayWindow([routine(DAY, '06:00', '22:00', { deleted: true }), base], DAY)).toEqual({ from: 7, to: 23 })
    expect(dayWindow([mark(DAY, '10:00', '', {}), base], DAY)).toEqual({ from: 7, to: 23 })
    expect(dayWindow([mark(DAY, '10:00', '10:00'), base], DAY)).toEqual({ from: 7, to: 23 })
    const noSince: Sleep = { id: 'routine:?', updatedAt: AT, wake: '06:00', bed: '22:00' }
    expect(dayWindow([noSince], DAY)).toEqual(DAY_WINDOW)
    expect(dayWindow([routine('вчера', '06:00', '22:00')], DAY)).toEqual(DAY_WINDOW)
  })

  it('две записи на одну дату — после правки руками — побеждает поздняя', () => {
    const early = routine(DAY, '06:00', '22:00', { id: 'a', updatedAt: '2026-10-06T07:00:00.000Z' })
    const late = routine(DAY, '07:00', '23:00', { id: 'b', updatedAt: '2026-10-06T19:00:00.000Z' })
    expect(dayWindow([late, early], DAY)).toEqual({ from: 7, to: 23 })
    expect(dayWindow([early, late], DAY)).toEqual({ from: 7, to: 23 })
  })
})

describe('смена распорядка в середине месяца — Р-94', () => {
  // До октября распорядка нет; с 1-го — 6:30–23:00, с 15-го — 9:00–0:30.
  const sleeps = [routine('2026-10-01', '06:30', '23:00'), routine('2026-10-15', '09:00', '00:30')]
  const after = new Date(2026, 10, 2, 12, 0)

  it('каждый день — по распорядку, действовавшему тогда', () => {
    expect(dayWindow(sleeps, '2026-09-30')).toEqual(DAY_WINDOW)
    expect(dayWindow(sleeps, '2026-10-01')).toEqual({ from: 6.5, to: 23 })
    expect(dayWindow(sleeps, '2026-10-14')).toEqual({ from: 6.5, to: 23 })
    expect(dayWindow(sleeps, '2026-10-15')).toEqual({ from: 9, to: 24.5 })
    expect(dayWindow(sleeps, '2026-10-31')).toEqual({ from: 9, to: 24.5 })
  })

  it('окно месяца — сумма окон его дней: четырнадцать дней по 16,5 ч и семнадцать по 15,5 ч', () => {
    const days = periodDays({ from: '2026-10-01', to: '2026-10-31' })
    const total = days.reduce((sum, day) => sum + windowElapsed(day, after, dayWindow(sleeps, day)), 0)
    expect(total).toBe(14 * 990 + 17 * 930)
  })

  it('неучтённое прошлого дня — от его собственного окна', () => {
    const block = (date: string): TimeBlock => ({ id: date, updatedAt: AT, date, categoryId: 'cat:чтение', minutes: 90 })
    const blocks = [block('2026-09-30'), block('2026-10-14'), block('2026-10-20')]
    const unaccounted = (day: string) => daySummary(blocks, [], day, after, dayWindow(sleeps, day)).unaccounted
    expect(unaccounted('2026-09-30')).toBe(16 * 60 - 90)
    expect(unaccounted('2026-10-14')).toBe(990 - 90)
    expect(unaccounted('2026-10-20')).toBe(930 - 90)
  })
})

describe('окно с минутами и после полуночи — неучтено и реализм', () => {
  const DAY = '2026-10-06'
  const at = (hours: number, minutes = 0) => new Date(2026, 9, 6, hours, minutes)

  it('отбой в 0:30: вечером остаток идёт за полночь, прошедший день — всё окно', () => {
    const window = { from: 8, to: 24.5 }
    expect(windowElapsed(DAY, at(23), window)).toBe(15 * 60)
    expect(windowLeft(DAY, at(23), window)).toBe(90)
    expect(windowLeft(DAY, at(7), window)).toBe(16 * 60 + 30)
    expect(windowElapsed(DAY, new Date(2026, 9, 7, 0, 15), window)).toBe(16 * 60 + 30)
  })

  it('минуты подъёма и отбоя — целые минуты, без хвостов дробей', () => {
    const window = sleepWindow({ wake: '07:10', bed: '23:50' })!
    expect(windowElapsed(DAY, at(10), window)).toBe(170)
    expect(windowLeft(DAY, at(10), window)).toBe(1000 - 170)
    expect(windowElapsed(DAY, at(7, 5), window)).toBe(0)
  })
})

describe('распорядок из «Настроек» — Р-94', () => {
  const TODAY = '2026-10-06'

  it('в форме — действующий сегодня распорядок, без него — по умолчанию', () => {
    expect(routineTimes([], TODAY)).toEqual(DEFAULT_TIMES)
    expect(routineTimes([routine('2026-10-01', '07:00', '23:00')], TODAY)).toEqual({ wake: '07:00', bed: '23:00' })
  })

  it('сохранение — распорядок с сегодняшнего дня: сегодня и дальше по нему, прошлые дни — нет', () => {
    const record = routineToSave({ wake: '07:00', bed: '00:30' }, [], TODAY)
    expect(record).toMatchObject({ id: `routine:${TODAY}`, since: TODAY, wake: '07:00', bed: '00:30' })
    expect(record?.day).toBeUndefined()
    const sleeps = saved([], record)
    expect(dayWindow(sleeps, TODAY)).toEqual({ from: 7, to: 24.5 })
    expect(dayWindow(sleeps, '2026-10-07')).toEqual({ from: 7, to: 24.5 })
    expect(dayWindow(sleeps, '2026-10-05')).toEqual(DAY_WINDOW)
  })

  it('правка в тот же день — та же запись', () => {
    const first = saved([], routineToSave({ wake: '07:00', bed: '00:30' }, [], TODAY))
    const second = saved(first, routineToSave({ wake: '07:30', bed: '01:00' }, first, TODAY))
    expect(second).toHaveLength(1)
    expect(second[0]).toMatchObject({ id: `routine:${TODAY}`, wake: '07:30', bed: '01:00' })
    expect(dayWindow(second, TODAY)).toEqual({ from: 7.5, to: 25 })
  })

  it('на двух устройствах в один день — один id: слияние оставит одну запись', () => {
    const phone = routineToSave({ wake: '07:00', bed: '23:30' }, [], TODAY)
    const laptop = routineToSave({ wake: '07:30', bed: '00:30' }, [], TODAY)
    expect(phone?.id).toBe(laptop?.id)
  })

  it('новый распорядок поверх прежнего — своей записью, прежние дни при прежнем', () => {
    const before = [routine('2026-10-01', '07:00', '23:00')]
    const sleeps = saved(before, routineToSave({ wake: '09:00', bed: '01:00' }, before, TODAY))
    expect(sleeps.map((each) => each.id)).toEqual(['routine:2026-10-01', `routine:${TODAY}`])
    expect(dayWindow(sleeps, '2026-10-05')).toEqual({ from: 7, to: 23 })
    expect(dayWindow(sleeps, TODAY)).toEqual({ from: 9, to: 25 })
  })

  it('тот же распорядок, что действует, — сохранять нечего', () => {
    expect(routineToSave(DEFAULT_TIMES, [], TODAY)).toBeNull()
    const sleeps = [routine('2026-10-01', '07:00', '23:00')]
    expect(routineToSave({ wake: '07:00', bed: '23:00' }, sleeps, TODAY)).toBeNull()
  })

  it('не сохраняется: время не читается, подъём совпал с отбоем', () => {
    expect(checkRoutine({ wake: '', bed: '23:00' })).toBe('clock')
    expect(checkRoutine({ wake: '07:00', bed: '07:00' })).toBe('same')
    expect(checkRoutine({ wake: '07:00', bed: '00:30' })).toBeNull()
  })
})
