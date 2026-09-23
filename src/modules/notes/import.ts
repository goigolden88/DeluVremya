/**
 * Раздел «notes» импорта записей (02-Архитектура, «Импорт записей»; Р-08):
 * старые мысли, дела и замыслы — заметки Obsidian, «Избранное» мессенджера,
 * блокнот.
 *
 * Чистая функция: сырой раздел и то, что уже есть в базе, на входе, записи
 * к добавлению — на выходе. Импорт только добавляет: заметка, совпавшая по
 * естественному ключу — текст и день записи, — пропускается. Всё
 * загруженное ложится открытым и не в план: дела и мысли — в неразобранное,
 * замыслы — в свой блок (Р-31).
 *
 * Дата необязательна. Заметка без даты видна в списке и в поиске, но в
 * возврат наблюдений не попадёт (Р-08). Дата, известная до месяца, не
 * принимается: первое число было бы выдумкой, а у заметки нет даты-месяца.
 */

import { isMonthStr, toDateStr } from '../../shared/core/dates.ts'
import {
  absent,
  dayOf,
  recordsOf,
  shown,
  textOf,
  type ImportContext,
  type ImportPlan,
  type ImportSpec,
} from '../../shared/core/importing.ts'
import type { Note, NoteKind, StoreRecord } from '../../app/model.ts'
import { DEFAULT_KIND, NOTE_KINDS } from './inbox.ts'
import { shortText } from './labels.ts'

const SECTION = 'notes'

export const notesImportSpec: ImportSpec = {
  section: SECTION,
  about:
    'заметки: мысли, дела и замыслы из других сервисов — Obsidian, «Избранное» мессенджера, блокнот. ' +
    'Одна запись — одна заметка.',
  fields: [
    '"text" — текст заметки целиком, обязательно; ссылки и переводы строк оставь как есть',
    '"kind" — вид: "task" — дело, конкретный шаг, который можно сделать; "thought" — мысль или наблюдение; ' +
      '"goal" — замысел, большая цель без конкретного шага: «выучить язык», «сменить работу». ' +
      'Не ясно — не писать: заметка станет делом',
    '"date" — когда записано, ГГГГ-ММ-ДД. Известен только месяц или дата неизвестна — не писать: ' +
      'заметка ляжет без даты, а выдуманное число хуже честного «без даты»',
  ],
  // Примеры выдуманные, а не чьи-то записи: промпт уезжает к любому,
  // кто открыл приложение.
  example: [
    { text: 'Заменить лампу в коридоре', date: '2026-02-03' },
    { text: 'Лучше думается на ходу, чем за столом', kind: 'thought', date: '2026-02-05' },
    { text: 'Научиться плавать кролем', kind: 'goal' },
  ],
}

/** Естественный ключ заметки (02-Архитектура): текст и день записи. */
function key(text: string, capturedOn: string | null): string {
  return `${capturedOn ?? ''}|${text}`
}

function kindOf(value: unknown): NoteKind | null {
  const text = textOf(value)?.toLowerCase()
  return NOTE_KINDS.find((kind) => kind === text) ?? null
}

export function importNotes(raw: unknown, data: { notes: readonly Note[] }, ctx: ImportContext): ImportPlan<StoreRecord> {
  const { records, issues } = recordsOf(SECTION, raw)
  const issue = (title: string, reason: string) => issues.push({ section: SECTION, title, reason })
  const today = toDateStr(new Date(ctx.now))

  const seen = new Set(data.notes.filter((note) => !note.deleted).map((note) => key(note.text, note.capturedOn)))
  const added: Note[] = []
  let skipped = 0

  for (const { raw: record, index } of records) {
    const text = textOf(record.text)
    if (text === null) {
      issue(
        `заметка ${index + 1}`,
        absent(record.text) ? 'нет текста ("text")' : `текст «${shown(record.text)}» — не строка`,
      )
      continue
    }
    const where = `«${shortText(text)}»`

    let kind = DEFAULT_KIND
    if (!absent(record.kind)) {
      const known = kindOf(record.kind)
      if (known === null) {
        issue(where, `вид «${shown(record.kind)}» — не "task", "thought" или "goal"`)
        continue
      }
      kind = known
    }

    let capturedOn: string | null = null
    if (!absent(record.date)) {
      const month = textOf(record.date)
      if (month !== null && isMonthStr(month)) {
        issue(where, `дата «${month}» — только месяц; не пиши её, и заметка ляжет без даты`)
        continue
      }
      const day = dayOf(record.date)
      if (day === null) {
        issue(where, `дата «${shown(record.date)}» — не ГГГГ-ММ-ДД`)
        continue
      }
      if (day > today) {
        issue(where, `дата ${day} ещё не наступила — заметка про то, что уже записано`)
        continue
      }
      capturedOn = day
    }

    const found = key(text, capturedOn)
    if (seen.has(found)) {
      skipped += 1
      continue
    }
    seen.add(found)

    added.push({
      id: ctx.newId(),
      updatedAt: ctx.now,
      text,
      kind,
      capturedOn,
      plannedFor: null,
      status: 'open',
    })
  }

  return {
    writes: { notes: added },
    added:
      added.length > 0
        ? [{ count: added.length, forms: ['заметка', 'заметки', 'заметок'] as [string, string, string] }]
        : [],
    skipped,
    issues,
  }
}
