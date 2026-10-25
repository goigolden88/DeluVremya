import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../../shared/core/db.ts'
import { config } from '../../app/config.ts'
import type { Note, NoteRepeat } from '../../app/model.ts'
import { goalIdOf, inboxOf, isUnsorted, tasksOfGoal } from './inbox.ts'
import { dayPlan, mainOf, overdue } from './plan.ts'
import {
  draftOfRule,
  dueOccurrences,
  editPattern,
  everyText,
  fallsOn,
  MAX_MONTH_DAY,
  MAX_STEP,
  occurrence,
  occurrenceId,
  patternIdOf,
  patternLine,
  patternOf,
  patternsOf,
  readRule,
  REPEAT_STAMP,
  ruleOf,
  ruleText,
  stopPattern,
  toggleWeekday,
  toPattern,
  weekdayOf,
} from './repeat.ts'

const AT = '2026-10-25T08:00:00.000Z'
/** Воскресенье. */
const TODAY = '2026-10-25'

function note(id: string, over: Partial<Note> = {}): Note {
  return {
    id,
    updatedAt: AT,
    text: `дело ${id}`,
    kind: 'task',
    capturedOn: '2026-10-20',
    plannedFor: null,
    status: 'open',
    ...over,
  }
}

function pattern(rule: NoteRepeat, over: Partial<Note> = {}): Note {
  return note('01P', { text: 'Полить цветы', repeat: rule, ...over })
}

/** Все дни промежутка, на которые выпадает правило. */
function hits(rule: NoteRepeat, from: string, to: string): string[] {
  const out: string[] = []
  for (let day = new Date(`${from}T12:00:00`); ; day.setDate(day.getDate() + 1)) {
    const text = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    if (text > to) break
    if (fallsOn(rule, text)) out.push(text)
  }
  return out
}

describe('правило дат', () => {
  it('день недели — с понедельника', () => {
    expect(weekdayOf('2026-10-26')).toBe(1)
    expect(weekdayOf('2026-10-28')).toBe(3)
    expect(weekdayOf('2026-11-01')).toBe(7)
  })

  it('каждые N дней — от первого дня, раньше него — нет', () => {
    const rule: NoteRepeat = { from: '2026-11-01', every: 'days', step: 3 }
    expect(hits(rule, '2026-10-25', '2026-11-12')).toEqual(['2026-11-01', '2026-11-04', '2026-11-07', '2026-11-10'])
  })

  it('каждые N дней — через смену месяца и года', () => {
    const rule: NoteRepeat = { from: '2026-12-30', every: 'days', step: 2 }
    expect(hits(rule, '2026-12-28', '2027-01-04')).toEqual(['2026-12-30', '2027-01-01', '2027-01-03'])
  })

  it('неделя — по выбранным дням', () => {
    const rule: NoteRepeat = { from: '2026-11-01', every: 'week', weekdays: [1, 3] }
    expect(hits(rule, '2026-10-26', '2026-11-11')).toEqual(['2026-11-02', '2026-11-04', '2026-11-09', '2026-11-11'])
  })

  it('месяц по числу; 31-го в коротком месяце — последний день', () => {
    const rule: NoteRepeat = { from: '2026-01-01', every: 'month', monthDay: 31 }
    expect(hits(rule, '2026-01-01', '2026-06-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
    ])
  })

  it('29-го и 30-го в феврале — последний день; в високосный — 29-е', () => {
    expect(hits({ from: '2027-02-01', every: 'month', monthDay: 30 }, '2027-02-01', '2027-03-31')).toEqual([
      '2027-02-28',
      '2027-03-30',
    ])
    expect(hits({ from: '2028-02-01', every: 'month', monthDay: 29 }, '2028-02-01', '2028-02-29')).toEqual(['2028-02-29'])
    expect(hits({ from: '2027-02-01', every: 'month', monthDay: 29 }, '2027-02-01', '2027-02-28')).toEqual(['2027-02-28'])
  })

  it('«до» — последний день включительно, дальше ничего', () => {
    const rule: NoteRepeat = { from: '2026-11-01', until: '2026-11-03', every: 'days', step: 1 }
    expect(hits(rule, '2026-10-30', '2026-11-10')).toEqual(['2026-11-01', '2026-11-02', '2026-11-03'])
  })

  it('кривой день не выпадает', () => {
    expect(fallsOn({ from: '2026-11-01', every: 'days', step: 1 }, 'вчера')).toBe(false)
  })

  it('кривое правило не читается', () => {
    expect(ruleOf(note('a'))).toBeNull()
    expect(ruleOf(pattern({ from: 'завтра', every: 'days', step: 1 }))).toBeNull()
    expect(ruleOf(pattern({ from: '2026-11-01', every: 'days', step: 0 }))).toBeNull()
    expect(ruleOf(pattern({ from: '2026-11-01', every: 'week', weekdays: [] }))).toBeNull()
    expect(ruleOf(pattern({ from: '2026-11-01', every: 'week', weekdays: [8] }))).toBeNull()
    expect(ruleOf(pattern({ from: '2026-11-01', every: 'month', monthDay: MAX_MONTH_DAY + 1 }))).toBeNull()
    expect(ruleOf(pattern({ from: '2026-11-01', until: '2026-10-01', every: 'days', step: 1 }))).toBeNull()
    expect(ruleOf(pattern({ from: '2026-11-01', every: 'month', monthDay: 5 }))).not.toBeNull()
  })
})

