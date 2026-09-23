/**
 * Модель данных.
 *
 * Источник истины — docs/02-Архитектура.md, раздел «Модель данных».
 * Имена полей и опциональность взяты оттуда дословно. Если модель меняется,
 * сначала правится документ, потом этот файл, а не наоборот.
 *
 * Приложение целиком — типы записей, хранилища, версия схемы и миграции
 * (Р-83). Договор семьи — `Base`, `Migration` и механика миграций — в ядре,
 * `shared/core/model.ts`; ядро получает всё это конфигом из `app/config.ts`.
 */

import type { Base, Migration } from '../shared/core/model.ts'

/**
 * Версия схемы. Растёт с каждым шагом в `migrations` — и с добавлением
 * хранилища тоже: IndexedDB заводит хранилище только при смене версии.
 */
export const SCHEMA_VERSION = 1

// ─── Справочники ───────────────────────────────────────────────────────────

/** Категория учёта времени: Зарядка, Шахматы, Чтение, Ютуб, Прогулка, Прочее… */
export type Category = Base & {
  name: string
  /** порядок на экране дня и в сводках */
  order: number
  /** признак для обзора недели, не для дневного экрана (Р-05) */
  kind: 'useful' | 'neutral' | 'idle'
  archived?: boolean
  /** группа: кнопки и строки итогов по группам (Р-81) */
  group?: string
  /** у надгробия: куда перенесены её блоки (Р-22, Р-29) */
  movedTo?: string
  /** норма недели (Р-45); все правила необязательны */
  norm?: {
    /** дней с блоком — не меньше */
    minDays?: number
    /** минут — не меньше */
    minMinutes?: number
    /** минут — не больше */
    maxMinutes?: number
    /** YYYY-MM-DD, с какого дня считается история (Р-53, Р-56) */
    since?: string
  }
}

/** Пресет — кнопка «Чтение +30». Заводится с экрана категории. */
export type Preset = Base & {
  categoryId: string
  minutes: number
  order: number
}

/** Шаблон дня: «рабочий», «выходной». Порождает записи плана на конкретный день. */
export type DayTemplate = Base & {
  name: string
  items: { title: string; estMin?: number; main?: boolean }[]
  order: number
}

// ─── Записи ────────────────────────────────────────────────────────────────

/** Одна сущность на входящее, дело, наблюдение, замысел и пункт плана дня (Р-12, Р-31). */
export type Note = Base & {
  text: string
  /** Не выбран при захвате — 'task' (Р-13). */
  kind: NoteKind
  /** YYYY-MM-DD, когда записана; null → дата неизвестна (Р-08) */
  capturedOn: string | null
  /** YYYY-MM-DD, на какой день поставлена; null → лежит во входящих */
  plannedFor: string | null
  /** главное дело того дня, на который поставлена */
  main?: boolean
  /** место пункта в своём дне; нет — после упорядоченных, по id (Р-75) */
  order?: number
  /** оценка длительности, для реализма плана */
  estMin?: number
  status: NoteStatus
  /** YYYY-MM-DD, когда выполнено */
  doneOn?: string
  /** Связи с другими записями: `note:<id>` — замысел, к которому относится дело (Р-31). */
  refs?: string[]
}

/** Дело, мысль (она же наблюдение), замысел (Р-31). */
export type NoteKind = 'task' | 'thought' | 'goal'
export type NoteStatus = 'open' | 'done' | 'someday' | 'dropped'

/** Блок учтённого времени. */
export type TimeBlock = Base & {
  /** YYYY-MM-DD, дата события, не дата ввода */
  date: string
  categoryId: string
  minutes: number
  /** фоновая активность: покер под ютуб */
  bgCategoryId?: string
  note?: string
  refs?: string[]
}

/** Проведённый обзор недели. */
export type Review = Base & {
  /** YYYY-MM-DD, понедельник недели */
  weekStart: string
  /** ISO 8601, когда обзор провели */
  doneAt: string
  note?: string
  refs?: string[]
}

/** Вид записи. Три значения — ровно то, что описано выше. */
export type RecordKind = 'note' | 'time' | 'review'

// ─── Хранилища ─────────────────────────────────────────────────────────────

/**
 * Хранилища, которые уезжают в синхронизацию. Имена совпадают с раскладкой
 * в репозитории данных (02-Архитектура, «Локальное хранилище»).
 * Менять имена нельзя — они в базе на устройстве. Порядок — тот, в котором
 * пишут импорт и слепок: справочники раньше записей, что на них ссылаются.
 * Локальные `meta`, `settings`, `dirty` — ядра, одинаковы у всей семьи.
 */
export const SYNCED_STORES = ['categories', 'presets', 'templates', 'notes', 'time', 'reviews'] as const

export type SyncedStore = (typeof SYNCED_STORES)[number]

/**
 * Что лежит в каком хранилище. Позволяет db.get('notes') возвращать Note;
 * это и есть таблица `R` для `AppConfig<R>` ядра.
 */
export type StoreRecord = {
  categories: Category
  presets: Preset
  templates: DayTemplate
  notes: Note
  time: TimeBlock
  reviews: Review
}

/** Любая синхронизируемая запись. */
export type AnyRecord = StoreRecord[SyncedStore]

/**
 * Где лежат записи человека — по ним первый запуск отличается от установленной
 * копии. Справочники не в счёт: категории заводятся сами при первом запуске
 * (Этап 1), пресеты и шаблоны дня — только вслед за записями.
 */
export const OWN_STORES = ['notes', 'time', 'reviews'] as const satisfies readonly SyncedStore[]

// ─── Миграции ──────────────────────────────────────────────────────────────

/**
 * Шаги схемы. Реестр заведён пустым с первого дня: на версии 1 мигрировать
 * нечего. Шаг сам создаёт своё хранилище и его индексы — `v1Stores`
 * в `app/config.ts` после первого релиза заморожен. Что такое шаг и как он
 * применяется — `Migration` ядра.
 */
export const migrations: Migration[] = []
