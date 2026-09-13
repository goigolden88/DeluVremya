import { describe, expect, it } from 'vitest'
import type { Category, Preset, TimeBlock } from '../../core/model.ts'
import {
  activeCategories,
  archivedCategories,
  blocksUsing,
  removeCategoryPlan,
  categoryIdFor,
  createCategory,
  createPreset,
  initialCategories,
  initialPresets,
  isMinutes,
  MINUTES_PER_DAY,
  moveCategory,
  nameProblem,
  presetProblem,
  presetRow,
  presetsOf,
  restoreCategory,
  SEED_STAMP,
  sortCategories,
} from './categories.ts'
import { formatMinutes } from './labels.ts'
import { STARTER } from './starter.ts'

const AT = '2026-09-13T10:00:00.000Z'

function cat(id: string, name: string, order: number, extra: Partial<Category> = {}): Category {
  return { id, updatedAt: AT, name, order, kind: 'neutral', ...extra }
}

function preset(categoryId: string, minutes: number, extra: Partial<Preset> = {}): Preset {
  return { ...createPreset(categoryId, minutes), updatedAt: AT, ...extra }
}

describe('стартовый набор', () => {
  const seed = [
    { name: 'Чтение', kind: 'useful' as const, presets: [30, 60] },
    { name: ' ютуб ', kind: 'idle' as const, presets: [30, 30, 0, 1.5] },
    { name: 'ЧТЕНИЕ', kind: 'idle' as const, presets: [15] },
  ]

  it('id из названия, штамп неподвижный, порядок — порядок набора', () => {
    expect(initialCategories(seed)).toEqual([
      { id: 'cat:чтение', updatedAt: SEED_STAMP, name: 'Чтение', order: 0, kind: 'useful' },
      { id: 'cat:ютуб', updatedAt: SEED_STAMP, name: 'ютуб', order: 1, kind: 'idle' },
    ])
  })

  it('два устройства заводят одно и то же — дублей при встрече нет', () => {
    expect(initialCategories(seed)).toEqual(initialCategories(seed))
    expect(initialPresets(seed)).toEqual(initialPresets(seed))
  })

  it('кнопки: повтор названия и минут, негодные минуты — пропускаются', () => {
    expect(initialPresets(seed).map((each) => [each.id, each.updatedAt])).toEqual([
      ['preset:cat:чтение:30', SEED_STAMP],
      ['preset:cat:чтение:60', SEED_STAMP],
      ['preset:cat:ютуб:30', SEED_STAMP],
    ])
  })

  it('в наборе приложения названия без повторов, минуты годные, есть остаточная', () => {
    expect(initialCategories(STARTER)).toHaveLength(STARTER.length)
    for (const each of STARTER) expect(each.presets.every(isMinutes)).toBe(true)
    expect(STARTER.some((each) => each.name === 'Прочее')).toBe(true)
  })
})

describe('id и название категории', () => {
  const list = [cat('cat:шахматы', 'Игры', 0), cat('cat:покер', 'Покер', 1, { deleted: true })]

  it('свободное — из названия, без учёта регистра и пробелов', () => {
    expect(categoryIdFor(list, ' Чтение ', 'x')).toBe('cat:чтение')
  })

  it('занято живой переименованной — с суффиксом', () => {
    expect(categoryIdFor(list, 'Шахматы', 'x')).toBe('cat:шахматы:x')
  })

  it('занято надгробием — тот же id, категория оживает', () => {
    expect(categoryIdFor(list, 'покер', 'x')).toBe('cat:покер')
    expect(createCategory(list, 'Покер', 'idle', 'x').id).toBe('cat:покер')
  })

  it('пустое, двойник и двойник в архиве — разные причины', () => {
    const named = [cat('a', 'Чтение', 0), cat('b', 'Ютуб', 1, { archived: true })]
    expect(nameProblem(named, '  ')).toBe('empty')
    expect(nameProblem(named, ' чтение')).toBe('duplicate')
    expect(nameProblem(named, 'ЮТУБ')).toBe('archived')
    expect(nameProblem(named, 'Прогулка')).toBeNull()
  })

  it('переименование: своё прежнее название не мешает, удалённый двойник — тоже', () => {
    const named = [cat('a', 'Чтение', 0), cat('b', 'Покер', 1, { deleted: true })]
    expect(nameProblem(named, 'ЧТЕНИЕ', 'a')).toBeNull()
    expect(nameProblem(named, 'Покер')).toBeNull()
  })
})

describe('порядок и архив', () => {
  const list = [
    cat('c', 'Ютуб', 2),
    cat('a', 'Чтение', 0),
    cat('x', 'Старое', 1, { deleted: true }),
    cat('b', 'Бег', 0),
    cat('z', 'Покер', 1, { archived: true }),
  ]

  it('удалённых нет; по порядку, при равном — по названию', () => {
    expect(sortCategories(list).map((each) => each.id)).toEqual(['b', 'a', 'z', 'c'])
  })

  it('архив отдельно от рабочих', () => {
    expect(activeCategories(list).map((each) => each.id)).toEqual(['b', 'a', 'c'])
    expect(archivedCategories(list).map((each) => each.id)).toEqual(['z'])
  })

  it('новая и возвращённая из архива — в конец', () => {
    expect(createCategory(list, 'Прогулка', 'useful', 'x').order).toBe(3)
    expect(restoreCategory(list, cat('z', 'Покер', 1, { archived: true }))).toMatchObject({ archived: false, order: 3 })
  })

  it('сдвиг пересчитывает порядок подряд и отдаёт только изменённые', () => {
    const moved = moveCategory(list, 'c', -1)
    expect(moved.map((each) => [each.id, each.order])).toEqual([
      ['c', 1],
      ['a', 2],
    ])
    // «Бег» с порядком 0 и так на месте — его писать незачем.
    expect(moved.some((each) => each.id === 'b')).toBe(false)
  })

  it('сдвигать некуда или нечего — пусто', () => {
    expect(moveCategory(list, 'b', -1)).toEqual([])
    expect(moveCategory(list, 'c', 1)).toEqual([])
    expect(moveCategory(list, 'z', 1)).toEqual([])
    expect(moveCategory(list, 'нет', 1)).toEqual([])
  })
})