describe('пункты дня', () => {
  const daily = pattern({ from: '2026-10-20', every: 'days', step: 1 }, { estMin: 15, main: true, refs: ['note:G1'] })

  it('встаёт сегодня: текст, оценка, главное, замысел — как у повтора', () => {
    const [made] = dueOccurrences([daily], TODAY)
    expect(made).toEqual({
      id: occurrenceId('01P', TODAY),
      updatedAt: REPEAT_STAMP,
      text: 'Полить цветы',
      kind: 'task',
      capturedOn: TODAY,
      plannedFor: TODAY,
      status: 'open',
      estMin: 15,
      main: true,
      refs: ['note:G1', 'repeat:01P'],
    })
    expect(made && patternIdOf(made)).toBe('01P')
    expect(made && goalIdOf(made)).toBe('G1')
  })

  it('пункт — обычное дело дня; образец — не в плане и не в неразобранном', () => {
    const made = dueOccurrences([daily], TODAY)
    const plan = dayPlan([daily, ...made], TODAY)
    expect(plan.all.map((each) => each.id)).toEqual([occurrenceId('01P', TODAY)])
    expect(isUnsorted(daily)).toBe(false)
    expect(inboxOf([daily])).toEqual([])
    expect(patternsOf([daily, note('a')])).toEqual([daily])
  })

  it('уже стоит — второй раз не встаёт: один пункт на день', () => {
    const made = dueOccurrences([daily], TODAY)
    expect(dueOccurrences([daily, ...made], TODAY)).toEqual([])
  })

  it('удалённый или сделанный пункт не возвращается', () => {
    const made = occurrence(daily, TODAY)
    expect(dueOccurrences([daily, { ...made, deleted: true }], TODAY)).toEqual([])
    expect(dueOccurrences([daily, { ...made, status: 'done', doneOn: TODAY }], TODAY)).toEqual([])
  })

  it('перенесённый пункт свой день держит: на прежний второй не встаёт', () => {
    const moved = { ...occurrence(daily, TODAY), plannedFor: '2026-10-26' }
    expect(dueOccurrences([daily, moved], TODAY)).toEqual([])
  })

  it('не в свой день, до начала, после «до» — ничего', () => {
    expect(dueOccurrences([pattern({ from: '2026-11-01', every: 'days', step: 1 })], TODAY)).toEqual([])
    expect(dueOccurrences([pattern({ from: '2026-10-01', until: '2026-10-24', every: 'days', step: 1 })], TODAY)).toEqual([])
    expect(dueOccurrences([pattern({ from: '2026-10-01', every: 'week', weekdays: [1] })], TODAY)).toEqual([])
  })

  it('остановленный и кривой повтор пунктов не ставят', () => {
    expect(dueOccurrences([{ ...daily, deleted: true }], TODAY)).toEqual([])
    expect(dueOccurrences([pattern({ from: '2026-10-01', every: 'days', step: 0 })], TODAY)).toEqual([])
  })

  it('без хвоста: пропущенные дни задним числом не встают', () => {
    // Приложение не открывали с 20-го — встаёт только сегодняшний пункт.
    const made = dueOccurrences([daily], TODAY)
    expect(made.map((each) => each.plannedFor)).toEqual([TODAY])
    expect(overdue([daily, ...made], TODAY)).toEqual([])
  })

  it('главное повтора уступает выбранному в дне рукой', () => {
    const chosen = note('01Z', { plannedFor: TODAY, main: true })
    const made = dueOccurrences([daily], TODAY)
    expect(mainOf([chosen, ...made])).toBe(chosen)
  })

  it('образец — правило, а не дело замысла: в счёт идут пункты', () => {
    const made = occurrence(daily, TODAY)
    expect(tasksOfGoal('G1', [daily, made]).map((each) => each.id)).toEqual([made.id])
  })

  it('пункт знает свой повтор; остановленный — молчит', () => {
    const made = occurrence(daily, TODAY)
    expect(patternOf(made, [daily, made])).toBe(daily)
    expect(patternOf(made, [{ ...daily, deleted: true }, made])).toBeNull()
    expect(patternOf(note('x'), [daily])).toBeNull()
  })
})

