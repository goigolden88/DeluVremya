/**
 * Группы категорий (Р-81): «Развлечения», «Развитие».
 *
 * Своей записи у группы нет — это строка `group` у категории; группа есть,
 * пока в ней есть категория. Порядок групп — по первой их категории в общем
 * `order`, без группы — последней. Отдельного поля порядка групп нет: сдвиг
 * группы — перенумерация категорий подряд.
 *
 * Чистые функции, без React и без базы (02-Архитектура, «Структура кода»).
 */

import type { Category } from '../../core/model.ts'
import { activeCategories } from './categories.ts'

/** Название группы без лишних пробелов. Пустое — null. */
function clean(name: string | null | undefined): string | null {
  const text = name?.trim().replace(/\s+/g, ' ')
  return text ? text : null
}

/** Одна ли это группа: регистр, «ё» и лишние пробелы не в счёт. */
export function groupKey(name: string): string {
  return (clean(name) ?? '').toLocaleLowerCase('ru').replace(/ё/g, 'е')
}

export type Group<T> = {
  /** Ключ группы; null — «Без группы». */
  key: string | null
  /** Название — как у первой её категории; null — «Без группы». */
  name: string | null
  items: T[]
}

/**
 * Разложить по группам. Элементы приходят в порядке категорий; группа встаёт
 * туда, где встретилась первая её категория, внутри — порядок входа. Без
 * группы — последней. `idOf` — категория элемента; неизвестная — без группы.
 */
export function byGroup<T>(
  items: readonly T[],
  categories: readonly Category[],
  idOf: (item: T) => string,
): Group<T>[] {
  const known = new Map(categories.map((category) => [category.id, category]))
  const groups = new Map<string | null, Group<T>>()
  for (const item of items) {
    const name = clean(known.get(idOf(item))?.group)
    const key = name === null ? null : groupKey(name)
    let group = groups.get(key)
    if (!group) {
      group = { key, name, items: [] }
      groups.set(key, group)
    }
    group.items.push(item)
  }
  const list = [...groups.values()]
  return [...list.filter((group) => group.key !== null), ...list.filter((group) => group.key === null)]
}

/** Есть ли группа хоть у одной рабочей категории. Нет — экраны выглядят как прежде. */
export function hasGroups(categories: readonly Category[]): boolean {
  return activeCategories(categories).some((category) => clean(category.group) !== null)
}

/** Рабочие категории по группам — порядок экрана категорий и кнопок. */
function displayed(categories: readonly Category[]): Group<Category>[] {
  return byGroup(activeCategories(categories), categories, (category) => category.id)
}

/** Названия групп рабочих категорий по порядку — для выбора в карточке. */
export function groupNames(categories: readonly Category[]): string[] {
  return displayed(categories).flatMap((group) => (group.name === null ? [] : [group.name]))
}

/**
 * Порядок подряд с нуля по раскладке. После архивов, слияний и правок
 * с двух устройств в нём бывают дыры и повторы; заодно группа встаёт одним
 * куском. Возвращает только те, у кого порядок изменился.
 */
function renumber(groups: readonly Group<Category>[]): Category[] {
  return groups
    .flatMap((group) => group.items)
    .flatMap((category, order) => (category.order === order ? [] : [{ ...category, order }]))
}

/** Категория с группой `name`; null — без группы, ключом из записи. */
function withGroup(category: Category, name: string | null): Category {
  if (name !== null) return { ...category, group: name }
  const { group: _group, ...rest } = category
  return rest
}

/** Сдвиг категории выше или ниже внутри её группы. Некуда — пусто. */
export function moveInGroup(categories: readonly Category[], id: string, step: -1 | 1): Category[] {
  const groups = displayed(categories)
  const group = groups.find((each) => each.items.some((category) => category.id === id))
  if (!group) return []
  const from = group.items.findIndex((category) => category.id === id)
  const a = group.items[from]
  const b = group.items[from + step]
  if (!a || !b) return []
  group.items[from] = b
  group.items[from + step] = a
  return renumber(groups)
}

