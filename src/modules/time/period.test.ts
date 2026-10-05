import { describe, expect, it } from 'vitest'
import type { Category, SpecialDays, TimeBlock } from '../../app/model.ts'
import { daySummary } from './day.ts'
import {
  checkNorm,
  compareRows,
  monthDays,
  normInput,
  normSince,
  periodNorms,
  periodSummary,
  readNorm,
  specialTime,
  specialWeek,
  weekNorms,
  weekProgress,
  withNorm,
  yearTime,
} from './period.ts'

const AT = '2026-09-13T10:00:00.000Z'
const WEEK = { from: '2026-09-07', to: '2026-09-13' }
/** 13.09.2026 — воскресенье, неделя с 07.09 закончилась сегодня. */
const SUNDAY = '2026-09-13'

function cat(id: string, name: string, order: number, extra: Partial<Category> = {}): Category {
  return { id, updatedAt: AT, name, order, kind: 'neutral', ...extra }
}

function block(id: string, categoryId: string, date: string, minutes: number, extra: Partial<TimeBlock> = {}): TimeBlock {
  return { id, updatedAt: AT, date, categoryId, minutes, ...extra }
}

describe('итог промежутка — Р-43', () => {
  const categories = [
    cat('b', 'Ютуб', 1, { kind: 'idle' }),
    cat('a', 'Чтение', 0, { kind: 'useful' }),
    cat('p', 'Покер', 2, { kind: 'idle' }),
    cat('x', 'Старое', 3, { deleted: true }),
  ]
  const blocks = [
    block('1', 'a', '2026-09-07', 30),
    block('2', 'a', '2026-09-07', 30),
    block('3', 'a', '2026-09-09', 45),
    block('4', 'b', '2026-09-10', 60, { bgCategoryId: 'p' }),
    block('5', 'x', '2026-09-11', 15),
    // Прошлая неделя и удалённый — не в счёт.
    block('6', 'a', '2026-09-06', 100),
    block('7', 'a', '2026-09-08', 50, { deleted: true }),
  ]

  it('сумма — по основной; фоновое у категории отдельно и в сумму не входит', () => {
    const summary = periodSummary(blocks, categories, WEEK, SUNDAY)
    expect(summary.total).toBe(180)
    expect(summary.count).toBe(5)
    expect(summary.byCategory.map((row) => [row.name, row.minutes, row.count, row.days, row.background])).toEqual([
      ['Чтение', 105, 3, 2, 0],
      ['Ютуб', 60, 1, 1, 0],
      ['Покер', 0, 0, 0, 60],
      // Удалённая категория называется своим последним именем.
      ['Старое', 15, 1, 1, 0],
    ])
  })

  it('дни с учётом и наступившие дни промежутка — основание числа', () => {
    expect(periodSummary(blocks, categories, WEEK, SUNDAY)).toMatchObject({ days: 4, elapsedDays: 7 })
    expect(periodSummary(blocks, categories, WEEK, '2026-09-09').elapsedDays).toBe(3)
    expect(periodSummary(blocks, categories, WEEK, '2026-09-01').elapsedDays).toBe(0)
  })

  it('по признаку — по основной, в порядке признаков', () => {
    expect(periodSummary(blocks, categories, WEEK, SUNDAY).byKind).toEqual([
      { kind: 'useful', minutes: 105 },
      { kind: 'neutral', minutes: 15 },
      { kind: 'idle', minutes: 60 },
    ])
  })

  it('два промежутка рядом — Р-55: учтённая только в прежнем стоит с нулём, только фоном — нет', () => {
    const current = periodSummary([block('1', 'b', '2026-09-08', 60)], categories, WEEK, SUNDAY)
    const before = periodSummary(
      [block('2', 'a', '2026-09-01', 30), block('3', 'b', '2026-09-02', 20, { bgCategoryId: 'p' })],
      categories,
      { from: '2026-08-31', to: '2026-09-06' },
      SUNDAY,
    )
    expect(compareRows(current, before, categories).map((row) => [row.name, row.minutes, row.before])).toEqual([
      ['Чтение', 0, 30],
      ['Ютуб', 60, 20],
    ])
  })

  it('неизвестная категория — без имени и признака, в конце', () => {
    const summary = periodSummary(
      [block('1', 'нет', '2026-09-08', 10), block('2', 'a', '2026-09-08', 20)],
      categories,
      WEEK,
      SUNDAY,
    )
    expect(summary.byCategory.map((row) => row.name)).toEqual(['Чтение', null])
    expect(summary.byKind).toEqual([
      { kind: 'useful', minutes: 20 },
      { kind: null, minutes: 10 },
    ])
  })
})

