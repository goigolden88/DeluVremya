import { describe, expect, it } from 'vitest'
import type { Sleep, SpecialDays } from '../../app/model.ts'
import { daySummary, DAY_WINDOW, windowElapsed, windowLeft, windowLength } from './day.ts'
import {
  DEFAULT_WINDOW_NOTE,
  daySleepLine,
  MARK_PROBLEMS,
  NO_ROUTINE,
  ROUTINE_PROBLEMS,
  routineLine,
  routineSavedLine,
  SLEEP_PROBLEMS,
  windowNote,
  windowText,
} from './labels.ts'
import {
  checkMark,
  checkRoutine,
  checkSleep,
  clockMinutes,
  clockOf,
  daySleep,
  dayWindow,
  markChange,
  markOn,
  nextRoutine,
  nightsSleep,
  routineDraft,
  routineFrom,
  routineId,
  routineOn,
  sleepId,
  usualChange,
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

  it('с прошлого дня (Р-99): прошлые дни с этой даты — по нему, раньше — как были', () => {
    const records = [routineFrom({ wake: '07:00', bed: '23:00' }, '2026-09-01')]
    expect(records[0]).toMatchObject({ id: 'routine:2026-09-01', since: '2026-09-01' })
    expect(dayWindow(records, '2026-09-01')).toEqual({ from: 7, to: 23 })
    expect(dayWindow(records, '2026-09-20')).toEqual({ from: 7, to: 23 })
    expect(dayWindow(records, '2026-08-31')).toEqual(DAY_WINDOW)
    expect(nightsSleep(records, [], { from: '2026-09-14', to: '2026-09-20' }, TODAY)).toMatchObject({
      routine: true,
      byRoutine: 7,
      beforeRoutine: 0,
    })
  })

  it('тот же прошлый день — та же запись', () => {
    const first = routineFrom({ wake: '07:00', bed: '23:00' }, '2026-09-01')
    const again = routineFrom({ wake: '06:30', bed: '22:30' }, '2026-09-01')
    expect(again.id).toBe(first.id)
    expect(again.since).toBe(first.since)
  })

  it('более поздний распорядок важнее раннего: задним числом — только до него', () => {
    const later = routine(TODAY, '07:30', '00:30')
    const earlier = routineFrom({ wake: '09:00', bed: '23:00' }, '2026-09-01')
    const records = [later, earlier]
    expect(dayWindow(records, '2026-10-05')).toEqual({ from: 9, to: 23 })
    expect(dayWindow(records, TODAY)).toEqual({ from: 7.5, to: 24.5 })
    expect(nextRoutine(records, '2026-09-01')?.since).toBe(TODAY)
    expect(nextRoutine(records, TODAY)).toBeNull()
  })

  it('следующий распорядок — ближайший позже дня; удалённые и отметки не в счёт', () => {
    const records = [
      routine('2026-09-20', '07:00', '23:00'),
      routine('2026-09-10', '07:00', '23:00', { deleted: true }),
      routine('2026-09-15', '07:00', '23:00'),
      mark('2026-09-05', '07:00', '23:00'),
    ]
    expect(nextRoutine(records, '2026-09-01')?.since).toBe('2026-09-15')
    expect(nextRoutine(records, '2026-09-15')?.since).toBe('2026-09-20')
  })

  it('отметка дня важнее распорядка, заданного задним числом', () => {
    const records = [routineFrom({ wake: '07:00', bed: '23:00' }, '2026-09-01'), mark('2026-09-10', '10:00', '02:00')]
    expect(dayWindow(records, '2026-09-10')).toEqual({ from: 10, to: 26 })
    expect(dayWindow(records, '2026-09-11')).toEqual({ from: 7, to: 23 })
  })

  it('будущий день — отказ; сегодня и прошлый — можно; день не выбран — отказ', () => {
    const draft = { wake: '07:30', bed: '00:30' }
    expect(checkRoutine(draft, TODAY, TODAY)).toBeNull()
    expect(checkRoutine(draft, '2026-09-01', TODAY)).toBeNull()
    expect(checkRoutine(draft, '2026-10-07', TODAY)).toBe('future')
    expect(checkRoutine(draft, '', TODAY)).toBe('date')
    expect(checkRoutine({ wake: '08:00', bed: '08:00' }, '2026-09-01', TODAY)).toBe('same')
    expect(ROUTINE_PROBLEMS.future).toContain('не наступил')
    expect(ROUTINE_PROBLEMS.same).toBe(SLEEP_PROBLEMS.same)
  })

  it('строка после сохранения называет день и окно; есть распорядок позже — до него', () => {
    expect(routineSavedLine('2026-09-01', { from: 7.5, to: 24.5 })).toBe(
      'Сохранено: с 1 сентября 2026 окно дня — с 7:30 до 0:30 следующих суток. Дни раньше остаются со своим.',
    )
    expect(routineSavedLine('2026-09-01', { from: 9, to: 23 }, '2026-10-07')).toBe(
      'Сохранено: с 1 сентября 2026 окно дня — с 9 до 23. Действует с 1 сентября 2026 до 7 октября 2026; дальше — распорядок с 7 октября 2026.',
    )
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

describe('сон за ночь — Р-97', () => {
  /** 14–20 сентября 2026: понедельник — воскресенье. */
  const WEEK = { from: '2026-09-14', to: '2026-09-20' }
  const AFTER = '2026-09-21'
  const BASE = routine('2026-09-01', '07:00', '23:00')
  const trip: SpecialDays = { id: 's1', updatedAt: AT, from: '2026-09-18', to: '2026-09-19' }

  it('отметка и распорядок вперемешку; один отмеченный конец — ночь по распорядку', () => {
    const records = [BASE, mark('2026-09-15', '08:00', '00:30'), mark('2026-09-16', '06:30', '23:30')]
    expect(nightsSleep(records, [], WEEK, AFTER)).toEqual({
      routine: true,
      nights: 7,
      // Отмечена с обоих концов одна: отбой 15-го в 0:30 — подъём 16-го в 6:30, 6 ч.
      marked: 1,
      byRoutine: 6,
      beforeRoutine: 0,
      special: 0,
      // 23:00 → 7:00 по 8 ч — четыре ночи; 23:00 → 8:00 — 9 ч; 23:30 → 7:00 — 7 ч 30 мин.
      minutes: 4 * 480 + 360 + 540 + 450,
    })
  })

  it('ночи до первого распорядка — не в счёте; отмеченная с обоих концов — в счёте и без него', () => {
    const late = routine('2026-09-17', '07:00', '23:00')
    expect(nightsSleep([late], [], WEEK, AFTER)).toMatchObject({ nights: 7, beforeRoutine: 4, byRoutine: 3, marked: 0 })
    const records = [late, mark('2026-09-15', '08:00', '00:00'), mark('2026-09-16', '08:00', '00:00')]
    // Перед 16-м — оба конца отмечены; перед 17-м — отбой отмечен, подъём по распорядку.
    expect(nightsSleep(records, [], WEEK, AFTER)).toMatchObject({ beforeRoutine: 2, marked: 1, byRoutine: 4 })
  })

  it('смена распорядка внутри недели: отбой — по распорядку вечера, подъём — по распорядку утра', () => {
    const records = [BASE, routine('2026-09-17', '09:00', '01:00')]
    // До 16-го — 8 ч; 23:00 → 9:00 — 10 ч; дальше 1:00 → 9:00 — 8 ч.
    expect(nightsSleep(records, [], WEEK, AFTER)).toMatchObject({ byRoutine: 7, minutes: 6 * 480 + 600 })
  })

  it('отбой после полуночи — от него, а не от прошлой полуночи', () => {
    const records = [routine('2026-09-01', '15:00', '07:00')]
    // Лечь в 7 утра и встать в 15 — 8 ч сна (Р-94, «Цена»).
    expect(nightsSleep(records, [], { from: '2026-09-14', to: '2026-09-14' }, AFTER).minutes).toBe(480)
  })

  it('ночь, задевшая особый день, — в счёте только отмеченной с обоих концов', () => {
    const records = [BASE, mark('2026-09-18', '10:00', '02:00'), mark('2026-09-19', '09:00', '01:00')]
    expect(nightsSleep(records, [trip], WEEK, AFTER)).toMatchObject({
      nights: 7,
      // Перед 19-м: отбой 18-го в 2:00 — подъём в 9:00, 7 ч.
      marked: 1,
      // Перед 18-м и 20-м — один конец по распорядку.
      special: 2,
      byRoutine: 4,
      minutes: 4 * 480 + 420,
    })
  })

  it('нет распорядка — так и сказано, отметки его не заменяют', () => {
    const records = [mark('2026-09-15', '08:00', '00:00'), mark('2026-09-16', '08:00', '00:00')]
    expect(nightsSleep(records, [], WEEK, AFTER)).toMatchObject({ routine: false, marked: 1, beforeRoutine: 6 })
    expect(nightsSleep([], [], WEEK, AFTER)).toMatchObject({ routine: false, nights: 7, beforeRoutine: 7 })
  })

  it('идущая неделя — только ночи перед прошедшими днями, сегодняшняя тоже', () => {
    expect(nightsSleep([BASE], [], WEEK, '2026-09-16')).toMatchObject({ nights: 3, byRoutine: 3, minutes: 3 * 480 })
    expect(nightsSleep([BASE], [], WEEK, '2026-09-13')).toMatchObject({ nights: 0, minutes: 0 })
  })

  it('удалённая отметка не в счёт; кривая пара концов — не меньше нуля', () => {
    const removed = [BASE, mark('2026-09-14', '05:00', '21:00', { deleted: true })]
    expect(nightsSleep(removed, [], { from: '2026-09-14', to: '2026-09-14' }, AFTER)).toMatchObject({ byRoutine: 1, minutes: 480 })
    // Отбой 14-го в 2:00 следующих суток, подъём 15-го в 1:00 — раньше отбоя.
    const odd = [BASE, mark('2026-09-14', '08:00', '02:00'), mark('2026-09-15', '01:00', '23:00')]
    expect(nightsSleep(odd, [], { from: '2026-09-15', to: '2026-09-15' }, AFTER)).toMatchObject({ marked: 1, minutes: 0 })
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

describe('отметка дня (Р-96): строка над итогом', () => {
  const DAY = '2026-10-15'

  it('с отметкой — время отметки, без приписки', () => {
    const records = [routine('2026-10-01', '07:00', '23:00'), mark(DAY, '07:40', '00:30')]
    const entry = daySleep(records, DAY)
    expect(entry).toEqual({ wake: '07:40', bed: '00:30', source: 'mark' })
    expect(daySleepLine(entry)).toBe('Подъём 7:40 · отбой 0:30')
  })

  it('без отметки — распорядок дня, с припиской «по распорядку»', () => {
    const entry = daySleep([routine('2026-10-01', '07:00', '23:00')], DAY)
    expect(entry.source).toBe('routine')
    expect(daySleepLine(entry)).toBe('Подъём 7:00 · отбой 23:00 · по распорядку')
  })

  it('без распорядка — окно по умолчанию, тем же текстом, что у «Распорядка» в «Настройках»', () => {
    const entry = daySleep([], DAY)
    expect(entry).toEqual({ wake: clockOf(DAY_WINDOW.from), bed: clockOf(DAY_WINDOW.to), source: 'default' })
    expect(daySleepLine(entry)).toBe(`Подъём 8:00 · отбой 0:00 · ${DEFAULT_WINDOW_NOTE}`)
    expect(NO_ROUTINE).toContain(DEFAULT_WINDOW_NOTE)
  })

  it('удалённая отметка — день снова по распорядку', () => {
    const records = [routine('2026-10-01', '07:00', '23:00'), mark(DAY, '07:40', '00:30', { deleted: true })]
    expect(daySleep(records, DAY).source).toBe('routine')
  })
})

describe('отметка дня (Р-96): «Сохранить» и «Как обычно»', () => {
  const DAY = '2026-10-15'
  const usual = routine('2026-10-01', '07:00', '23:00')

  it('время не как у распорядка — отметка sleep:<день>; правка того же дня — та же запись', () => {
    const change = markChange([usual], { wake: '07:40', bed: '00:30' }, DAY)
    expect(change).toMatchObject({ kind: 'put', record: { id: 'sleep:2026-10-15', day: DAY, wake: '07:40', bed: '00:30' } })
    const again = markChange([usual, mark(DAY, '07:40', '00:30')], { wake: '09:00', bed: '01:00' }, DAY)
    expect(again.kind === 'put' && again.record.id).toBe('sleep:2026-10-15')
    expect(again.kind === 'put' && again.record.since).toBeUndefined()
  })

  it('отбой после полуночи — окно дня до следующих суток', () => {
    const change = markChange([usual], { wake: '08:00', bed: '01:30' }, DAY)
    expect(change.kind).toBe('put')
    if (change.kind !== 'put') return
    expect(dayWindow([usual, change.record], DAY)).toEqual({ from: 8, to: 25.5 })
  })

  it('время распорядка этого дня — отметка не пишется, а была — снимается', () => {
    expect(markChange([usual], { wake: '07:00', bed: '23:00' }, DAY)).toEqual({ kind: 'none' })
    expect(markChange([usual, mark(DAY, '07:40', '00:30')], { wake: '07:00', bed: '23:00' }, DAY)).toEqual({
      kind: 'remove',
      id: 'sleep:2026-10-15',
    })
  })

  it('без распорядка «обычное» — окно по умолчанию', () => {
    expect(markChange([], { wake: '08:00', bed: '00:00' }, DAY)).toEqual({ kind: 'none' })
    expect(markChange([], { wake: '08:00', bed: '00:30' }, DAY).kind).toBe('put')
  })

  it('«Как обычно» снимает отметку; нет её — ничего', () => {
    expect(usualChange([usual, mark(DAY, '07:40', '00:30')], DAY)).toEqual({ kind: 'remove', id: 'sleep:2026-10-15' })
    expect(usualChange([usual], DAY)).toEqual({ kind: 'none' })
    expect(usualChange([usual, mark(DAY, '07:40', '00:30', { deleted: true })], DAY)).toEqual({ kind: 'none' })
    // Отметка другого дня не трогается.
    expect(usualChange([mark('2026-10-14', '07:40', '00:30')], DAY)).toEqual({ kind: 'none' })
  })

  it('сегодня и прошлый день отмечаются, будущий — нет', () => {
    const draft = { wake: '07:40', bed: '00:30' }
    expect(checkMark(draft, DAY, DAY)).toBeNull()
    expect(checkMark(draft, '2026-10-14', DAY)).toBeNull()
    expect(checkMark(draft, '2026-10-16', DAY)).toBe('future')
    expect(MARK_PROBLEMS.future).toContain('не наступил')
  })

  it('подъём и отбой совпадают — тот же отказ, что у распорядка', () => {
    expect(checkMark({ wake: '08:00', bed: '08:00' }, DAY, DAY)).toBe('same')
    expect(MARK_PROBLEMS.same).toBe(SLEEP_PROBLEMS.same)
    expect(checkMark({ wake: '', bed: '00:30' }, DAY, DAY)).toBe('clock')
  })
})
