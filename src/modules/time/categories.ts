/**
 * Категории и пресеты учёта времени: стартовый набор, id, порядок, архив.
 *
 * Чистые функции, без React и без базы (02-Архитектура, «Структура кода»).
 * Постоянные id из названия и неподвижный штамп стартового набора взяты
 * из «Дневников» — там так заведены категории циклов.
 */

import { nowIso } from '../../shared/core/dates.ts'
import type { Category, Preset, TimeBlock } from '../../app/model.ts'

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
export type SeedCategory = { name: string; kind: CategoryKind; presets: readonly number[]; group?: string }

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
 * Надгробие помнит, куда перенесено, — `movedTo` (Р-29): блок, записанный
 * в эту категорию на другом устройстве до обмена, приедет позже и перейдёт
 * туда же сам (`reconcilePlan`).
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

  const target = categories.find((each) => each.id === moveTo && !each.deleted && each.id !== id)
  const using = blocks.filter((block) => uses(block, id))
  if (using.length > 0 && !target) return null
  const moved = target ? using.map((block) => moveBlock(block, id, target.id)) : []

  return {
    categories: [{ ...category, deleted: true, ...(target ? { movedTo: target.id } : {}) }],
    presets: presets
      .filter((preset) => !preset.deleted && preset.categoryId === id)
      .map((preset) => ({ ...preset, deleted: true })),
    blocks: moved,
  }
}

// ─── Одноимённые и надгробия с переносом (Р-29) ───────────────────────────

/** Что записать после прихода данных с сервера или из файла. */
export type ReconcilePlan = RemovePlan

/**
 * Какая из одноимённых остаётся: чей id совпадает с названием, иначе
 * с наименьшим id. По id, а не по времени правки: время два устройства
 * могут видеть разным, id — одинаковым, и выбор на обоих выйдет один.
 */
function survivorOf(group: readonly Category[], key: string): Category {
  const named = group.find((category) => category.id === `cat:${key}`)
  if (named) return named
  return group.reduce((best, each) => (each.id < best.id ? each : best))
}

/** Самая поздняя правка группы. Равные по времени — по id: ответ один. */
function latestOf(group: readonly Category[]): Category {
  return group.reduce((best, each) =>
    each.updatedAt > best.updatedAt || (each.updatedAt === best.updatedAt && each.id < best.id) ? each : best,
  )
}

/** Оставшаяся с содержимым поздней правки. Ничего не поменялось — null. */
function withContent(survivor: Category, latest: Category): Category | null {
  const next: Category = { ...survivor, name: latest.name, kind: latest.kind, order: latest.order }
  if (latest.archived) next.archived = true
  else delete next.archived
  // Группа — тоже содержимое (Р-81).
  if (latest.group !== undefined) next.group = latest.group
  else delete next.group
  delete next.movedTo

  const same =
    next.name === survivor.name &&
    next.kind === survivor.kind &&
    next.order === survivor.order &&
    Boolean(next.archived) === Boolean(survivor.archived) &&
    next.group === survivor.group &&
    survivor.movedTo === undefined
  return same ? null : next
}

/**
 * Слияние одноимённых категорий и перенос от надгробий (Р-29).
 *
 * Живые категории с одним названием — регистр и пробелы по краям не
 * различаются — сливаются в одну: остаётся `survivorOf`, название, признак,
 * порядок, архив и группа берутся у поздней правки, остальные уходят надгробием
 * с `movedTo`. Одноимённые заводятся только встречными правками на двух
 * устройствах: форма занятое название не пропускает.
 *
 * Блоки и кнопки, чья категория — надгробие с `movedTo`, переходят по
 * цепочке туда, куда оно указывает. Так доезжает блок, записанный на другом
 * устройстве раньше, чем туда пришло слияние или удаление с переносом (Р-22).
 * Кольцо в цепочке или конец не у живой категории — не трогаем: блок
 * остаётся под именем надгробия, как до этого решения.
 *
 * Считается одинаково на всех устройствах: увидев одно и то же, два
 * устройства пишут одно и то же. Делать нечего — план пуст.
 */
export function reconcilePlan(
  categories: readonly Category[],
  presets: readonly Preset[],
  blocks: readonly TimeBlock[],
): ReconcilePlan {
  const plan: ReconcilePlan = { categories: [], presets: [], blocks: [] }

  // Куда уходит категория: надгробие — по `movedTo`, слитая — в оставшуюся.
  const next = new Map<string, string>()
  for (const category of categories) {
    if (category.deleted && category.movedTo) next.set(category.id, category.movedTo)
  }

  const groups = new Map<string, Category[]>()
  for (const category of categories) {
    const key = normName(category.name)
    if (category.deleted || !key) continue
    groups.set(key, [...(groups.get(key) ?? []), category])
  }

  for (const [key, group] of groups) {
    if (group.length < 2) continue
    const survivor = survivorOf(group, key)
    const updated = withContent(survivor, latestOf(group))
    if (updated) plan.categories.push(updated)
    for (const each of group) {
      if (each.id === survivor.id) continue
      plan.categories.push({ ...each, deleted: true, movedTo: survivor.id })
      next.set(each.id, survivor.id)
    }
  }

  const live = new Set(categories.filter((each) => !each.deleted && !next.has(each.id)).map((each) => each.id))

  /** Конец цепочки переносов, если он у живой категории. Иначе null. */
  function destination(id: string): string | null {
    const seen = new Set<string>()
    let current = id
    while (next.has(current)) {
      if (seen.has(current)) return null
      seen.add(current)
      current = next.get(current) as string
    }
    return current !== id && live.has(current) ? current : null
  }

  for (const block of blocks) {
    if (block.deleted) continue
    const main = destination(block.categoryId) ?? block.categoryId
    const bg = block.bgCategoryId === undefined ? undefined : (destination(block.bgCategoryId) ?? block.bgCategoryId)
    if (main === block.categoryId && bg === block.bgCategoryId) continue

    const moved: TimeBlock = { ...block, categoryId: main }
    // Один и тот же час дважды не пишется — как при удалении с переносом.
    if (bg === undefined || bg === main) delete moved.bgCategoryId
    else moved.bgCategoryId = bg
    plan.blocks.push(moved)
  }

  // Кнопка переезжает к оставшейся; такие минуты у неё уже есть — просто уходит.
  const livePresets = new Set(presets.filter((each) => !each.deleted).map((each) => each.id))
  for (const preset of presets) {
    if (preset.deleted) continue
    const to = destination(preset.categoryId)
    if (to === null) continue

    plan.presets.push({ ...preset, deleted: true })
    livePresets.delete(preset.id)
    const id = presetIdFor(to, preset.minutes)
    if (livePresets.has(id)) continue
    plan.presets.push({ ...createPreset(to, preset.minutes), order: preset.order })
    livePresets.add(id)
  }

  return plan
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
    ...(each.group ? { group: each.group } : {}),
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
