import { describe, expect, it } from 'vitest'
import type { Category, TimeBlock } from '../../app/model.ts'
import { MINUTES_PER_DAY } from './categories.ts'
import { importTime } from './import.ts'

const NOW = '2026-09-13T10:00:00.000Z'

function cat(id: string, name: string, order: number, extra: Partial<Category> = {}): Category {
  return { id, updatedAt: NOW, name, order, kind: 'neutral', ...extra }
}

function block(categoryId: string, date: string, minutes: number, extra: Partial<TimeBlock> = {}): TimeBlock {
  return { id: `${categoryId}-${date}-${minutes}`, updatedAt: NOW, date, categoryId, minutes, ...extra }
}

const base = [cat('cat:чтение', 'Чтение', 0), cat('cat:ютуб', 'Ютуб', 1), cat('cat:шахматы', 'Шахматы', 2, { archived: true })]

function run(raw: unknown, categories: Category[] = base, time: TimeBlock[] = []) {
  let counter = 0
  return importTime(raw, { categories, time }, { newId: () => `n${++counter}`, now: NOW })
}

describe('раздел «time» импорта', () => {
  it('категория — по названию без учёта регистра, архивная тоже', () => {
    const plan = run([
      { date: '2026-02-03', category: 'чтение', minutes: 45 },
      { date: '2026-02-03', category: ' ШАХМАТЫ ', minutes: 30 },
    ])
    expect(plan.issues).toEqual([])
    expect(plan.writes.categories).toEqual([])
    expect(plan.writes.time?.map((each) => each.categoryId)).toEqual(['cat:чтение', 'cat:шахматы'])
  })

  it('недостающая категория заводится один раз на все свои записи', () => {
    const plan = run([
      { date: '2026-02-03', category: 'Бег', minutes: 30 },
      { date: '2026-02-04', category: 'бег', minutes: 40 },
    ])
    expect(plan.writes.categories?.map((each) => [each.id, each.name, each.updatedAt])).toEqual([['cat:бег', 'Бег', NOW]])
    expect(plan.writes.time?.map((each) => each.categoryId)).toEqual(['cat:бег', 'cat:бег'])
    expect(plan.added.map((each) => each.count)).toEqual([2, 1])
  })

  it('на месте надгробия категория оживает с тем же id', () => {
    const plan = run([{ date: '2026-02-03', category: 'Покер', minutes: 30 }], [...base, cat('cat:покер', 'Покер', 3, { deleted: true })])
    expect(plan.writes.categories?.map((each) => [each.id, each.deleted])).toEqual([['cat:покер', undefined]])
  })

  it('фоновое — вторая категория, в том числе новая; то же занятие фоном — в отчёт', () => {
    const plan = run([
      { date: '2026-02-03', category: 'Ютуб', minutes: 90, background: 'Покер' },
      { date: '2026-02-04', category: 'Ютуб', minutes: 60, background: 'ютуб' },
    ])
    expect(plan.writes.time).toHaveLength(1)
    expect(plan.writes.time?.[0]?.bgCategoryId).toBe('cat:покер')
    expect(plan.issues.map((each) => each.title)).toEqual(['Ютуб, 2026-02-04'])
  })

  it('минуты: строкой и дробные округляются; ноль, больше суток и не число — в отчёт', () => {
    const plan = run([
      { date: '2026-02-01', category: 'Чтение', minutes: '45' },
      { date: '2026-02-02', category: 'Чтение', minutes: 37.5 },
      { date: '2026-02-03', category: 'Чтение', minutes: 0 },
      { date: '2026-02-04', category: 'Чтение', minutes: MINUTES_PER_DAY + 1 },
      { date: '2026-02-05', category: 'Чтение', minutes: 'полчаса' },
      { date: '2026-02-06', category: 'Чтение' },
    ])
    expect(plan.writes.time?.map((each) => each.minutes)).toEqual([45, 38])
    expect(plan.issues).toHaveLength(4)
    expect(plan.issues[3]?.reason).toBe('нет минут ("minutes")')
  })

  it('день: нет, кривой, будущий — в отчёт; кривая запись не заводит категорий', () => {
    const plan = run([
      { category: 'Новое', minutes: 30 },
      { date: '03.02.2026', category: 'Новое', minutes: 30 },
      { date: '2026-09-14', category: 'Новое', minutes: 30 },
      { date: '2026-02-03', minutes: 30 },
    ])
    expect(plan.issues.map((each) => each.reason)).toEqual([
      'нет дня ("date")',
      'день «03.02.2026» — не ГГГГ-ММ-ДД',
      'день 2026-09-14 ещё не наступил — учёт про то, что было',
      'нет занятия ("category")',
    ])
    expect(plan.writes.categories).toEqual([])
  })

  it('только добавляет: совпавшее с базой и повтор в самом файле пропускаются', () => {
    const plan = run(
      [
        { date: '2026-02-03', category: 'Чтение', minutes: 45 },
        { date: '2026-02-03', category: 'Чтение', minutes: 30 },
        { date: '2026-02-03', category: 'Чтение', minutes: 30 },
      ],
      base,
      [block('cat:чтение', '2026-02-03', 45), block('cat:чтение', '2026-02-04', 45, { deleted: true })],
    )
    expect(plan.writes.time?.map((each) => each.minutes)).toEqual([30])
    expect(plan.skipped).toBe(2)
  })

  it('удалённый блок не мешает загрузить такой же заново', () => {
    const plan = run([{ date: '2026-02-04', category: 'Чтение', minutes: 45 }], base, [
      block('cat:чтение', '2026-02-04', 45, { deleted: true }),
    ])
    expect(plan.writes.time).toHaveLength(1)
  })

  it('заметка сохраняется, пустая — не пишется', () => {
    const plan = run([
      { date: '2026-02-03', category: 'Чтение', minutes: 45, note: 'Толстой' },
      { date: '2026-02-04', category: 'Чтение', minutes: 45, note: '  ' },
    ])
    expect(plan.writes.time?.map((each) => each.note)).toEqual(['Толстой', undefined])
  })

  it('раздел не список — в отчёт целиком', () => {
    expect(run({ date: '2026-02-03' }).issues).toHaveLength(1)
  })
})