describe('удаление категории — Р-22', () => {
  const categories = [cat('a', 'Ютуб', 0), cat('b', 'Шахматы', 1), cat('c', 'Прочее', 2), cat('x', 'Старое', 3, { deleted: true })]
  const presets = [preset('b', 30), preset('b', 60, { deleted: true }), preset('a', 30)]
  function block(id: string, categoryId: string, extra: Partial<TimeBlock> = {}): TimeBlock {
    return { id, updatedAt: AT, date: '2026-09-13', categoryId, minutes: 30, ...extra }
  }

  it('блоки считаются и основные, и фоновые, удалённые — нет', () => {
    const blocks = [block('1', 'b'), block('2', 'a', { bgCategoryId: 'b' }), block('3', 'b', { deleted: true })]
    expect(blocksUsing(blocks, 'b')).toBe(2)
  })

  it('пустая — надгробие ей и её живым кнопкам, блоков не трогает', () => {
    const plan = removeCategoryPlan(categories, presets, [block('1', 'a')], 'b', null)
    expect(plan?.categories).toEqual([{ ...categories[1], deleted: true }])
    expect(plan?.presets.map((each) => [each.id, each.deleted])).toEqual([['preset:b:30', true]])
    expect(plan?.blocks).toEqual([])
  })

  it('с блоками и без переноса — нельзя', () => {
    const blocks = [block('1', 'b')]
    expect(removeCategoryPlan(categories, presets, blocks, 'b', null)).toBeNull()
    expect(removeCategoryPlan(categories, presets, blocks, 'b', 'b')).toBeNull()
    expect(removeCategoryPlan(categories, presets, blocks, 'b', 'x')).toBeNull()
    expect(removeCategoryPlan(categories, presets, blocks, 'b', 'нет')).toBeNull()
  })

  it('перенос — и основной, и фоновой; совпавшая с основной фоновая снимается', () => {
    const blocks = [
      block('1', 'b'),
      block('2', 'a', { bgCategoryId: 'b' }),
      block('3', 'c', { bgCategoryId: 'b' }),
      block('4', 'b', { bgCategoryId: 'c' }),
      block('5', 'a'),
    ]
    const moved = removeCategoryPlan(categories, presets, blocks, 'b', 'c')?.blocks ?? []
    expect(moved.map((each) => [each.id, each.categoryId, each.bgCategoryId])).toEqual([
      ['1', 'c', undefined],
      ['2', 'a', 'c'],
      ['3', 'c', undefined],
      ['4', 'c', undefined],
    ])
    expect(moved.every((each) => !('bgCategoryId' in each) || each.bgCategoryId !== each.categoryId)).toBe(true)
    // Исходные блоки не тронуты: план — новые записи.
    expect(blocks[0]?.categoryId).toBe('b')
  })

  it('удалять нечего — удалённая или неизвестная', () => {
    expect(removeCategoryPlan(categories, presets, [], 'x', null)).toBeNull()
    expect(removeCategoryPlan(categories, presets, [], 'нет', null)).toBeNull()
  })
})

describe('кнопки', () => {
  it('минуты — целые, от одной до суток', () => {
    expect([0, 1, 1.5, MINUTES_PER_DAY, MINUTES_PER_DAY + 1, Number.NaN].map(isMinutes)).toEqual([
      false,
      true,
      false,
      true,
      false,
      false,
    ])
  })

  it('двойник — только живой и той же категории', () => {
    const presets = [preset('a', 30), preset('a', 60, { deleted: true }), preset('b', 15)]
    expect(presetProblem(presets, 'a', 30)).toBe('duplicate')
    expect(presetProblem(presets, 'a', 60)).toBeNull()
    expect(presetProblem(presets, 'a', 15)).toBeNull()
    expect(presetProblem(presets, 'a', 0)).toBe('range')
  })

  it('кнопки категории — живые, по минутам, в какой очереди ни заводи', () => {
    const presets = [preset('a', 60), preset('b', 5), preset('a', 15), preset('a', 30, { deleted: true })]
    expect(presetsOf(presets, 'a').map((each) => each.minutes)).toEqual([15, 60])
  })

  it('строка дня: по порядку категорий, без архивных, удалённых и неизвестных', () => {
    const categories = [
      cat('b', 'Бег', 1),
      cat('a', 'Чтение', 0),
      cat('z', 'Покер', 2, { archived: true }),
      cat('x', 'Старое', 3, { deleted: true }),
    ]
    const presets = [preset('b', 30), preset('a', 60), preset('a', 30), preset('z', 30), preset('x', 30), preset('нет', 30)]
    expect(presetRow(categories, presets).map((each) => `${each.category.name} +${each.preset.minutes}`)).toEqual([
      'Чтение +30',
      'Чтение +60',
      'Бег +30',
    ])
  })
})

describe('formatMinutes', () => {
  it('минуты, часы, часы с минутами', () => {
    expect([0, 45, 60, 90, 125, 29.6].map(formatMinutes)).toEqual([
      '0 мин',
      '45 мин',
      '1 ч',
      '1 ч 30 мин',
      '2 ч 5 мин',
      '30 мин',
    ])
  })
})
