/**
 * Категории и пресеты учёта времени: стартовый набор, id, порядок, архив.
 *
 * Чистые функции, без React и без базы (02-Архитектура, «Структура кода»).
 * Постоянные id из названия и неподвижный штамп стартового набора взяты
 * из «Дневников» — там так заведены категории циклов.
 */

import { nowIso } from '../../core/dates.ts'
import type { Category, Preset, TimeBlock } from '../../core/model.ts'

export type CategoryKind = Category['kind']

/** Минут в сутках: ни кнопка, ни блок длиннее не бывают. */
export const MINUTES_PER_DAY = 24 * 60

/**
 * Штамп стартового набора — неподвижный, в прошлом.
 *
 * Два устройства до синхронизации заводят набор каждое своё, с одними
 * и теми же id. Любая настоящая правка этот штамп побеждает, поэтому
 * позднее наполнение второго устройства не затрёт переименование,
 * сделанное на первом.
 */
export const SEED_STAMP = '2000-01-01T00:00:00.000Z'

/** Категория стартового набора: название, признак, кнопки в минутах. */
export type SeedCategory = { name: string; kind: CategoryKind; presets: readonly number[] }

export function normName(name: string): string {
  return name.trim().toLocaleLowerCase('ru')
}

/** Одно ли это название: регистр и пробелы по краям не различаются. */
export function sameName(a: string, b: string): boolean {
  return normName(a) === normName(b)
}

/**
 * Id категории по названию. Одинаков на всех устройствах: одна и та же
 * категория, заведённая в двух местах до синхронизации, не раздваивается.
 *
 * Занят живой категорией — её переименовали, а id остался прежним, —
 * к нему дописывается `suffix`. Занят надгробием — id берётся тот же,
 * и категория оживает.
 */
export function categoryIdFor(categories: readonly Category[], name: string, suffix: string): string {
  const base = `cat:${normName(name)}`
  const taken = categories.find((category) => category.id === base)
  return taken && !taken.deleted ? `${base}:${suffix}` : base
}

/** Почему название не годится. */
export type NameProblem = 'empty' | 'duplicate' | 'archived'

/**
 * Годится ли название. `selfId` — при переименовании: своё прежнее
 * название не мешает. Двойник в архиве называется отдельно — его
 * возвращают, а не заводят второй.
 */
export function nameProblem(
  categories: readonly Category[],
  name: string,
  selfId?: string,
): NameProblem | null {
  if (!name.trim()) return 'empty'
  const twin = categories.find(
    (category) => !category.deleted && category.id !== selfId && sameName(category.name, name),
  )
  if (!twin) return null
  return twin.archived ? 'archived' : 'duplicate'
}

/** Живые категории по порядку, архив тоже. */
export function sortCategories(categories: readonly Category[]): Category[] {
  return categories
    .filter((category) => !category.deleted)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ru'))
}

/** То, чем размечают время сейчас: живые, не в архиве, по порядку. */
export function activeCategories(categories: readonly Category[]): Category[] {
  return sortCategories(categories).filter((category) => !category.archived)
}

export function archivedCategories(categories: readonly Category[]): Category[] {
  return sortCategories(categories).filter((category) => category.archived === true)
}

function nextOrder(categories: readonly Category[]): number {
  const live = categories.filter((category) => !category.deleted)
  return live.length === 0 ? 0 : Math.max(...live.map((category) => category.order)) + 1
}

/**
 * Новая категория — в конец списка. Название проверено `nameProblem`.
 * На месте надгробия оживает с тем же id.
 */
export function createCategory(
  categories: readonly Category[],
  name: string,
  kind: CategoryKind,
  suffix: string,
): Category {
  return {
    id: categoryIdFor(categories, name, suffix),
    updatedAt: nowIso(),
    name: name.trim(),
    order: nextOrder(categories),
    kind,
  }
}

/** Из архива — в конец списка: прежнее место давно заняли. */
export function restoreCategory(categories: readonly Category[], category: Category): Category {
  return { ...category, archived: false, order: nextOrder(categories) }
}

/**
 * Сдвиг категории на место выше или ниже среди неархивных.
 *
 * Порядок пересчитывается подряд с нуля: после архивов и слияний
 * в нём бывают дыры и повторы, и обмен двух чисел их бы не убрал.
 * Возвращает только те, у которых порядок изменился, — их и писать.
 * Сдвигать некуда — пусто.
 */
export function moveCategory(categories: readonly Category[], id: string, step: -1 | 1): Category[] {
  const list = activeCategories(categories)
  const from = list.findIndex((category) => category.id === id)
  const to = from + step
  const a = list[from]
  const b = list[to]
  if (from === -1 || !a || !b) return []
  list[from] = b
  list[to] = a
  return list.flatMap((category, order) => (category.order === order ? [] : [{ ...category, order }]))
}

// ─── Удаление (Р-22) ───────────────────────────────────────────────────────

function uses(block: TimeBlock, id: string): boolean {
  return !block.deleted && (block.categoryId === id || block.bgCategoryId === id)
}

/** Сколько живых блоков ссылается на категорию — основной или фоновой. */
export function blocksUsing(blocks: readonly TimeBlock[], id: string): number {
  return blocks.filter((block) => uses(block, id)).length
}