describe('год по месяцам — Р-57', () => {
  it('двенадцать месяцев; итог года без соседнего года; категории — по месяцам, фоновое отдельно', () => {
    const categories = [cat('a', 'Чтение', 0), cat('b', 'Ютуб', 1)]
    const blocks = [
      block('1', 'a', '2026-02-03', 60),
      block('2', 'a', '2026-02-10', 30),
      block('3', 'b', '2026-09-01', 45, { bgCategoryId: 'a' }),
      block('4', 'a', '2025-12-31', 100),
    ]
    const data = yearTime(blocks, categories, 2026, '2026-09-14')
    expect(data.months.map((month) => month.summary.total)).toEqual([0, 90, 0, 0, 0, 0, 0, 0, 45, 0, 0, 0])
    expect(data.months[0]?.month).toBe('2026-01')
    expect(data.total.total).toBe(135)
    expect(data.categories.map((row) => [row.name, row.minutes, row.background, row.byMonth[1], row.byMonth[8]])).toEqual([
      ['Чтение', 90, 45, 90, 0],
      ['Ютуб', 45, 0, 0, 45],
    ])
  })
})

describe('месяц по дням — Р-92', () => {
  const categories = [cat('a', 'Чтение', 0), cat('b', 'Ютуб', 1)]
  /** Итог дня — тот, что на экране учёта; час дня на сумму не влияет. */
  const dayTotal = (list: readonly TimeBlock[], date: string) =>
    daySummary(list, categories, date, new Date(2026, 9, 5, 12)).total

  it('значения по дням — как итог дня: фоновое, удалённое и соседний месяц не входят', () => {
    const blocks = [
      block('1', 'a', '2026-09-01', 30),
      block('2', 'b', '2026-09-01', 45, { bgCategoryId: 'a' }),
      block('3', 'a', '2026-09-15', 60),
      block('4', 'a', '2026-09-15', 20, { deleted: true }),
      block('5', 'a', '2026-09-30', 10),
      block('6', 'a', '2026-08-31', 100),
      block('7', 'a', '2026-10-01', 100),
    ]
    const days = monthDays(blocks, '2026-09', '2026-10-05')
    expect(days.map((day) => day.value)).toEqual(days.map((day) => dayTotal(blocks, day.date)))
    expect(days[0]).toMatchObject({ date: '2026-09-01', value: 75, count: 2, muted: false, future: false, special: null })
    expect(days[14]).toMatchObject({ date: '2026-09-15', value: 60, count: 1, muted: false })
    // День без учёта — ноль, подпись серым: столбца нет, но день был.
    expect(days[1]).toMatchObject({ date: '2026-09-02', value: 0, count: 0, muted: true })
  })

  it('месяц из двадцати восьми, тридцати и тридцати одного дня — столбец на каждый день', () => {
    const days = (month: string) => monthDays([], month, '2026-12-31').map((day) => day.date)
    expect(days('2026-02')).toHaveLength(28)
    expect(days('2026-02').at(-1)).toBe('2026-02-28')
    expect(days('2026-09')).toHaveLength(30)
    expect(days('2026-09').at(-1)).toBe('2026-09-30')
    expect(days('2026-08')).toHaveLength(31)
    expect(days('2026-08')[0]).toBe('2026-08-01')
    expect(days('2026-08').at(-1)).toBe('2026-08-31')
  })

  it('будущие дни — без значения и серым; сегодня — со значением', () => {
    const blocks = [block('1', 'a', '2026-10-05', 40)]
    const days = monthDays(blocks, '2026-10', '2026-10-05')
    expect(days[4]).toMatchObject({ date: '2026-10-05', value: 40, future: false, muted: false })
    expect(days[5]).toMatchObject({ date: '2026-10-06', value: null, future: true, muted: true })
    expect(days.filter((day) => day.future)).toHaveLength(26)
    expect(days.filter((day) => day.future).every((day) => day.value === null && day.muted)).toBe(true)
  })

  it('особые дни — без значения и серым, период назван; удалённый период — обычные дни — Р-91', () => {
    const trip: SpecialDays = { id: 't', updatedAt: AT, from: '2026-08-30', to: '2026-09-02', title: 'Поездка' }
    const gone: SpecialDays = { id: 'g', updatedAt: AT, from: '2026-09-10', to: '2026-09-10', deleted: true }
    const blocks = [block('1', 'a', '2026-09-02', 90), block('2', 'a', '2026-09-03', 15), block('3', 'a', '2026-09-10', 5)]
    const days = monthDays(blocks, '2026-09', '2026-10-05', [trip, gone])
    // Период начат в августе: в сентябре — его 1-е и 2-е.
    expect(days.slice(0, 3).map((day) => [day.value, day.muted, day.special?.id ?? null])).toEqual([
      [null, true, 't'],
      [null, true, 't'],
      [15, false, null],
    ])
    expect(days[1]?.count).toBe(1)
    expect(days[9]).toMatchObject({ value: 5, special: null })
    // Сумма столбцов — итог месяца по обычным дням.
    const total = days.reduce((sum, day) => sum + (day.value ?? 0), 0)
    expect(total).toBe(periodSummary(blocks, [], { from: '2026-09-01', to: '2026-09-30' }, '2026-10-05', [trip]).total)
  })
})

