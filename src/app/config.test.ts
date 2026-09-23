import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDb } from '../shared/core/db.ts'
import { createImporting } from '../shared/core/importing.ts'
import { createLayout } from '../shared/core/layout.ts'
import { LOCAL_STORES } from '../shared/core/model.ts'
import { config } from './config.ts'
import { SCHEMA_VERSION, SYNCED_STORES, type Note, type StoreRecord, type SyncedStore, type TimeBlock } from './model.ts'

/**
 * Конфиг «Делу Время» для ядра (Р-83, Р-84).
 *
 * Механику ядра проверяют его тесты на подставной «Полке», в CI ядра. Здесь —
 * своё: то, что до перевода проверялось тестами `core/*` на хранилищах
 * «Делу Время» и что лежит на устройствах и в `DeluVremyaData`, — имя базы,
 * хранилища, индексы, раскладка, промпт. И главное для перевода: база,
 * заведённая прежним кодом, открывается ядром с прежними записями (Р-83).
 */

const db = createDb(config)
const layout = createLayout(config)
const importing = createImporting(config)

const AT = '2026-09-09T10:00:00.000Z'

beforeEach(async () => {
  await db.close().catch(() => {})
  globalThis.indexedDB = new IDBFactory()
})

afterEach(async () => {
  await db.close().catch(() => {})
})

function note(id: string, capturedOn: string | null): Note {
  return { id, updatedAt: AT, text: 'Мысль', kind: 'thought', capturedOn, plannedFor: null, status: 'open' }
}

function block(id: string, date: string): TimeBlock {
  return { id, updatedAt: AT, date, categoryId: 'cat:Чтение', minutes: 30 }
}

function data(parts: { notes?: Note[]; time?: TimeBlock[] }): { [S in SyncedStore]: StoreRecord[S][] } {
  return { categories: [], presets: [], templates: [], notes: parts.notes ?? [], time: parts.time ?? [], reviews: [] }
}

describe('данные не трогаются переводом', () => {
  it('база называется deluvremya — на общем origin только имя разводит приложения семьи', () => {
    expect(config.dbName).toBe('deluvremya')
  })

  it('версия схемы 1, миграций нет', () => {
    expect(config.schemaVersion).toBe(1)
    expect(SCHEMA_VERSION).toBe(1)
    expect(config.migrations).toEqual([])
  })

  it('шесть хранилищ, все — в раскладке версии 1; импорт пишет справочники первыми', () => {
    expect([...config.stores]).toEqual(['categories', 'presets', 'templates', 'notes', 'time', 'reviews'])
    expect([...config.v1Stores]).toEqual([...SYNCED_STORES])
  })

  it('формат импорта прежний', () => {
    expect(config.importFormat).toBe('deluvremya-import')
  })
})

describe('схема базы', () => {
  it('заводит все хранилища; индексы сверх updatedAt — прежние', async () => {
    await db.ready()
    await db.close()
    const raw = await openRaw()
    try {
      expect(raw.version).toBe(1)
      for (const store of [...SYNCED_STORES, ...LOCAL_STORES]) expect(raw.objectStoreNames.contains(store)).toBe(true)
      const tx = raw.transaction([...SYNCED_STORES], 'readonly')
      const indexes = (store: SyncedStore) => [...tx.objectStore(store).indexNames].sort()
      expect(indexes('notes')).toEqual(['capturedOn', 'plannedFor', 'updatedAt'])
      expect(indexes('time')).toEqual(['date', 'updatedAt'])
      expect(indexes('reviews')).toEqual(['updatedAt', 'weekStart'])
      for (const store of ['categories', 'presets', 'templates'] as const) expect(indexes(store)).toEqual(['updatedAt'])
    } finally {
      raw.close()
    }
  })

  it('база, заведённая прежним кодом, открывается с записями, настройкой и очередью отправки', async () => {
    // Ровно так её заводил `createStores` в `core/db.ts` до перевода:
    // на телефоне лежит именно она, и переустанавливать приложение нельзя.
    await legacyBase({ notes: [note('n1', '2026-09-10')], time: [block('t1', '2026-09-11')] })

    await db.ready()
    expect(await db.get('notes', 'n1')).toMatchObject({ text: 'Мысль', capturedOn: '2026-09-10' })
    expect(await db.get('time', 't1')).toMatchObject({ minutes: 30 })
    expect(await db.settings.get('syncRepo')).toBe('me/DeluVremyaData')
    // Неотправленное до обновления уедет первым же проходом.
    expect(await db.listDirty()).toEqual([{ store: 'time', id: 't1', at: AT }])
  })
})

