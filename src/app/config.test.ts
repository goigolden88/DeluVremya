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

function data(parts: Partial<{ [S in SyncedStore]: StoreRecord[S][] }>): { [S in SyncedStore]: StoreRecord[S][] } {
  return {
    categories: [],
    presets: [],
    templates: [],
    notes: [],
    time: [],
    reviews: [],
    specials: [],
    ...parts,
  }
}

/** Записи всех видов версии 1 — так лежат на телефоне до обновления. */
function v1Records(): Partial<{ [S in SyncedStore]: StoreRecord[S][] }> {
  return {
    categories: [{ id: 'cat:Чтение', updatedAt: AT, name: 'Чтение', order: 1, kind: 'useful', norm: { minDays: 3 } }],
    presets: [{ id: 'p1', updatedAt: AT, categoryId: 'cat:Чтение', minutes: 30, order: 1 }],
    templates: [{ id: 'tpl1', updatedAt: AT, name: 'Рабочий', items: [{ title: 'Почта', estMin: 20 }], order: 1 }],
    notes: [note('n1', '2026-09-10'), { ...note('n2', null), deleted: true }],
    time: [block('t1', '2026-09-11')],
    reviews: [{ id: 'review:2026-09-07', updatedAt: AT, weekStart: '2026-09-07', doneAt: AT }],
  }
}

const V1_STORES = ['categories', 'presets', 'templates', 'notes', 'time', 'reviews'] as const

describe('данные не трогаются переводом', () => {
  it('база называется deluvremya — на общем origin только имя разводит приложения семьи', () => {
    expect(config.dbName).toBe('deluvremya')
  })

  it('шесть хранилищ версии 1 — в замороженной раскладке; особые дни — после них, не в ней', () => {
    expect([...config.stores]).toEqual([...V1_STORES, 'specials'])
    expect([...config.v1Stores]).toEqual([...V1_STORES])
    expect([...SYNCED_STORES]).toEqual([...config.stores])
  })

  it('формат импорта прежний', () => {
    expect(config.importFormat).toBe('deluvremya-import')
  })
})

