/**
 * Ретро-ввод — для «забыл включить»: блок задним числом, с датой.
 * И правка уже записанного блока — той же формой.
 *
 * Чистые функции, без React и без базы.
 */

import { addDays, isDateStr, nowIso, type DateStr } from '../../core/dates.ts'
import { ulid } from '../../core/id.ts'
import type { TimeBlock } from '../../core/model.ts'
import { isMinutes } from './categories.ts'

/** Сколько последних блоков категории берёт медиана: нынешняя привычка важнее давней. */
export const MEDIAN_OF = 20

/** Длительность, когда подсказать нечем: ни истории, ни кнопок. */
export const DEFAULT_MINUTES = 30

/**
 * Подстановка длительности по своей истории категории (01-Проект, модуль 3):
 * медиана последних блоков. Медиана, а не среднее: один забытый на ночь
 * таймер не должен сдвигать подсказку на неделю вперёд.
 */
export function medianMinutes(
  blocks: readonly TimeBlock[],
  categoryId: string,
  fallback: number = DEFAULT_MINUTES,
): number {
  const recent = blocks
    .filter((block) => !block.deleted && block.categoryId === categoryId && isMinutes(block.minutes))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, MEDIAN_OF)
    .map((block) => block.minutes)
    .sort((a, b) => a - b)

  const middle = Math.floor(recent.length / 2)
  const upper = recent[middle]
  if (upper === undefined) return fallback
  if (recent.length % 2 === 1) return upper
  return Math.round(((recent[middle - 1] ?? upper) + upper) / 2)
}

/** То, что вводится в форме. */
export type BlockDraft = {
  categoryId: string
  minutes: number
  date: string
  /** Фоновая активность: покер под ютуб. Нет — без фоновой. */
  bgCategoryId?: string
}

export type BlockProblem = 'category' | 'minutes' | 'date' | 'future' | 'same-bg'

/**
 * Годится ли черновик. Будущего нет: учёт — про то, что было, а план
 * на завтра — другой модуль. Фоновая не может совпадать с основной:
 * это был бы тот же час, записанный дважды.
 */
export function blockProblem(draft: BlockDraft, today: DateStr): BlockProblem | null {
  if (!draft.categoryId) return 'category'
  if (!isMinutes(draft.minutes)) return 'minutes'
  if (!isDateStr(draft.date)) return 'date'
  if (draft.date > today) return 'future'
  if (draft.bgCategoryId && draft.bgCategoryId === draft.categoryId) return 'same-bg'
  return null
}

/**
 * Блок из черновика. Правка сохраняет id и прочие поля блока — меняется
 * ровно то, что есть в форме. Фоновая в форме есть всегда: убранная
 * там — убирается и из блока.
 */
export function blockFromDraft(draft: BlockDraft, existing?: TimeBlock): TimeBlock {
  const block: TimeBlock = {
    ...(existing ?? { id: ulid(), updatedAt: nowIso() }),
    date: draft.date,
    categoryId: draft.categoryId,
    minutes: draft.minutes,
  }
  if (draft.bgCategoryId) block.bgCategoryId = draft.bgCategoryId
  else delete block.bgCategoryId
  return block
}

/** Кнопки у поля даты: «сегодня» и «вчера» (Р-19). */
export function quickDates(today: DateStr): { label: string; date: DateStr }[] {
  return [
    { label: 'сегодня', date: today },
    { label: 'вчера', date: addDays(today, -1) },
  ]
}
