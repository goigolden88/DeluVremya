import { useEffect, useState } from 'react'
import { db } from '../../core/db.ts'
import type { Category, Preset } from '../../core/model.ts'
import { initialCategories, initialPresets, reconcilePlan } from './categories.ts'
import { STARTER } from './starter.ts'

export type Catalog = {
  status: 'loading' | 'ready' | 'failed'
  error: string
  /** Все категории, с надгробиями: по ним видно, какие id заняты. */
  categories: Category[]
  /** Все кнопки, с надгробиями — по той же причине. */
  presets: Preset[]
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/**
 * Стартовый набор — когда хранилище пусто совсем. Надгробия считаются:
 * убрать всё до одной — не повод заводить набор заново.
 *
 * Слиянием с неподвижным штампом, а не записью: если соседнее устройство
 * уже переименовало категорию, при встрече победит переименование. Как
 * пришедшее из файла — запись уедет в синхронизацию, `updatedAt` останется
 * штампом.
 */
async function seed(): Promise<void> {
  if ((await db.count('categories', { includeDeleted: true })) === 0) {
    await db.merge('categories', initialCategories(STARTER), 'imported')
  }
  if ((await db.count('presets', { includeDeleted: true })) === 0) {
    await db.merge('presets', initialPresets(STARTER), 'imported')
  }
}

/**
 * Категории и кнопки из базы. При первом запуске заводит стартовый набор.
 * Перечитывается на любую запись в них — своей рукой или приехавшую
 * синхронизацией.
 */
export function useCatalog(): Catalog {
  const [state, setState] = useState<Catalog>({ status: 'loading', error: '', categories: [], presets: [] })

  useEffect(() => {
    let alive = true

    async function load() {
      try {
        await seed()
        const [categories, presets] = await Promise.all([
          db.getAll('categories', { includeDeleted: true }),
          db.getAll('presets', { includeDeleted: true }),
        ])
        if (alive) setState({ status: 'ready', error: '', categories, presets })
      } catch (failure) {
        if (alive) setState((previous) => ({ ...previous, status: 'failed', error: describe(failure) }))
      }
    }

    void load()
    const off = db.onChange((event) => {
      if (event.store === 'categories' || event.store === 'presets') void load()
    })
    return () => {
      alive = false
      off()
    }
  }, [])

  return state
}

/**
 * Сколько ждать тишины после прихода данных. Проход синхронизации вливает
 * хранилища по очереди, а считать слияние надо по всем сразу.
 */
const MERGE_DELAY_MS = 1000

/**
 * Слияние одноимённых категорий и перенос от надгробий (Р-29) — после
 * прихода данных с сервера или из файла-копии. Своя правка дубля не заведёт:
 * занятое название форма не пропускает.
 *
 * Один на приложение, запускается из `app.tsx`, а не из экранов: иначе
 * каждый открытый экран писал бы то же самое. Возвращает отписку.
 */
export function watchCategoryMerges(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let running: Promise<void> | null = null

  async function run(): Promise<void> {
    const [categories, presets, blocks] = await Promise.all([
      db.getAll('categories', { includeDeleted: true }),
      db.getAll('presets', { includeDeleted: true }),
      db.getAll('time'),
    ])
    const plan = reconcilePlan(categories, presets, blocks)
    // Сначала блоки, категории последними: оборвись запись посередине —
    // блоки уже у оставшейся, а слияние доделает следующий запуск.
    await db.putMany('time', plan.blocks)
    await db.putMany('presets', plan.presets)
    await db.putMany('categories', plan.categories)
  }

  function schedule(): void {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      if (running) {
        schedule()
        return
      }
      // Ошибку сообщить некому: запуск фоновый. Следующий приход данных
      // попробует снова.
      running = run()
        .catch(() => undefined)
        .finally(() => {
          running = null
        })
    }, MERGE_DELAY_MS)
  }

  const off = db.onChange((event) => {
    // Своя запись — в том числе запись самого слияния — повода не даёт.
    if (event.origin === 'local') return
    if (event.store === 'categories' || event.store === 'presets' || event.store === 'time') schedule()
  })

  // Приехавшее до прошлого закрытия приложения.
  schedule()

  return () => {
    off()
    if (timer) clearTimeout(timer)
    timer = null
  }
}
