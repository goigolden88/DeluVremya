import { describe, expect, it } from 'vitest'
import type { Category, TimeBlock } from '../../core/model.ts'
import {
  checkNorm,
  compareRows,
  normInput,
  normSince,
  periodNorms,
  periodSummary,
  readNorm,
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
