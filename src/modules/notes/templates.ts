/**
 * Шаблоны дня (Р-39): завести из плана, править, применить к дню без дублей.
 * Привычки — повторяющиеся пункты шаблона, своей механики нет (Р-03).
 *
 * Чистые функции, без React и без базы (02-Архитектура, «Структура кода»).
 */

import { nowIso, type DateStr } from '../../core/dates.ts'
import { ulid } from '../../core/id.ts'
import type { DayTemplate, Note } from '../../core/model.ts'
import { normalize } from './inbox.ts'
import { shortText } from './labels.ts'
import { dayPlan, MAX_ESTIMATE, planNote, readEstimate, type DayPlan } from './plan.ts'

export type TemplateItem = DayTemplate['items'][number]

/** Длиннее кнопка шаблона на «Сегодня» не читается. */
export const MAX_TEMPLATE_NAME = 30

/** Живые шаблоны в порядке кнопок. */
export function templatesOf(templates: readonly DayTemplate[]): DayTemplate[] {
  return templates
    .filter((template) => !template.deleted)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ru'))
}

/**
 * Сдвиг шаблона выше или ниже среди живых (Р-75). Порядок заново подряд
 * с нуля: после удалений в нём бывают дыры. Возвращает изменённые.
 */
export function moveTemplate(templates: readonly DayTemplate[], id: string, step: -1 | 1): DayTemplate[] {
  const list = templatesOf(templates)
  const from = list.findIndex((template) => template.id === id)
  const a = list[from]
  const b = list[from + step]
  if (from === -1 || !a || !b) return []
  list[from] = b
  list[from + step] = a
  return list.flatMap((template, order) => (template.order === order ? [] : [{ ...template, order }]))
}

export type NameProblem = 'empty' | 'long' | 'taken'

export const NAME_PROBLEM_TEXT: Record<NameProblem, string> = {
  empty: 'У шаблона нет названия',
  long: `Название шаблона — не длиннее ${MAX_TEMPLATE_NAME} знаков`,
  taken: 'Шаблон с таким названием уже есть — он правится на экране шаблонов',
}

/**
 * Что не так с названием; null — годится. Два шаблона с одним названием
 * на кнопках не различить — регистр и «ё» не в счёт, как в поиске.
 * `selfId` — у переименования: своё название не занято.
 */
export function templateNameProblem(templates: readonly DayTemplate[], name: string, selfId?: string): NameProblem | null {
  const trimmed = name.trim()
  if (!trimmed) return 'empty'
  if (trimmed.length > MAX_TEMPLATE_NAME) return 'long'
  const key = normalize(trimmed)
  if (templatesOf(templates).some((each) => each.id !== selfId && normalize(each.name) === key)) return 'taken'
  return null
}

function item(title: string, estMin: number | undefined, main: boolean): TemplateItem {
  const made: TemplateItem = { title }
  if (estMin !== undefined) made.estMin = estMin
  if (main) made.main = true
  return made
}

/** Пункты шаблона из плана дня — главное первым, дальше в порядке плана, с оценками. */
export function itemsFromPlan(plan: DayPlan): TemplateItem[] {
  const notes = plan.main ? [plan.main, ...plan.open, ...plan.done] : [...plan.open, ...plan.done]
  return notes.map((note) => item(note.text, note.estMin, note === plan.main))
}

/** Новый шаблон — последним в порядке кнопок. */
export function createTemplate(templates: readonly DayTemplate[], name: string, items: TemplateItem[]): DayTemplate {
  const order = Math.max(-1, ...templatesOf(templates).map((each) => each.order)) + 1
  return { id: ulid(), updatedAt: nowIso(), name: name.trim(), items, order }
}

function isEstimate(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_ESTIMATE
}

export type Applied = {
  /** Новые пункты плана — записать. */
  added: Note[]
  /** Сколько пунктов шаблона в этот день уже стояло. */
  present: number
}

/**
 * Применить шаблон к дню (Р-39): пункты становятся обычными заметками
 * на `day`. Пункт, который в этот день уже стоит с тем же текстом —
 * открытый или сделанный, — не ставится: повторный тап безвреден.
 * Главное из шаблона — только если у дня главного нет.
 */
export function applyTemplate(template: DayTemplate, notes: readonly Note[], day: DateStr, today: DateStr): Applied {
  const plan = dayPlan(notes, day)
  const taken = new Set(plan.all.map((note) => normalize(note.text)))
  let hasMain = plan.main !== null
  const added: Note[] = []
  let present = 0

  for (const each of template.items) {
    const note = planNote(each.title, today, day)
    if (note === null) continue
    const key = normalize(note.text)
    if (taken.has(key)) {
      present += 1
      continue
    }
    taken.add(key)
    const main = each.main === true && !hasMain
    if (main) hasMain = true
    added.push({
      ...note,
      ...(isEstimate(each.estMin) ? { estMin: each.estMin } : {}),
      ...(main ? { main: true } : {}),
    })
  }
  return { added, present }
}

// ─── Правка на экране шаблонов ─────────────────────────────────────────────

/** Пункт в правке: оценка — строкой поля, как её вводят. */
export type ItemDraft = { title: string; estimate: string; main: boolean }
export type TemplateDraft = { name: string; items: ItemDraft[] }

export function draftOf(template: DayTemplate): TemplateDraft {
  return {
    name: template.name,
    items: template.items.map((each) => ({
      title: each.title,
      estimate: each.estMin === undefined ? '' : String(each.estMin),
      main: each.main === true,
    })),
  }
}

/** Главное в шаблоне — одно, как в дне: отметка снимает прежнюю, повторная — свою. */
export function withDraftMain(items: readonly ItemDraft[], index: number): ItemDraft[] {
  return items.map((each, at) => ({ ...each, main: at === index ? !each.main : false }))
}

/** Пункт на шаг выше или ниже. За край — без изменений. */
export function moveDraftItem(items: readonly ItemDraft[], index: number, step: -1 | 1): ItemDraft[] {
  const target = index + step
  const moving = items[index]
  const other = items[target]
  if (moving === undefined || other === undefined) return [...items]
  const next = [...items]
  next[index] = other
  next[target] = moving
  return next
}

/**
 * Правка → поля шаблона. Пустые строки пунктов выбрасываются; кривая
 * оценка — причина с названием пункта; главное — первое отмеченное.
 */
export function readDraft(
  draft: TemplateDraft,
  templates: readonly DayTemplate[],
  selfId: string,
): { name: string; items: TemplateItem[] } | { error: string } {
  const problem = templateNameProblem(templates, draft.name, selfId)
  if (problem) return { error: NAME_PROBLEM_TEXT[problem] }

  const items: TemplateItem[] = []
  let hasMain = false
  for (const each of draft.items) {
    const title = each.title.trim()
    if (!title) continue
    const read = readEstimate(each.estimate)
    if ('error' in read) {
      return { error: `«${shortText(title)}»: ${read.error.charAt(0).toLowerCase()}${read.error.slice(1)}` }
    }
    const main = each.main && !hasMain
    if (main) hasMain = true
    items.push(item(title, read.minutes ?? undefined, main))
  }
  if (items.length === 0) return { error: 'В шаблоне нет ни одного пункта' }
  return { name: draft.name.trim(), items }
}