describe('схема базы', () => {
  it('свежая база доезжает до версии 2 теми же шагами: все хранилища; индексы сверх updatedAt — прежние', async () => {
    await db.ready()
    await db.close()
    const raw = await openRaw()
    try {
      expect(raw.version).toBe(2)
      for (const store of [...SYNCED_STORES, ...LOCAL_STORES]) expect(raw.objectStoreNames.contains(store)).toBe(true)
      const tx = raw.transaction([...SYNCED_STORES], 'readonly')
      const indexes = (store: SyncedStore) => [...tx.objectStore(store).indexNames].sort()
      expect(indexes('notes')).toEqual(['capturedOn', 'plannedFor', 'updatedAt'])
      expect(indexes('time')).toEqual(['date', 'updatedAt'])
      expect(indexes('reviews')).toEqual(['updatedAt', 'weekStart'])
      for (const store of ['categories', 'presets', 'templates', 'specials'] as const) {
        expect(indexes(store)).toEqual(['updatedAt'])
      }
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

describe('миграция на версию 2 — особые дни (Р-91)', () => {
  it('один шаг: на версию 2, только добавляет', () => {
    expect(SCHEMA_VERSION).toBe(2)
    expect(config.schemaVersion).toBe(2)
    expect(config.migrations.map((step) => ({ to: step.to, additive: step.additive }))).toEqual([
      { to: 2, additive: true },
    ])
  })

  it('база версии 1 с записями всех видов открывается на версии 2: записи на месте, хранилище specials есть', async () => {
    const records = v1Records()
    await legacyBase(records)

    await db.ready()
    await db.close()
    const raw = await openRaw()
    try {
      expect(raw.version).toBe(2)
      expect(raw.objectStoreNames.contains('specials')).toBe(true)
      const indexes = [...raw.transaction('specials', 'readonly').objectStore('specials').indexNames]
      expect(indexes).toEqual(['updatedAt'])
    } finally {
      raw.close()
    }

    // Каждая запись — как лежала, с надгробиями: без них второе устройство воскресит удалённое.
    for (const store of V1_STORES) {
      expect(await db.getAll(store, { includeDeleted: true })).toEqual(records[store])
    }
    expect(await db.getAll('specials')).toEqual([])
    expect(await db.meta.get('schemaVersion')).toBe(2)
    expect(await db.settings.get('syncRepo')).toBe('me/DeluVremyaData')
    expect(await db.listDirty()).toEqual([{ store: 'time', id: 't1', at: AT }])

    // В новое хранилище пишется и читается.
    await db.put('specials', { id: 's1', updatedAt: AT, from: '2026-10-05', to: '2026-10-07', title: 'Поездка' })
    expect(await db.get('specials', 's1')).toMatchObject({ from: '2026-10-05', to: '2026-10-07', title: 'Поездка' })
  })

  it('та же база версии 1 путём ядра — тем же шагом доезжает до версии 2', async () => {
    const records = v1Records()
    expect(await db.createLegacyBase(1, records)).toEqual([])
    await db.ready()
    for (const store of V1_STORES) {
      expect(await db.getAll(store, { includeDeleted: true })).toEqual(records[store])
    }
    expect(await db.getAll('specials')).toEqual([])
  })

  it('слепок версии 1 принимается: особых дней в нём нет — хранилище пустое', async () => {
    const snapshot = db.parseSnapshot(
      JSON.stringify({ schemaVersion: 1, exportedAt: AT, data: { notes: [note('n1', '2026-09-10')] } }),
    )
    expect(snapshot.data.specials).toEqual([])
    expect(() => db.checkSnapshotVersion(1)).not.toThrow()
    expect(await db.importAll(snapshot)).toBe(1)
    expect(await db.get('notes', 'n1')).toMatchObject({ text: 'Мысль' })
  })

  it('слепок версии 2 с особыми днями — туда и обратно', async () => {
    await db.put('specials', { id: 's1', updatedAt: AT, from: '2026-10-05', to: '2026-10-07' })
    const snapshot = await db.exportAll()
    expect(snapshot.schemaVersion).toBe(2)
    expect(snapshot.data.specials).toMatchObject([{ id: 's1', from: '2026-10-05', to: '2026-10-07' }])
  })
})

describe('раскладка репозитория данных', () => {
  it('справочники, обзоры и особые дни — одним файлом, заметки и учёт — по месяцам', () => {
    const paths = layout
      .buildFiles(data({ notes: [note('a', '2026-01-31')], time: [block('b', '2026-02-01')] }))
      .map((file) => file.path)
    expect(paths).toEqual([
      'categories.json',
      'meta.json',
      'notes/2026-01.json',
      'presets.json',
      'reviews.json',
      'specials.json',
      'templates.json',
      'time/2026-02.json',
    ])
  })

  it('особые дни уезжают в specials.json; meta.json — версия 2', () => {
    const trip = { id: 's1', updatedAt: AT, from: '2026-10-05', to: '2026-10-07', title: 'Поездка в Казань' }
    const files = layout.buildFiles(data({ specials: [trip] }))
    expect(files.find((file) => file.path === 'specials.json')?.content).toContain('Поездка в Казань')
    expect(JSON.parse(files.find((file) => file.path === 'meta.json')?.content ?? '{}')).toEqual({
      app: 'deluvremya',
      schemaVersion: 2,
    })
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
      'specials.json',
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

const LEGACY_INDEXES: Record<(typeof V1_STORES)[number], readonly string[]> = {
  categories: [],
  presets: [],
  templates: [],
  notes: ['capturedOn', 'plannedFor'],
  time: ['date'],
  reviews: ['weekStart'],
}

function legacyBase(records: Partial<{ [S in SyncedStore]: StoreRecord[S][] }>): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('deluvremya', 1)
    request.onupgradeneeded = () => {
      const database = request.result
      for (const store of V1_STORES) {
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
      const tx = database.transaction([...V1_STORES, 'meta', 'settings', 'dirty'], 'readwrite')
      for (const store of V1_STORES) {
        for (const record of records[store] ?? []) tx.objectStore(store).put(record)
      }
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