/** Что записать, чтобы удалить категорию. */
export type RemovePlan = { categories: Category[]; presets: Preset[]; blocks: TimeBlock[] }

/**
 * Блок переходит из `from` в `to` — и основной, и фоновой. Если фоновая
 * совпала с основной, она снимается: один и тот же час дважды не пишется.
 */
function moveBlock(block: TimeBlock, from: string, to: string): TimeBlock {
  const next = { ...block }
  if (next.categoryId === from) next.categoryId = to
  if (next.bgCategoryId === from) next.bgCategoryId = to
  if (next.bgCategoryId === next.categoryId) delete next.bgCategoryId
  return next
}

/**
 * Удаление категории (Р-22): надгробие ей и её кнопкам. Если на неё
 * ссылаются блоки, они сначала переходят в `moveTo` — без этого удалить
 * нельзя, и ответ null. Null и тогда, когда удалять нечего.
 *
 * Перенос — это и слияние двух категорий: отдельного механизма для него нет.
 */
export function removeCategoryPlan(
  categories: readonly Category[],
  presets: readonly Preset[],
  blocks: readonly TimeBlock[],
  id: string,
  moveTo: string | null,
): RemovePlan | null {
  const category = categories.find((each) => each.id === id && !each.deleted)
  if (!category) return null

  const using = blocks.filter((block) => uses(block, id))
  let moved: TimeBlock[] = []
  if (using.length > 0) {
    const target = categories.find((each) => each.id === moveTo && !each.deleted)
    if (!target || target.id === id) return null
    moved = using.map((block) => moveBlock(block, id, target.id))
  }

  return {
    categories: [{ ...category, deleted: true }],
    presets: presets
      .filter((preset) => !preset.deleted && preset.categoryId === id)
      .map((preset) => ({ ...preset, deleted: true })),
    blocks: moved,
  }
}

// ─── Пресеты ───────────────────────────────────────────────────────────────

/**
 * Id кнопки — из категории и минут, как у категории из названия: одна
 * и та же кнопка на двух устройствах не раздваивается, а убранная и
 * заведённая снова оживает на месте надгробия.
 */
export function presetIdFor(categoryId: string, minutes: number): string {
  return `preset:${categoryId}:${minutes}`
}

/** Целые минуты, от одной до суток. */
export function isMinutes(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= MINUTES_PER_DAY
}

export type PresetProblem = 'range' | 'duplicate'

export function presetProblem(
  presets: readonly Preset[],
  categoryId: string,
  minutes: number,
): PresetProblem | null {
  if (!isMinutes(minutes)) return 'range'
  const twin = presets.some(
    (preset) => !preset.deleted && preset.categoryId === categoryId && preset.minutes === minutes,
  )
  return twin ? 'duplicate' : null
}

/**
 * Новая кнопка. Порядок — по минутам: «+15» встаёт перед «+30», в какой
 * очереди их ни заводи. Поле `order` при этом остаётся в модели и
 * позволит переставлять вручную, если понадобится.
 */
export function createPreset(categoryId: string, minutes: number): Preset {
  return { id: presetIdFor(categoryId, minutes), updatedAt: nowIso(), categoryId, minutes, order: minutes }
}

/** Живые кнопки категории по порядку. */
export function presetsOf(presets: readonly Preset[], categoryId: string): Preset[] {
  return presets
    .filter((preset) => !preset.deleted && preset.categoryId === categoryId)
    .sort((a, b) => a.order - b.order || a.minutes - b.minutes)
}

export type PresetButton = { preset: Preset; category: Category }

/**
 * Строка кнопок на экране дня: категории по порядку, внутри — кнопки
 * по порядку. Кнопки архивных, удалённых и неизвестных категорий
 * не показываются: нажать их значит записать время туда, куда уже
 * не размечают.
 */
export function presetRow(categories: readonly Category[], presets: readonly Preset[]): PresetButton[] {
  return activeCategories(categories).flatMap((category) =>
    presetsOf(presets, category.id).map((preset) => ({ preset, category })),
  )
}

// ─── Стартовый набор ───────────────────────────────────────────────────────

/** Набор без повторов названий, первое вхождение побеждает. */
function uniqueSeed(seed: readonly SeedCategory[]): SeedCategory[] {
  const unique: SeedCategory[] = []
  for (const each of seed) {
    if (each.name.trim() && !unique.some((other) => sameName(other.name, each.name))) unique.push(each)
  }
  return unique
}

/** Категории стартового набора в его порядке, с постоянными id и штампом. */
export function initialCategories(seed: readonly SeedCategory[]): Category[] {
  return uniqueSeed(seed).map((each, order) => ({
    id: `cat:${normName(each.name)}`,
    updatedAt: SEED_STAMP,
    name: each.name.trim(),
    order,
    kind: each.kind,
  }))
}

/** Кнопки стартового набора. Негодные минуты и повторы пропускаются. */
export function initialPresets(seed: readonly SeedCategory[]): Preset[] {
  return uniqueSeed(seed).flatMap((each) => {
    const categoryId = `cat:${normName(each.name)}`
    const minutes = [...new Set(each.presets)].filter(isMinutes)
    return minutes.map((value) => ({ ...createPreset(categoryId, value), updatedAt: SEED_STAMP }))
  })
}
