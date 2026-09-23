import { describe, expect, it } from 'vitest'
import type { Category, Preset, TimeBlock } from '../../app/model.ts'
import { createPreset, initialCategories, initialPresets, reconcilePlan, removeCategoryPlan } from './categories.ts'
import type { ReconcilePlan } from './categories.ts'
import { STARTER } from './starter.ts'

const OLD = '2026-09-01T10:00:00.000Z'
const NEW = '2026-09-13T10:00:00.000Z'

function cat(id: string, name: string, extra: Partial<Category> = {}): Category {
  return { id, updatedAt: OLD, name, order: 0, kind: 'neutral', ...extra }
}

function preset(categoryId: string, minutes: number, extra: Partial<Preset> = {}): Preset {
  return { ...createPreset(categoryId, minutes), updatedAt: OLD, ...extra }
}

function block(id: string, categoryId: string, extra: Partial<TimeBlock> = {}): TimeBlock {
  return { id, updatedAt: OLD, date: '2026-09-13', categoryId, minutes: 30, ...extra }
}

/** План без времени правки кнопок — его ставит `createPreset` — и в одном порядке. */
function stable(plan: ReconcilePlan) {
  const byId = <T extends { id: string }>(list: T[]) => [...list].sort((a, b) => a.id.localeCompare(b.id))
  return {
    categories: byId(plan.categories),
    presets: byId(plan.presets).map(({ updatedAt: _, ...rest }) => rest),
    blocks: byId(plan.blocks),
  }
}

/** Записать план поверх данных — как это сделает база. */
function apply<T extends { id: string }>(list: readonly T[], written: readonly T[]): T[] {
  const map = new Map(list.map((each) => [each.id, each]))
  for (const each of written) map.set(each.id, each)
  return [...map.values()]
}

describe('группа при слиянии одноимённых — Р-81', () => {
  it('у оставшейся — группа поздней правки', () => {
    const plan = reconcilePlan(
      [cat('cat:игры', 'Игры', { group: 'Развлечения' }), cat('cat:шахматы', 'Игры', { updatedAt: NEW, group: 'Развитие' })],
      [],
      [],
    )
    expect(plan.categories.find((each) => each.id === 'cat:игры')?.group).toBe('Развитие')
  })
})

describe('одноимённые категории — Р-29', () => {
  // Телефон переименовал «Шахматы» в «Игры» — id остался прежним; компьютер
  // в это время завёл «Игры» заново. После обмена — две «Игры».
  const renamed = cat('cat:шахматы', 'ИГРЫ', { updatedAt: NEW, order: 4, kind: 'idle' })
  const created = cat('cat:игры', 'Игры', { order: 7 })

  it('остаётся та, чей id совпадает с названием; содержимое — от поздней правки', () => {
    const plan = reconcilePlan([renamed, created], [], [])
    expect(plan.categories).toContainEqual({ ...created, name: 'ИГРЫ', order: 4, kind: 'idle' })
    expect(plan.categories).toContainEqual({ ...renamed, deleted: true, movedTo: 'cat:игры' })
    expect(plan.categories).toHaveLength(2)
  })

  it('поздняя правка у самой оставшейся — её не переписываем', () => {
    const plan = reconcilePlan([cat('cat:шахматы', 'Игры'), cat('cat:игры', 'Игры', { updatedAt: NEW })], [], [])
    expect(plan.categories.map((each) => each.id)).toEqual(['cat:шахматы'])
  })

  it('id с названием не совпал ни у одной — остаётся наименьший', () => {
    const plan = reconcilePlan([cat('b', 'Покер'), cat('a', ' покер ')], [], [])
    expect(plan.categories).toEqual([{ ...cat('b', 'Покер'), deleted: true, movedTo: 'a' }])
  })

  it('архив берётся у поздней правки, в обе стороны', () => {
    const archivedOld = cat('cat:ютуб', 'Ютуб', { archived: true })
    const activeNew = cat('u1', 'Ютуб', { updatedAt: NEW })
    const survivor = reconcilePlan([archivedOld, activeNew], [], []).categories.find((each) => each.id === 'cat:ютуб')
    expect(survivor?.archived).toBeUndefined()

    const activeOld = cat('cat:ютуб', 'Ютуб')
    const archivedNew = cat('u1', 'Ютуб', { updatedAt: NEW, archived: true })
    const archived = reconcilePlan([activeOld, archivedNew], [], []).categories.find((each) => each.id === 'cat:ютуб')
    expect(archived?.archived).toBe(true)
  })

  it('блоки уходят в оставшуюся — и основные, и фоновые; совпавшая фоновая снимается', () => {
    const other = cat('cat:ютуб', 'Ютуб')
    const blocks = [
      block('1', 'cat:шахматы'),
      block('2', 'cat:ютуб', { bgCategoryId: 'cat:шахматы' }),
      block('3', 'cat:игры', { bgCategoryId: 'cat:шахматы' }),
      block('4', 'cat:шахматы', { deleted: true }),
      block('5', 'cat:ютуб'),
    ]
    const moved = reconcilePlan([renamed, created, other], [], blocks).blocks
    expect(moved.map((each) => [each.id, each.categoryId, each.bgCategoryId])).toEqual([
      ['1', 'cat:игры', undefined],
      ['2', 'cat:ютуб', 'cat:игры'],
      ['3', 'cat:игры', undefined],
    ])
  })

  it('кнопки переезжают; минуты, которые у оставшейся уже есть, просто уходят', () => {
    const presets = [preset('cat:шахматы', 30), preset('cat:шахматы', 45, { order: 2 }), preset('cat:игры', 30)]
    const plan = stable(reconcilePlan([renamed, created], presets, []))
    expect(plan.presets.map((each) => [each.id, each.categoryId, each.minutes, each.order, each.deleted])).toEqual([
      ['preset:cat:игры:45', 'cat:игры', 45, 2, undefined],
      ['preset:cat:шахматы:30', 'cat:шахматы', 30, 30, true],
      ['preset:cat:шахматы:45', 'cat:шахматы', 45, 2, true],
    ])
  })

  it('три одноимённых — одна остаётся, две уходят к ней', () => {
    const plan = reconcilePlan([cat('c', 'Бег'), cat('a', 'бег'), cat('b', 'БЕГ')], [], [block('1', 'c')])
    expect(plan.categories.filter((each) => each.deleted).map((each) => [each.id, each.movedTo])).toEqual([
      ['c', 'a'],
      ['b', 'a'],
    ])
    expect(plan.blocks[0]?.categoryId).toBe('a')
  })

  it('два устройства, увидев одно и то же в разном порядке, пишут одно и то же', () => {
    const categories = [renamed, created, cat('x', 'Прочее'), cat('y', 'прочее', { updatedAt: NEW })]
    const presets = [preset('cat:шахматы', 45), preset('y', 30), preset('x', 30)]
    const blocks = [block('1', 'cat:шахматы'), block('2', 'y', { bgCategoryId: 'cat:шахматы' })]

    const one = stable(reconcilePlan(categories, presets, blocks))
    const two = stable(reconcilePlan([...categories].reverse(), [...presets].reverse(), [...blocks].reverse()))
    expect(two).toEqual(one)
  })

  it('после записи плана второй прогон ничего не находит', () => {
    const categories = [renamed, created]
    const presets = [preset('cat:шахматы', 45)]
    const blocks = [block('1', 'cat:шахматы')]
    const plan = reconcilePlan(categories, presets, blocks)

    const again = reconcilePlan(apply(categories, plan.categories), apply(presets, plan.presets), apply(blocks, plan.blocks))
    expect(again).toEqual({ categories: [], presets: [], blocks: [] })
  })

  it('обычный набор без дублей — план пуст', () => {
    const categories = initialCategories(STARTER)
    const blocks = [block('1', categories[0]?.id ?? '')]
    expect(reconcilePlan(categories, initialPresets(STARTER), blocks)).toEqual({ categories: [], presets: [], blocks: [] })
  })
})

