/**
 * Раздел «time» импорта записей (02-Архитектура, «Импорт записей»; Р-08):
 * блоки времени из таблиц и дневников — февральская таблица учёта досуга
 * в первую очередь.
 *
 * Чистая функция: сырой раздел и то, что уже есть в базе, на входе, записи
 * к добавлению — на выходе. Импорт только добавляет: блок, совпавший по
 * естественному ключу — категория, день, минуты, — пропускается. Категория
 * ищется по названию без учёта регистра, архивная тоже; недостающая
 * заводится.
 */

import { toDateStr } from '../../core/dates.ts'
import {
  absent,
  dayOf,
  numberOf,
  recordsOf,
  shown,
  textOf,
  type ImportContext,
  type ImportPlan,
  type ImportSpec,
} from '../../core/importing.ts'
import type { Category, TimeBlock } from '../../core/model.ts'
import { createCategory, isMinutes, MINUTES_PER_DAY, sameName } from './categories.ts'
import { STARTER } from './starter.ts'

const SECTION = 'time'

export const timeImportSpec: ImportSpec = {
  section: SECTION,
  about:
    'учтённое время: на что и сколько минут ушло в конкретный день. Одна запись — одно занятие ' +
    'в один день; если в таблице за день стоит сумма по занятию — одна запись с этой суммой.',
  fields: [
    '"date" — день, ГГГГ-ММ-ДД, обязательно',
    `"category" — занятие, обязательно: ${STARTER.map((each) => each.name).join(', ')} или своё — недостающая категория заведётся`,
    `"minutes" — сколько минут, целым числом от одной до ${MINUTES_PER_DAY}, обязательно; часы переведи в минуты`,
    '"background" — что шло параллельно, если так и сказано: «покер под ютуб» — это category «Ютуб», ' +
      'background «Покер»; иначе не писать',
    '"note" — заметка к записи, если есть',
  ],
  // Примеры выдуманные, а не чьи-то записи: промпт уезжает к любому,
  // кто открыл приложение.
  example: [
    { date: '2026-02-03', category: 'Чтение', minutes: 45 },
    { date: '2026-02-03', category: 'Ютуб', minutes: 90, background: 'Покер' },
  ],
}

/** Естественный ключ блока (02-Архитектура): категория, день, минуты. */
function key(categoryId: string, date: string, minutes: number): string {
  return `${categoryId}|${date}|${minutes}`
}

export function importTime(
  raw: unknown,
  data: { categories: readonly Category[]; time: readonly TimeBlock[] },
  ctx: ImportContext,
): ImportPlan {
  const { records, issues } = recordsOf(SECTION, raw)
  const issue = (title: string, reason: string) => issues.push({ section: SECTION, title, reason })
  const today = toDateStr(new Date(ctx.now))

  // С надгробиями: по ним видно, какие id категорий заняты.
  const categories = [...data.categories]
  const newCats: Category[] = []
  const newBlocks: TimeBlock[] = []
  const seen = new Set(
    data.time.filter((block) => !block.deleted).map((block) => key(block.categoryId, block.date, block.minutes)),
  )
  let skipped = 0

  /** Категория по названию: живая, архивная тоже; нет — заводится. */
  function categoryFor(name: string): Category {
    const known = categories.find((each) => !each.deleted && sameName(each.name, name))
    if (known) return known
    const created = { ...createCategory(categories, name, 'neutral', ctx.newId()), updatedAt: ctx.now }
    // Ожила на месте надгробия — надгробие в списке заменяется ею.
    const at = categories.findIndex((each) => each.id === created.id)
    if (at === -1) categories.push(created)
    else categories[at] = created
    newCats.push(created)
    return created
  }

  for (const { raw: record, index } of records) {
    const title = `запись ${index + 1}`

    const date = dayOf(record.date)
    if (!date) {
      issue(title, absent(record.date) ? 'нет дня ("date")' : `день «${shown(record.date)}» — не ГГГГ-ММ-ДД`)
      continue
    }
    if (date > today) {
      issue(title, `день ${date} ещё не наступил — учёт про то, что было`)
      continue
    }

    const name = textOf(record.category)
    if (!name) {
      issue(title, 'нет занятия ("category")')
      continue
    }
    const where = `${name}, ${date}`

    const value = numberOf(record.minutes)
    // Дробные минуты бывают, когда часы переводят в минуты: 0,625 ч → 37,5.
    const minutes = value === null ? null : Math.round(value)
    if (minutes === null || !isMinutes(minutes)) {
      issue(
        where,
        absent(record.minutes)
          ? 'нет минут ("minutes")'
          : `минуты «${shown(record.minutes)}» — не от одной до ${MINUTES_PER_DAY}`,
      )
      continue
    }

    const bgName = textOf(record.background)
    if (!absent(record.background) && !bgName) {
      issue(where, `фоновое «${shown(record.background)}» — не текст`)
      continue
    }
    if (bgName && sameName(bgName, name)) {
      issue(where, 'фоном — то же занятие: это был бы тот же час дважды')
      continue
    }

    // Категории заводятся только для записи, прошедшей проверки: кривая
    // запись не должна оставлять после себя пустых категорий.
    const category = categoryFor(name)
    const background = bgName ? categoryFor(bgName) : null

    const found = key(category.id, date, minutes)
    if (seen.has(found)) {
      skipped += 1
      continue
    }
    seen.add(found)

    const note = textOf(record.note)
    newBlocks.push({
      id: ctx.newId(),
      updatedAt: ctx.now,
      date,
      categoryId: category.id,
      minutes,
      ...(background ? { bgCategoryId: background.id } : {}),
      ...(note ? { note } : {}),
    })
  }

  return {
    writes: { categories: newCats, time: newBlocks },
    added: [
      { count: newBlocks.length, forms: ['блок времени', 'блока времени', 'блоков времени'] as [string, string, string] },
      { count: newCats.length, forms: ['категория', 'категории', 'категорий'] as [string, string, string] },
    ].filter((each) => each.count > 0),
    skipped,
    issues,
  }
}
