import { describe, expect, it } from 'vitest'
import type { Category } from '../../app/model.ts'
import { activeCategories } from './categories.ts'
import { byGroup, groupKey, groupNames, hasGroups, moveGroup, moveInGroup, renameGroup, setGroup, ungroup } from './groups.ts'

function cat(id: string, order: number, group?: string, extra: Partial<Category> = {}): Category {
  return {
    id,
    updatedAt: '2026-09-01T10:00:00.000Z',
    name: id,
    order,
    kind: 'neutral',
    ...(group === undefined ? {} : { group }),
    ...extra,
  }
}

/** Экран после записи правок: «группа: категории по порядку». */
function screen(categories: readonly Category[], written: readonly Category[] = []): string[] {
  const map = new Map(categories.map((each) => [each.id, each]))
  for (const each of written) map.set(each.id, each)
  const all = [...map.values()]
  return byGroup(activeCategories(all), all, (each) => each.id).map(
    (group) => `${group.name ?? '—'}: ${group.items.map((each) => each.id).join(' ')}`,
  )
}

// a и d — «Развитие», c — «Развлечения», b — без группы.
const BASE = [cat('a', 0, 'Развитие'), cat('b', 1), cat('c', 2, 'Развлечения'), cat('d', 3, 'Развитие')]

describe('группы категорий — Р-81', () => {
  it('одна группа без учёта регистра, «ё» и пробелов', () => {
    expect(groupKey(' Учёба  и  дела ')).toBe(groupKey('учеба и дела'))
    expect(groupKey('Развлечения')).not.toBe(groupKey('Развитие'))
  })

  it('порядок групп — по первой категории; без группы — последней', () => {
    expect(screen(BASE)).toEqual(['Развитие: a d', 'Развлечения: c', '—: b'])
    expect(groupNames(BASE)).toEqual(['Развитие', 'Развлечения'])
  })

  it('групп нет ни у одной рабочей — экраны как прежде', () => {
    expect(hasGroups([cat('a', 0), cat('b', 1, 'Архивная', { archived: true })])).toBe(false)
    expect(hasGroups([cat('a', 0, '  ')])).toBe(false)
    expect(hasGroups(BASE)).toBe(true)
  })

  it('написания одной группы сходятся; название — у первой её категории', () => {
    const mixed = [cat('a', 0, 'Развитие'), cat('d', 1, ' развитие ')]
    expect(screen(mixed)).toEqual(['Развитие: a d'])
  })

  it('неизвестная категория — без группы', () => {
    const rows = [{ categoryId: 'a' }, { categoryId: 'нет такой' }]
    expect(byGroup(rows, BASE, (row) => row.categoryId).map((group) => group.key)).toEqual(['развитие', null])
  })

  it('категория двигается внутри своей группы, порядок — подряд с нуля', () => {
    expect(screen(BASE, moveInGroup(BASE, 'd', -1))).toEqual(['Развитие: d a', 'Развлечения: c', '—: b'])
    expect(moveInGroup(BASE, 'a', -1)).toEqual([])
    // Группа встала одним куском: порядок a0 d1 c2 b3.
    expect(moveInGroup(BASE, 'd', -1).map((each) => [each.id, each.order])).toEqual(
      expect.arrayContaining([
        ['d', 0],
        ['a', 1],
      ]),
    )
  })

  it('группа двигается целиком; «Без группы» — всегда последней', () => {
    expect(screen(BASE, moveGroup(BASE, 'развлечения', -1))).toEqual(['Развлечения: c', 'Развитие: a d', '—: b'])
    expect(moveGroup(BASE, 'развлечения', 1)).toEqual([])
  })

  it('в группу — в её конец; новая группа — перед «Без группы»; пусто — без группы', () => {
    expect(screen(BASE, setGroup(BASE, 'b', 'Развлечения'))).toEqual(['Развитие: a d', 'Развлечения: c b'])
    expect(screen(BASE, setGroup(BASE, 'b', '  Работа  '))).toEqual(['Развитие: a d', 'Развлечения: c', 'Работа: b'])
    // Первая категория ушла — группа остаётся на своём месте.
    expect(screen(BASE, setGroup(BASE, 'a', null))).toEqual(['Развитие: d', 'Развлечения: c', '—: b a'])
    // Набранное название уже есть — пишется её написанием.
    expect(setGroup(BASE, 'b', ' развлечения ').find((each) => each.id === 'b')?.group).toBe('Развлечения')
    expect(setGroup(BASE, 'a', '   ').find((each) => each.id === 'a')).not.toHaveProperty('group')
  })

  it('переименование — у всех её категорий, архивных тоже; в занятое — сливаются', () => {
    const all = [...BASE, cat('e', 4, 'Развитие', { archived: true })]
    const renamed = renameGroup(all, 'развитие', 'Хобби')
    expect(screen(all, renamed)).toEqual(['Хобби: a d', 'Развлечения: c', '—: b'])
    expect(renamed.find((each) => each.id === 'e')?.group).toBe('Хобби')
    // В занятое — в конец той группы, её написанием; своё место уходит.
    const merged = renameGroup(BASE, 'развитие', 'развлечения')
    expect(screen(BASE, merged)).toEqual(['Развлечения: c a d', '—: b'])
    expect(merged.find((each) => each.id === 'a')?.group).toBe('Развлечения')
    expect(renameGroup(BASE, 'развитие', ' ')).toEqual([])
  })

  it('«Убрать группу» — её категории без группы', () => {
    const cleared = ungroup(BASE, 'развитие')
    expect(screen(BASE, cleared)).toEqual(['Развлечения: c', '—: b a d'])
    expect(cleared.find((each) => each.id === 'a')).not.toHaveProperty('group')
  })
})