describe('надгробие с переносом — Р-29', () => {
  const live = cat('c', 'Прочее')

  it('блок, приехавший к надгробию, уходит туда, куда оно указывает', () => {
    // На компьютере «Покер» удалили с переносом в «Прочее»; телефон до обмена
    // успел записать в «Покер» ещё блок.
    const gone = cat('p', 'Покер', { deleted: true, movedTo: 'c' })
    const plan = reconcilePlan([gone, live], [preset('p', 60)], [block('1', 'p'), block('2', 'c', { bgCategoryId: 'p' })])
    expect(plan.blocks.map((each) => [each.id, each.categoryId, each.bgCategoryId])).toEqual([
      ['1', 'c', undefined],
      ['2', 'c', undefined],
    ])
    expect(stable(plan).presets.map((each) => [each.id, each.deleted])).toEqual([
      ['preset:c:60', undefined],
      ['preset:p:60', true],
    ])
    expect(plan.categories).toEqual([])
  })

  it('по цепочке — до живой категории', () => {
    const categories = [cat('x', 'X', { deleted: true, movedTo: 'y' }), cat('y', 'Y', { deleted: true, movedTo: 'c' }), live]
    expect(reconcilePlan(categories, [], [block('1', 'x')]).blocks[0]?.categoryId).toBe('c')
  })

  it('кольцо, пустой конец и надгробие без переноса — блок не трогается', () => {
    const categories = [
      cat('x', 'X', { deleted: true, movedTo: 'y' }),
      cat('y', 'Y', { deleted: true, movedTo: 'x' }),
      cat('z', 'Z', { deleted: true, movedTo: 'нет' }),
      cat('w', 'W', { deleted: true, movedTo: 'v' }),
      cat('v', 'V', { deleted: true }),
      cat('q', 'Q', { deleted: true }),
      live,
    ]
    const blocks = [block('1', 'x'), block('2', 'z'), block('3', 'w'), block('4', 'q')]
    expect(reconcilePlan(categories, [], blocks).blocks).toEqual([])
  })
})

describe('удаление с переносом помнит, куда — Р-22, Р-29', () => {
  const categories = [cat('a', 'Ютуб'), cat('b', 'Покер')]

  it('с блоками — надгробие с movedTo', () => {
    const plan = removeCategoryPlan(categories, [], [block('1', 'b')], 'b', 'a')
    expect(plan?.categories).toEqual([{ ...categories[1], deleted: true, movedTo: 'a' }])
  })

  it('пустая без выбора — надгробие без movedTo', () => {
    const plan = removeCategoryPlan(categories, [], [], 'b', null)
    expect(plan?.categories).toEqual([{ ...categories[1], deleted: true }])
  })
})
