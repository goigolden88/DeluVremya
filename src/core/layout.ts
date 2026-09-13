/**
 * Раскладка записей по файлам репозитория данных.
 *
 * Здесь нет ни сети, ни базы: на входе записи, на выходе строки. Всё, что
 * можно проверить тестами в синхронизации, живёт в этом файле.
 *
 * Почему раскладка здесь, а не в `db` (Р-18): если хранилище знает про
 * `cycles/2026.json`, оно знает про способ хранения на сервере, и замена
 * GitHub задела бы базу, а не только синхронизацию.
 *
 * Почему раскладка здесь, а не в модулях: тогда `sync` знал бы про модули,
 * а это запрещено жёстче. Цена — новый модуль дописывает строку в `PLACES`
 * ниже; шаг внесён в чеклист «Как добавить модуль» в 02-Архитектура.
 *
 * Нарезка нужна git и сети, а не человеку: без неё каждая отметка
 * переписывала бы всю базу и раздувала историю коммитов (Р-08 «Дневников»).
 * По месяцам, а не по годам, как у них, — Р-28 «Делу Время»: годовой файл
 * блоков к декабрю отправлялся бы по полмегабайта на каждое нажатие.
 */

import { isDateOrMonth } from './dates.ts'
import { SCHEMA_VERSION, SYNCED_STORES } from './model.ts'
import type { AnyRecord, StoreRecord, SyncedStore } from './model.ts'

export type RepoFile = {
  path: string
  content: string
}

/** Где лежит хранилище: одним файлом или нарезанное по месяцам. */
type Place<S extends SyncedStore> =
  | { split: 'none'; path: string }
  | {
      split: 'month'
      dir: string
      /** Дата, по которой запись попадает в месяц. null — даты нет (Р-34). */
      dateOf: (record: StoreRecord[S]) => string | null
    }

/**
 * Раскладка из 02-Архитектура, «Раскладка данных в репозитории».
 * Новый модуль дописывает сюда строку.
 */
const PLACES: { [S in SyncedStore]: Place<S> } = {
  categories: { split: 'none', path: 'categories.json' },
  presets: { split: 'none', path: 'presets.json' },
  templates: { split: 'none', path: 'templates.json' },
  // Месяц — по дате записи, а не по дню в плане: мысль, записанная в марте
  // и поднятая в план в июне, остаётся мартовской. Без даты — undated (Р-08).
  notes: { split: 'month', dir: 'notes', dateOf: (note) => note.capturedOn },
  time: { split: 'month', dir: 'time', dateOf: (block) => block.date },
  reviews: { split: 'none', path: 'reviews.json' },
}

/** Версия схемы лежит отдельным файлом — по ней проверяется совместимость. */
export const META_PATH = 'meta.json'

/**
 * Куда попадают записи без года (Р-34).
 *
 * Заведено ради списка «к просмотру»: у записи `planned` даты начала нет
 * вовсе, а нарезка её требует. Месяц по времени создания не годится —
 * такого поля в модели нет, а выводить его из `id` нельзя: у перенесённых
 * из Obsidian записей идентификаторы детерминированные, не ULID.
 *
 * Сюда же падает запись с испорченной датой. Это лучше, чем потерять её
 * молча: файл на месте, запись видна, дату можно поправить руками.
 */
const UNDATED = 'undated'

// ─── Канонический вид ──────────────────────────────────────────────────────

/**
 * Одинаковые данные обязаны давать побайтово одинаковый файл.
 *
 * Иначе отпечаток каждый раз новый, и каждая синхронизация переписывает весь
 * репозиторий — ровно то, ради чего заведена нарезка (Р-33).
 * Порядок ключей в объекте зависит от того, как запись собиралась: пришла ли
 * она из формы, из переноса или с сервера. Поэтому ключи сортируются, а
 * записи выстраиваются по `id`.
 *
 * Массивы не трогаются: порядок симптомов и ссылок — это данные.
 */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (typeof value !== 'object' || value === null) return value

  const source = value as Record<string, unknown>
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(source).sort()) sorted[key] = sortKeys(source[key])
  return sorted
}

/** Записи → текст файла. Перевод строки в конце — файл должен быть текстовым. */
export function canonical(records: readonly AnyRecord[]): string {
  const ordered = [...records].sort((a, b) => a.id.localeCompare(b.id))
  return `${JSON.stringify(ordered.map(sortKeys), null, 2)}\n`
}

export function metaFile(schemaVersion: number = SCHEMA_VERSION): RepoFile {
  return { path: META_PATH, content: `${JSON.stringify({ schemaVersion }, null, 2)}\n` }
}

// ─── Записи → файлы ────────────────────────────────────────────────────────