describe('раскладка репозитория данных', () => {
  it('справочники и обзоры — одним файлом, заметки и учёт — по месяцам', () => {
    const paths = layout
      .buildFiles(data({ notes: [note('a', '2026-01-31')], time: [block('b', '2026-02-01')] }))
      .map((file) => file.path)
    expect(paths).toEqual([
      'categories.json',
      'meta.json',
      'notes/2026-01.json',
      'presets.json',
      'reviews.json',
      'templates.json',
      'time/2026-02.json',
    ])
  })

  it('заметка — по дню записи; без даты и с испорченной датой — в undated, не пропадает (Р-08)', () => {
    const paths = layout
      .buildFiles(data({ notes: [note('a', null), note('b', '2026-02-30')], time: [block('c', 'вчера')] }))
      .map((file) => file.path)
    expect(paths).toContain('notes/undated.json')
    expect(paths).toContain('time/undated.json')
  })

  it('README называет каждый файл раскладки', () => {
    const text = layout.readmeFile().content
    for (const path of [
      'categories.json',
      'presets.json',
      'templates.json',
      'notes/ГГГГ-ММ.json',
      'time/ГГГГ-ММ.json',
      'reviews.json',
    ]) {
      expect(text).toContain(`\`${path}\``)
    }
    expect(text).toContain('учёт времени, план дня, заметки и обзоры недели')
  })
})

describe('промпт импорта', () => {
  it('свои правила — первыми, общие ядра — следом, нумерация сплошная', () => {
    const prompt = importing.buildPrompt([], '2026-09-24')
    expect(prompt).toContain('приложение «Делу Время»')
    expect(prompt).toContain('таблицы учёта времени, заметки или скриншоты из других сервисов')
    expect(prompt).toContain('2. Даты — ГГГГ-ММ-ДД.')
    expect(prompt).toContain('пиши ГГГГ-ММ, без выдуманного числа')
    expect(prompt).toContain('3. Время — в минутах')
    expect(prompt).toContain('5. Разделы, для которых данных нет, не пиши.')
    expect(prompt).toContain('7. После JSON')
  })
})

function openRaw(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('deluvremya')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

const LEGACY_INDEXES: Record<SyncedStore, readonly string[]> = {
  categories: [],
  presets: [],
  templates: [],
  notes: ['capturedOn', 'plannedFor'],
  time: ['date'],
  reviews: ['weekStart'],
}

function legacyBase(records: { notes: Note[]; time: TimeBlock[] }): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('deluvremya', 1)
    request.onupgradeneeded = () => {
      const database = request.result
      for (const store of ['categories', 'presets', 'templates', 'notes', 'time', 'reviews'] as const) {
        const created = database.createObjectStore(store, { keyPath: 'id' })
        created.createIndex('updatedAt', 'updatedAt')
        for (const field of LEGACY_INDEXES[store]) created.createIndex(field, field)
      }
      database.createObjectStore('meta', { keyPath: 'key' })
      database.createObjectStore('settings', { keyPath: 'key' })
      database.createObjectStore('dirty', { keyPath: ['store', 'id'] })
    }
    request.onsuccess = () => {
      const database = request.result
      const tx = database.transaction(['notes', 'time', 'meta', 'settings', 'dirty'], 'readwrite')
      for (const record of records.notes) tx.objectStore('notes').put(record)
      for (const record of records.time) tx.objectStore('time').put(record)
      tx.objectStore('meta').put({ key: 'schemaVersion', value: 1 })
      tx.objectStore('settings').put({ key: 'syncRepo', value: 'me/DeluVremyaData' })
      tx.objectStore('dirty').put({ store: 'time', id: 't1', at: AT })
      tx.oncomplete = () => {
        database.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    }
    request.onerror = () => reject(request.error)
  })
}