describe('нормы недели — Р-45', () => {
  it('«не меньше» — от порога, «не больше» — до порога включительно', () => {
    expect(checkNorm({ minDays: 3, minMinutes: 300, maxMinutes: 600 }, { days: 3, minutes: 600 })).toEqual([
      { rule: 'minDays', target: 3, actual: 3, met: true },
      { rule: 'minMinutes', target: 300, actual: 600, met: true },
      { rule: 'maxMinutes', target: 600, actual: 600, met: true },
    ])
    expect(checkNorm({ minDays: 3, maxMinutes: 600 }, { days: 2, minutes: 601 }).map((check) => check.met)).toEqual([
      false,
      false,
    ])
  })

  const reading = cat('a', 'Чтение', 0, { norm: { minDays: 2, since: '2026-08-01' } })
  const youtube = cat('b', 'Ютуб', 1, { norm: { maxMinutes: 60 } })
  const plain = cat('c', 'Прочее', 2)
  const chess = cat('d', 'Шахматы', 3, { archived: true, norm: { minDays: 1 } })

  it('только рабочие категории с нормой, по порядку; «раз» — день, а не блок', () => {
    const blocks = [
      block('1', 'a', '2026-09-07', 30),
      block('2', 'a', '2026-09-07', 30),
      block('3', 'b', '2026-09-08', 90, { bgCategoryId: 'a' }),
      block('4', 'd', '2026-09-08', 30),
    ]
    const list = weekNorms(blocks, [youtube, reading, plain, chess], '2026-09-10', SUNDAY)
    expect(list.map((each) => each.category.name)).toEqual(['Чтение', 'Ютуб'])
    expect(list[0]?.checks).toEqual([{ rule: 'minDays', target: 2, actual: 1, met: false }])
    // Фоновое названо, но в норму не вошло (Р-43).
    expect(list[0]?.background).toBe(90)
    expect(list[1]?.checks).toEqual([{ rule: 'maxMinutes', target: 60, actual: 90, met: false }])
  })

  it('вместо серии — последние недели; недели до первого блока не в счёт', () => {
    const blocks = [
      block('1', 'a', '2026-08-24', 30),
      block('2', 'a', '2026-08-31', 30),
      block('3', 'a', '2026-09-02', 30),
      block('4', 'a', '2026-09-07', 30),
      block('5', 'a', '2026-09-12', 30),
    ]
    // 17.08 — до первого блока; 24.08 — один день из двух; 31.08 и 07.09 — два.
    expect(weekNorms(blocks, [reading], '2026-09-07', SUNDAY)[0]?.history).toMatchObject({
      kept: 2,
      weeks: 3,
      enough: true,
    })
  })

  it('неделя, которая ещё идёт, в счёт недель не входит; меньше трёх — истории нет', () => {
    const blocks = [block('1', 'a', '2026-09-07', 30), block('2', 'a', '2026-09-08', 30), block('3', 'a', '2026-09-14', 30)]
    expect(weekNorms(blocks, [reading], '2026-09-14', '2026-09-15')[0]?.history).toMatchObject({
      kept: 1,
      weeks: 1,
      enough: false,
    })
  })

  it('без норм — пусто, считать нечего', () => {
    expect(weekNorms([block('1', 'c', '2026-09-07', 30)], [plain], '2026-09-07', SUNDAY)).toEqual([])
  })

  it('на неделе — только «не меньше» и только у категорий, где они есть', () => {
    const both = cat('a', 'Чтение', 0, { norm: { minDays: 3, maxMinutes: 600 } })
    const list = weekProgress([block('1', 'a', '2026-09-14', 30), block('2', 'b', '2026-09-14', 90)], [both, youtube], '2026-09-15')
    expect(list.map((each) => each.category.name)).toEqual(['Чтение'])
    expect(list[0]?.checks).toEqual([{ rule: 'minDays', target: 3, actual: 1, met: false }])
  })
})