describe('одно на двух устройствах', () => {
  const db = createDb(config)
  const daily = pattern({ from: '2026-10-20', every: 'days', step: 1 })

  beforeEach(async () => {
    await db.close().catch(() => {})
    globalThis.indexedDB = new IDBFactory()
  })

  afterEach(async () => {
    await db.close().catch(() => {})
  })

  it('пункт, заведённый вторым устройством, после синхронизации — тот же один', async () => {
    await db.merge('notes', dueOccurrences([daily], TODAY), 'imported')
    // Тот же пункт с другого устройства.
    expect(await db.merge('notes', [occurrence(daily, TODAY)], 'remote')).toBe(0)
    expect((await db.getAll('notes')).map((each) => each.id)).toEqual([occurrenceId('01P', TODAY)])
  })

  it('сделанный на другом устройстве побеждает порождённый здесь', async () => {
    await db.merge('notes', dueOccurrences([daily], TODAY), 'imported')
    const done: Note = { ...occurrence(daily, TODAY), status: 'done', doneOn: TODAY, updatedAt: AT }
    expect(await db.merge('notes', [done], 'remote')).toBe(1)
    expect(await db.get('notes', occurrenceId('01P', TODAY))).toMatchObject({ status: 'done' })
  })

  it('удалённый не воскресает: ни здесь, ни при встрече', async () => {
    await db.merge('notes', dueOccurrences([daily], TODAY), 'imported')
    await db.remove('notes', occurrenceId('01P', TODAY))
    // План открыт снова: живых записей пункта нет, но надгробие слияние не пропустит.
    expect(await db.merge('notes', dueOccurrences([daily, ...(await db.getAll('notes'))], TODAY), 'imported')).toBe(0)
    // Второе устройство, ещё не знавшее об удалении, прислало свой порождённый.
    expect(await db.merge('notes', [occurrence(daily, TODAY)], 'remote')).toBe(0)
    expect(await db.getAll('notes')).toEqual([])
  })
})

describe('правка и остановка повтора', () => {
  const weekly = pattern({ from: '2026-10-01', every: 'week', weekdays: [7, 1] }, { estMin: 30 })
  const past = { ...occurrence(weekly, '2026-10-19'), updatedAt: AT }
  const today = { ...occurrence(weekly, TODAY), updatedAt: AT }
  const doneToday = { ...today, id: 'other-done' }
  const tomorrow = { ...occurrence(weekly, '2026-10-26'), updatedAt: AT }
  const all = [weekly, past, today, tomorrow]

  it('текст и оценка — пунктам с сегодняшнего дня, ещё не отмеченным', () => {
    const after = { ...weekly, text: 'Полить все цветы', estMin: 45 }
    const done = { ...tomorrow, status: 'done' as const, doneOn: TODAY }
    const written = editPattern(weekly, after, [weekly, past, today, done], TODAY)
    expect(written.map((each) => each.id)).toEqual(['01P', today.id])
    expect(written[1]).toMatchObject({ text: 'Полить все цветы', estMin: 45 })
  })

  it('своё у пункта остаётся: правится только поменявшееся', () => {
    const own = { ...today, estMin: 10 }
    const written = editPattern(weekly, { ...weekly, text: 'Иначе' }, [weekly, own], TODAY)
    expect(written[1]).toMatchObject({ text: 'Иначе', estMin: 10 })
  })

  it('новое правило убирает пункты, которые больше не выпадают; перенесённый рукой — остаётся', () => {
    const moved = { ...occurrence(weekly, '2026-10-19'), plannedFor: '2026-10-27', updatedAt: AT }
    const after = { ...weekly, repeat: { from: '2026-10-01', every: 'week' as const, weekdays: [7] } }
    const written = editPattern(weekly, after, [...all, moved], TODAY)
    expect(written.find((each) => each.id === tomorrow.id)).toMatchObject({ deleted: true })
    expect(written.find((each) => each.id === today.id)).toBeUndefined()
    expect(written.find((each) => each.id === moved.id)).toBeUndefined()
    expect(written.find((each) => each.id === past.id)).toBeUndefined()
  })

  it('«главное» снимается и ставится пунктам', () => {
    const on = editPattern(weekly, { ...weekly, main: true }, all, TODAY)
    expect(on.filter((each) => each.main).map((each) => each.id)).toEqual(['01P', today.id, tomorrow.id])
    const off = editPattern({ ...weekly, main: true }, weekly, on, TODAY)
    expect(off.map((each) => each.id)).toEqual(['01P', today.id, tomorrow.id])
    expect(off.some((each) => each.main)).toBe(false)
  })

  it('остановка: образец и не отмеченные с сегодня — надгробием; прошлое и сделанное — как было', () => {
    const written = stopPattern(weekly, [...all, { ...doneToday, status: 'done' }], TODAY)
    expect(written.map((each) => each.id)).toEqual(['01P', today.id, tomorrow.id])
    expect(written.every((each) => each.deleted)).toBe(true)
  })

  it('дело становится образцом: из плана уходит, главное остаётся', () => {
    const planned = note('a', { plannedFor: TODAY, plannedTo: '2026-10-28', order: 2, main: true })
    const rule: NoteRepeat = { from: TODAY, every: 'days', step: 1 }
    const made = toPattern(planned, rule)
    expect(made).toEqual({ ...note('a', { main: true }), repeat: rule })
  })
})

