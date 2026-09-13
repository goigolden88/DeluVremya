/**
 * Реестр видов записей (02-Архитектура, «Реестр видов записей»).
 *
 * Таблица, а не механизм: на каждый вид записи — подпись и, где есть,
 * раздел импорта. Сами функции живут в модулях, здесь они только сведены.
 * Тип `{ [K in RecordKind]: … }` проверяется компилятором на полноту —
 * новый вид в модели не соберётся, пока здесь нет его строки.
 *
 * Растёт по этапам (Р-23): строки ленты и markdown добавятся в Этапе 6
 * вместе с `core/feed.ts`. Импорт заметок — Этап 3.
 *
 * Чего здесь нет намеренно: маршрутов, вкладок и блоков «Сегодня» —
 * это продуктовые решения, из списка они не выводятся.
 *
 * Одно из немногих мест, которые знают все модули разом, — вместе
 * с `app.tsx`, `notify.ts` и `screens/`. Модули друг про друга не знают.
 */

import type { Snapshot } from './core/db.ts'
import type { DateStr } from './core/dates.ts'
import {
  buildPrompt,
  mergeResults,
  readImportFile,
  type ImportContext,
  type ImportPlan,
  type ImportSpec,
} from './core/importing.ts'
import type { RecordKind } from './core/model.ts'
import { importTime, timeImportSpec } from './modules/time/import.ts'

/**
 * Все синхронизируемые хранилища, вместе с надгробиями. Надгробия нужны
 * справочникам: по ним видно, какие id заняты.
 */
export type Data = Snapshot['data']

type ImportEntry = { spec: ImportSpec; run: (raw: unknown, data: Data, ctx: ImportContext) => ImportPlan }

type KindEntry = {
  /** Подпись вида записи. */
  label: string
  /** Раздел импорта записей. Нет — вид не импортируется. */
  import?: ImportEntry
}

export const KINDS: { readonly [K in RecordKind]: KindEntry } = {
  note: { label: 'Входящие и план' },
  time: { label: 'Учёт времени', import: { spec: timeImportSpec, run: importTime } },
  review: { label: 'Обзоры недели' },
}

/** Порядок видов на экране, в промпте и в выгрузке — порядок строк таблицы. */
export const KIND_ORDER = Object.keys(KINDS) as RecordKind[]

/** Разделы импорта в порядке таблицы. */
function importEntries(): ImportEntry[] {
  return KIND_ORDER.flatMap((kind) => {
    const entry = KINDS[kind].import
    return entry ? [entry] : []
  })
}

/**
 * План импорта записей: что добавится, что уже есть, что не разобрано.
 * В базу не пишет — сначала сводка, запись только по кнопке.
 * Кидает, если файл не тот вовсе.
 */
export function planImport(text: string, data: Data, ctx: ImportContext): ImportPlan {
  const sections = readImportFile(text)
  const bySection = new Map(importEntries().map((entry) => [entry.spec.section, entry]))

  const results = Object.entries(sections).map(([section, raw]): ImportPlan => {
    const entry = bySection.get(section)
    if (entry) return entry.run(raw, data, ctx)
    return {
      writes: {},
      added: [],
      skipped: 0,
      issues: [{ section, title: `раздел «${section}»`, reason: 'такого раздела нет — пропущен целиком' }],
    }
  })
  return mergeResults(results)
}

/** Промпт для ИИ — из описаний всех разделов, в порядке таблицы. */
export function importPrompt(day: DateStr): string {
  return buildPrompt(
    importEntries().map((entry) => entry.spec),
    day,
  )
}