describe('особые дни в итогах и нормах — Р-91', () => {
  const categories = [cat('a', 'Чтение', 0, { kind: 'useful' }), cat('b', 'Ходьба', 1, { kind: 'neutral' }), cat('p', 'Покер', 2)]
  const trip: SpecialDays = { id: 's1', updatedAt: AT, from: '2026-09-11', to: '2026-09-13', title: 'Поездка' }
  const gone: SpecialDays = { id: 's2', updatedAt: AT, from: '2026-09-07', to: '2026-09-07', deleted: true }
  const blocks = [
    block('1', 'a', '2026-09-07', 30),
    block('2', 'a', '2026-09-09', 45),
    block('3', 'b', '2026-09-12', 120),
    block('4', 'a', '2026-09-13', 60, { bgCategoryId: 'p' }),
  ]

  it('итог — только по обычным дням: сумма, категории, фон, признак; особые названы числом', () => {
    const summary = periodSummary(blocks, categories, WEEK, SUNDAY, [trip, gone])
    expect(summary).toMatchObject({ total: 75, count: 2, days: 2, elapsedDays: 4, specialDays: 3 })
    expect(summary.byCategory.map((row) => [row.name, row.minutes, row.background])).toEqual([['Чтение', 75, 0]])
    expect(summary.byKind).toEqual([{ kind: 'useful', minutes: 75 }])
  })

  it('без особых дней — как было; будущие особые дни ещё не названы', () => {
    expect(periodSummary(blocks, categories, WEEK, SUNDAY)).toMatchObject({ total: 255, elapsedDays: 7, specialDays: 0 })
    expect(periodSummary(blocks, categories, WEEK, '2026-09-11', [trip])).toMatchObject({ elapsedDays: 4, specialDays: 1 })
    expect(periodSummary(blocks, categories, WEEK, '2026-09-09', [trip])).toMatchObject({ elapsedDays: 3, specialDays: 0 })
  })

  it('блок «Особые дни» — каждый период со своими днями внутри промежутка', () => {
    const early: SpecialDays = { id: 's0', updatedAt: AT, from: '2026-09-05', to: '2026-09-07' }
    const rows = specialTime(blocks, categories, [trip, early, gone], WEEK, SUNDAY)
    expect(rows.map((row) => [row.special.id, row.period])).toEqual([
      ['s0', { from: '2026-09-07', to: '2026-09-07' }],
      ['s1', { from: '2026-09-11', to: '2026-09-13' }],
    ])
    expect(rows[0]?.summary).toMatchObject({ total: 30, elapsedDays: 1 })
    expect(rows[1]?.summary).toMatchObject({ total: 180, count: 2, days: 2, elapsedDays: 3 })
    expect(rows[1]?.summary.byCategory.map((row) => [row.name, row.minutes, row.background])).toEqual([
      ['Чтение', 60, 0],
      ['Ходьба', 120, 0],
      ['Покер', 0, 60],
    ])
    expect(specialTime(blocks, categories, [trip], { from: '2026-09-14', to: '2026-09-20' }, SUNDAY)).toEqual([])
  })

  it('месяц против прошлого — обычные дни с обеих сторон', () => {
    const august: SpecialDays = { id: 's3', updatedAt: AT, from: '2026-08-10', to: '2026-08-10' }
    const list = [...blocks, block('5', 'a', '2026-08-10', 500), block('6', 'a', '2026-08-11', 20)]
    const current = periodSummary(list, categories, { from: '2026-09-01', to: '2026-09-30' }, SUNDAY, [trip, august])
    const before = periodSummary(list, categories, { from: '2026-08-01', to: '2026-08-31' }, SUNDAY, [trip, august])
    expect(compareRows(current, before, categories).map((row) => [row.name, row.minutes, row.before])).toEqual([
      ['Чтение', 75, 20],
    ])
  })

  it('год — столбцы и категории по обычным дням', () => {
    const data = yearTime(blocks, categories, 2026, SUNDAY, [trip])
    expect(data.months[8]?.summary).toMatchObject({ total: 75, specialDays: 3 })
    expect(data.total).toMatchObject({ total: 75, specialDays: 3 })
    expect(data.categories.map((row) => row.name)).toEqual(['Чтение'])
  })

  // Два дня чтения в каждой неделе с 17.08 по 13.09.
  const reading = cat('a', 'Чтение', 0, { norm: { minDays: 2, since: '2026-08-01' } })
  const weekly = ['2026-08-17', '2026-08-18', '2026-08-24', '2026-08-25', '2026-08-31', '2026-09-01', '2026-09-07', '2026-09-08'].map(
    (date, index) => block(String(index), 'a', date, 30),
  )
  const hike: SpecialDays = { id: 'h', updatedAt: AT, from: '2026-08-30', to: '2026-08-31' }

  it('неделя, задевшая особый день, не судится и в «N из M» не входит', () => {
    expect(specialWeek([hike], '2026-08-27')).toBe(true)
    expect(specialWeek([hike], '2026-09-02')).toBe(true)
    expect(specialWeek([hike, gone], '2026-09-10')).toBe(false)
    const history = weekNorms(weekly, [reading], SUNDAY, SUNDAY, [hike])[0]?.history
    // 24.08 задета воскресеньем 30.08, 31.08 — понедельником.
    expect(history?.marks.map((mark) => [mark.counted, mark.special])).toEqual([
      [true, false],
      [false, true],
      [false, true],
      [true, false],
    ])
    expect(history).toMatchObject({ kept: 2, weeks: 2, enough: false })
  })

  it('порог истории — только недели в счёт (Р-53)', () => {
    expect(weekNorms(weekly, [reading], SUNDAY, SUNDAY)[0]?.history).toMatchObject({ weeks: 4, enough: true })
    expect(weekNorms(weekly, [reading], SUNDAY, SUNDAY, [hike])[0]?.history.enough).toBe(false)
  })

  it('нормы месяца — особая неделя отмечена и не в счёт', () => {
    const [row] = periodNorms(weekly, [reading], { from: '2026-09-01', to: '2026-09-30' }, '2026-09-15', [hike])
    expect(row?.history.marks.map((mark) => [mark.week.to, mark.counted, mark.special])).toEqual([
      ['2026-09-06', false, true],
      ['2026-09-13', true, false],
      ['2026-09-20', false, false],
      ['2026-09-27', false, false],
    ])
    expect(row?.history).toMatchObject({ kept: 1, weeks: 1 })
  })
})