function pathFor<S extends SyncedStore>(store: S, record: StoreRecord[S]): string {
  const place = PLACES[store] as Place<S>
  if (place.split === 'none') return place.path

  const date = place.dateOf(record)
  const month = date === null ? null : monthOf(date)
  return `${place.dir}/${month ?? UNDATED}.json`
}

/** `2026-02-14` → `2026-02`. Не дата — null: запись уедет в undated. */
function monthOf(date: string): string | null {
  return isDateOrMonth(date) ? date.slice(0, 7) : null
}

/** Имя файла месяца: `2026-02`. Месяц тринадцатый — файл не наш. */
const MONTH_FILE = '\\d{4}-(?:0[1-9]|1[0-2])'

/** Все файлы, которые хранилище занимает при таком наборе записей. */
function filesFor<S extends SyncedStore>(
  store: S,
  records: readonly StoreRecord[S][],
): RepoFile[] {
  const byPath = new Map<string, StoreRecord[S][]>()

  // Хранилище без нарезки существует всегда, даже пустым: так раскладка
  // репозитория видна глазами, а не выводится из того, что успело появиться.
  const place = PLACES[store] as Place<S>
  if (place.split === 'none') byPath.set(place.path, [])

  for (const record of records) {
    const path = pathFor(store, record)
    const bucket = byPath.get(path)
    if (bucket) bucket.push(record)
    else byPath.set(path, [record])
  }

  return [...byPath].map(([path, bucket]) => ({ path, content: canonical(bucket) }))
}

/**
 * Полное дерево файлов по содержимому базы.
 *
 * Собирается целиком, а не по списку изменённых записей (Р-33): у отметки
 * может смениться дата, а с ней месяц — по пометке «запись такая-то изменилась»
 * старый файл не найти. Отправлены будут только те файлы, чей отпечаток
 * разошёлся с деревом на сервере, так что прошлые месяцы не переписываются.
 *
 * `merged` — пути, чьё содержимое уже влито в базу на этом же проходе. Если
 * месяц опустел (последняя запись переехала в другой), его файл перезаписывается
 * пустым списком; без этого на сервере навсегда осталась бы копия записи.
 * Пути, которые не читались, сюда передавать нельзя — затрём чужие данные.
 */
export function buildFiles(
  data: { [S in SyncedStore]: readonly StoreRecord[S][] },
  options: { schemaVersion?: number; merged?: readonly string[] } = {},
): RepoFile[] {
  const files: RepoFile[] = [metaFile(options.schemaVersion)]

  for (const store of SYNCED_STORES) {
    files.push(...filesFor(store, data[store]))
  }

  const produced = new Set(files.map((file) => file.path))
  const empty = `${JSON.stringify([], null, 2)}\n`
  for (const path of options.merged ?? []) {
    if (!produced.has(path) && storeOf(path) !== null) {
      files.push({ path, content: empty })
    }
  }

  return files.sort((a, b) => a.path.localeCompare(b.path))
}

// ─── Файлы → записи ────────────────────────────────────────────────────────

/**
 * Какому хранилищу принадлежит путь. null — файл не наш: README, .gitignore,
 * что угодно ещё, что человек положит в репозиторий руками. Такие не трогаем.
 */
export function storeOf(path: string): SyncedStore | null {
  for (const store of SYNCED_STORES) {
    const place = PLACES[store] as Place<SyncedStore>
    if (place.split === 'none') {
      if (place.path === path) return store
    } else if (new RegExp(`^${place.dir}/(?:${MONTH_FILE}|${UNDATED})\\.json$`).test(path)) {
      return store
    }
  }
  return null
}

/**
 * Разбор файла, пришедшего с сервера.
 *
 * Проверяется только то, на чём держится слияние: массив, у каждой записи
 * есть `id` и `updatedAt`. Глубже не лезем — тот же уровень доверия, что
 * у `db.parseSnapshot`, и та же причина: сломанный файл лучше отвергнуть
 * целиком, чем влить половину.
 */
export function parseFile(path: string, text: string): AnyRecord[] {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error(`Файл ${path} в репозитории — не JSON`)
  }
  if (!Array.isArray(value)) throw new Error(`Файл ${path} в репозитории — не список записей`)

  for (const record of value) {
    const id = (record as Partial<AnyRecord> | null)?.id
    const updatedAt = (record as Partial<AnyRecord> | null)?.updatedAt
    if (typeof id !== 'string' || !id || typeof updatedAt !== 'string' || !updatedAt) {
      throw new Error(`В файле ${path} запись без id или updatedAt`)
    }
  }

  return value as AnyRecord[]
}

/** Версия схемы из `meta.json`. Файла нет — репозиторий пуст, версия наша. */
export function parseMeta(text: string): number {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('Файл meta.json в репозитории — не JSON')
  }
  const version = (value as { schemaVersion?: unknown } | null)?.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new Error('В meta.json нет версии схемы. Это не репозиторий «Делу Время»')
  }
  return version
}