/** Сдвиг группы целиком. «Без группы» стоит последней и не двигается. */
export function moveGroup(categories: readonly Category[], key: string, step: -1 | 1): Category[] {
  const groups = displayed(categories)
  const named = groups.filter((group) => group.key !== null)
  const from = named.findIndex((group) => group.key === key)
  const a = named[from]
  const b = named[from + step]
  if (!a || !b) return []
  named[from] = b
  named[from + step] = a
  return renumber([...named, ...groups.filter((group) => group.key === null)])
}

/**
 * Раскладка экрана и правки к ней: что изменилось в группе у записей и что —
 * в порядке. Раскладка правится явно, по уже показанному порядку групп: порядок
 * групп выводится из категорий, и без этого группа, у которой ушла первая
 * категория, съезжала бы вниз.
 */
function arranged(groups: readonly Group<Category>[], touched: readonly Category[]): Category[] {
  const result = new Map(touched.map((category) => [category.id, category]))
  for (const category of renumber(groups)) result.set(category.id, category)
  return [...result.values()]
}

/** Та же группа уже есть — её написание: одна группа не пишется двумя способами. */
function spelling(groups: readonly Group<Category>[], name: string): string {
  return groups.find((group) => group.key === groupKey(name))?.name ?? name
}

/**
 * Категорию — в группу `name`; пусто или null — без группы. Встаёт в конец
 * своей новой группы; новая группа встаёт последней перед «Без группы».
 * Остальные группы остаются на своих местах.
 */
export function setGroup(categories: readonly Category[], id: string, name: string | null): Category[] {
  const category = categories.find((each) => each.id === id && !each.deleted)
  if (!category) return []
  const groups = displayed(categories)
    .map((group) => ({ ...group, items: group.items.filter((each) => each.id !== id) }))
    .filter((group) => group.items.length > 0)

  const title = clean(name)
  const moved = withGroup(category, title === null ? null : spelling(groups, title))
  const key = moved.group === undefined ? null : groupKey(moved.group)
  const target = groups.find((group) => group.key === key)
  if (target) target.items.push(moved)
  else {
    const empty = groups.findIndex((group) => group.key === null)
    groups.splice(key === null || empty === -1 ? groups.length : empty, 0, {
      key,
      name: moved.group ?? null,
      items: [moved],
    })
  }
  return arranged(groups, [moved])
}

/** Живые категории группы `key`, архивные тоже, — с правкой `change`. */
function members(categories: readonly Category[], key: string, change: (category: Category) => Category): Category[] {
  return categories
    .filter((category) => !category.deleted && category.group !== undefined && groupKey(category.group) === key)
    .map(change)
}

/**
 * Переименовать группу; место её — прежнее. Совпало с другой — сливаются:
 * её категории встают в конец той, её написанием. Пустое — ничего.
 */
export function renameGroup(categories: readonly Category[], key: string, name: string): Category[] {
  const title = clean(name)
  if (title === null) return []
  const groups = displayed(categories)
  const own = groups.find((group) => group.key === key)
  const into = groups.find((group) => group.key === groupKey(title) && group.key !== key)
  const renamed = members(categories, key, (category) => withGroup(category, into?.name ?? title))
  if (renamed.length === 0) return []

  const shown = renamed.filter((category) => own?.items.some((each) => each.id === category.id))
  const next = groups
    .filter((group) => !(into && group === own))
    .map((group) => {
      if (group === into) return { ...group, items: [...group.items, ...shown] }
      if (group === own) return { ...group, name: title, items: shown }
      return group
    })
  return arranged(next, renamed)
}

/** Убрать группу: её категории уходят в конец «Без группы», остальные — на местах. */
export function ungroup(categories: readonly Category[], key: string): Category[] {
  const cleared = members(categories, key, (category) => withGroup(category, null))
  if (cleared.length === 0) return []
  const groups = displayed(categories)
  const own = groups.find((group) => group.key === key)
  const shown = cleared.filter((category) => own?.items.some((each) => each.id === category.id))
  const rest = groups.filter((group) => group !== own)
  const empty = rest.find((group) => group.key === null)
  const next = empty
    ? rest.map((group) => (group === empty ? { ...group, items: [...group.items, ...shown] } : group))
    : [...rest, { key: null, name: null, items: shown }]
  return arranged(next, cleared)
}