describe('норма из полей', () => {
  it('все поля пустые — нормы нет, это не ошибка', () => {
    expect(readNorm({ minDays: '', minHours: ' ', maxHours: '' })).toEqual({ norm: null })
  })

  it('часы — с запятой или точкой, в минуты', () => {
    expect(readNorm({ minDays: '3', minHours: '1,5', maxHours: '10' })).toEqual({
      norm: { minDays: 3, minMinutes: 90, maxMinutes: 600 },
    })
    expect(readNorm({ minDays: '', minHours: '', maxHours: '0.25' })).toEqual({ norm: { maxMinutes: 15 } })
  })

  it('кривое — причина, а не молчание', () => {
    expect(readNorm({ minDays: '8', minHours: '', maxHours: '' })).toEqual({ problem: 'days' })
    expect(readNorm({ minDays: '0', minHours: '', maxHours: '' })).toEqual({ problem: 'days' })
    expect(readNorm({ minDays: '2.5', minHours: '', maxHours: '' })).toEqual({ problem: 'days' })
    expect(readNorm({ minDays: '', minHours: '0', maxHours: '' })).toEqual({ problem: 'hours' })
    expect(readNorm({ minDays: '', minHours: 'пять', maxHours: '' })).toEqual({ problem: 'hours' })
    expect(readNorm({ minDays: '', minHours: '', maxHours: '200' })).toEqual({ problem: 'hours' })
    expect(readNorm({ minDays: '', minHours: '5', maxHours: '4' })).toEqual({ problem: 'order' })
  })

  it('в поля — часами с запятой; без нормы — пусто', () => {
    expect(normInput({ minDays: 3, minMinutes: 90, maxMinutes: 600 })).toEqual({
      minDays: '3',
      minHours: '1,5',
      maxHours: '10',
    })
    expect(normInput(undefined)).toEqual({ minDays: '', minHours: '', maxHours: '' })
  })

  it('убранная норма уходит из записи ключом', () => {
    const category = cat('a', 'Чтение', 0, { norm: { minDays: 3, since: '2026-09-01' } })
    expect('norm' in withNorm(category, null, SUNDAY)).toBe(false)
  })

  it('день начала — Р-56: новая — сегодня; правка — прежний; без него — день правки категории', () => {
    const fresh = cat('a', 'Чтение', 0)
    expect(withNorm(fresh, { minDays: 3 }, SUNDAY).norm).toEqual({ minDays: 3, since: SUNDAY })

    const kept = cat('a', 'Чтение', 0, { norm: { minDays: 3, since: '2026-09-01' } })
    expect(withNorm(kept, { maxMinutes: 60 }, SUNDAY).norm).toEqual({ maxMinutes: 60, since: '2026-09-01' })

    const old = cat('a', 'Чтение', 0, { updatedAt: '2026-09-02T12:00:00.000Z', norm: { minDays: 3 } })
    expect(withNorm(old, { minDays: 4 }, SUNDAY).norm).toEqual({ minDays: 4, since: '2026-09-02' })
  })
})