describe('форма правила', () => {
  it('новое — с дня: по тому же дню недели', () => {
    expect(draftOfRule(null, TODAY)).toEqual({
      from: TODAY,
      until: '',
      every: 'week',
      step: '1',
      weekdays: [7],
      monthDay: '25',
    })
  })

  it('читается каждый вид; «до» — по желанию', () => {
    const draft = draftOfRule(null, '2026-11-01')
    expect(readRule({ ...draft, every: 'days', step: '3' })).toEqual({ rule: { from: '2026-11-01', every: 'days', step: 3 } })
    expect(readRule({ ...draft, weekdays: [3, 1, 3] })).toEqual({ rule: { from: '2026-11-01', every: 'week', weekdays: [1, 3] } })
    expect(readRule({ ...draft, every: 'month', monthDay: '31', until: '2027-01-31' })).toEqual({
      rule: { from: '2026-11-01', until: '2027-01-31', every: 'month', monthDay: 31 },
    })
  })

  it('кривое — причина', () => {
    const draft = draftOfRule(null, '2026-11-01')
    expect(readRule({ ...draft, from: '' })).toHaveProperty('error')
    expect(readRule({ ...draft, until: '2026-10-01' })).toHaveProperty('error')
    expect(readRule({ ...draft, weekdays: [] })).toHaveProperty('error')
    expect(readRule({ ...draft, every: 'days', step: '0' })).toHaveProperty('error')
    expect(readRule({ ...draft, every: 'days', step: String(MAX_STEP + 1) })).toHaveProperty('error')
    expect(readRule({ ...draft, every: 'month', monthDay: '32' })).toHaveProperty('error')
  })

  it('дни недели выбираются и снимаются', () => {
    expect(toggleWeekday([3], 1)).toEqual([1, 3])
    expect(toggleWeekday([1, 3], 3)).toEqual([1])
  })
})

describe('словами', () => {
  it('правило — одной строкой', () => {
    expect(ruleText({ from: '2026-11-01', every: 'week', weekdays: [1] })).toBe('каждый пн, с 01.11')
    expect(ruleText({ from: '2026-11-01', until: '2026-12-31', every: 'week', weekdays: [3] })).toBe(
      'каждую ср, с 01.11, до 31.12',
    )
    expect(everyText({ from: '2026-11-01', every: 'week', weekdays: [1, 3, 5] })).toBe('по пн, ср, пт')
    expect(everyText({ from: '2026-11-01', every: 'week', weekdays: [1, 2, 3, 4, 5, 6, 7] })).toBe('каждый день')
    expect(everyText({ from: '2026-11-01', every: 'days', step: 1 })).toBe('каждый день')
    expect(everyText({ from: '2026-11-01', every: 'days', step: 3 })).toBe('каждые 3 дня')
    expect(everyText({ from: '2026-11-01', every: 'days', step: 21 })).toBe('каждый 21 день')
    expect(everyText({ from: '2026-11-01', every: 'month', monthDay: 5 })).toBe('каждый месяц 5-го')
  })

  it('кривое правило — так и сказано', () => {
    expect(patternLine(pattern({ from: 'x', every: 'days', step: 1 }))).toBe('правило не читается')
  })
})