describe('история нормы — Р-53, Р-56', () => {
  // Два дня чтения в каждой неделе с 17.08 по 13.09.
  const blocks = ['2026-08-17', '2026-08-18', '2026-08-24', '2026-08-25', '2026-08-31', '2026-09-01', '2026-09-07', '2026-09-08'].map(
    (date, index) => block(String(index), 'a', date, 30),
  )

  it('с понедельника не раньше since: норма со среды свою неделю не судит', () => {
    const wednesday = cat('a', 'Чтение', 0, { norm: { minDays: 2, since: '2026-08-19' } })
    const history = weekNorms(blocks, [wednesday], SUNDAY, SUNDAY)[0]?.history
    // 17.08 — неделя заведения, не в счёт; 24.08, 31.08, 07.09 — в счёт.
    expect(history?.marks.map((mark) => mark.counted)).toEqual([false, true, true, true])
    expect(history).toMatchObject({ since: '2026-08-19', kept: 3, weeks: 3, enough: true })
  })

  it('норма с понедельника — её неделя в счёт; двух недель мало для истории', () => {
    const monday = cat('a', 'Чтение', 0, { norm: { minDays: 2, since: '2026-08-31' } })
    expect(weekNorms(blocks, [monday], SUNDAY, SUNDAY)[0]?.history).toMatchObject({ weeks: 2, enough: false })
  })

  it('без since — день последней правки категории; не разобрать — без предела', () => {
    const edited = cat('a', 'Чтение', 0, { updatedAt: '2026-09-07T12:00:00.000Z', norm: { minDays: 2 } })
    expect(normSince(edited)).toBe('2026-09-07')
    expect(weekNorms(blocks, [edited], SUNDAY, SUNDAY)[0]?.history).toMatchObject({ weeks: 1, enough: false })

    const broken = cat('a', 'Чтение', 0, { updatedAt: 'вчера', norm: { minDays: 2, since: '2026-02-30' } })
    expect(normSince(broken)).toBeNull()
    expect(weekNorms(blocks, [broken], SUNDAY, SUNDAY)[0]?.history.weeks).toBe(4)
  })

  it('по неделям месяца — те, чьё воскресенье в нём; идущая и будущие не в счёт', () => {
    const reading = cat('a', 'Чтение', 0, { norm: { minDays: 2, since: '2026-08-01' } })
    const september = { from: '2026-09-01', to: '2026-09-30' }
    const [row] = periodNorms(blocks, [reading], september, '2026-09-15')
    expect(row?.history.marks.map((mark) => [mark.week.to, mark.counted, mark.met])).toEqual([
      ['2026-09-06', true, true],
      ['2026-09-13', true, true],
      ['2026-09-20', false, false],
      ['2026-09-27', false, false],
    ])
    expect(row?.history).toMatchObject({ kept: 2, weeks: 2, enough: false })
  })
})
