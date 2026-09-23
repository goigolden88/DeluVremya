/**
 * Названия вкладок (Р-26): по умолчанию и свои, из настроек устройства.
 *
 * Единственное место, где названия экранов написаны словами. Всё, что
 * называет экран, — вкладки, заголовки, приветствие, подсказки, текст
 * уведомления — берёт имя отсюда. Тест-сторож падает на названии вкладки
 * в кавычках, написанном в исходнике руками.
 *
 * Имя в тексте стоит в именительном падеже и в кавычках — «экран «Учёт»»,
 * а не «на «Учёте»»: вписанное человеком имя не склоняется.
 *
 * Без React: имя нужно и service worker — в тексте уведомления.
 */

import { db } from '../app/core.ts'

export type ScreenKey = 'today' | 'time' | 'inbox'
export type ScreenNames = Record<ScreenKey, string>

/** Порядок — порядок вкладок. */
export const SCREEN_KEYS: readonly ScreenKey[] = ['today', 'time', 'inbox']

/** Ключ `inbox` и адрес `/inbox` — прежние: имена в базе и в ярлыке не меняются (Р-32). */
export const DEFAULT_SCREEN_NAMES: ScreenNames = {
  today: 'Сегодня',
  time: 'Учёт',
  inbox: 'Заметки',
}

/** Ключ в `settings`: названия у каждого устройства свои. */
const KEY = 'screenNames'

/** Длиннее вкладка на телефоне не покажет — обрежет многоточием. */
export const MAX_SCREEN_NAME = 20

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text && text.length <= MAX_SCREEN_NAME ? text : null
}

/** Названия из настроек. Кривое, пустое или длинное — по умолчанию, а не падение. */
export function parseScreenNames(value: unknown): ScreenNames {
  const stored = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  const names = { ...DEFAULT_SCREEN_NAMES }
  for (const key of SCREEN_KEYS) names[key] = clean(stored[key]) ?? DEFAULT_SCREEN_NAMES[key]
  return names
}

/** Что хранить: только свои. Пустое и совпавшее с умолчанием не пишется. */
export function customScreenNames(input: Partial<Record<ScreenKey, string>>): Partial<ScreenNames> {
  const custom: Partial<ScreenNames> = {}
  for (const key of SCREEN_KEYS) {
    const name = clean(input[key])
    if (name && name !== DEFAULT_SCREEN_NAMES[key]) custom[key] = name
  }
  return custom
}

/** Название экрана в тексте: в кавычках, в именительном падеже. */
export function quoted(name: string): string {
  return `«${name}»`
}

export async function readScreenNames(): Promise<ScreenNames> {
  try {
    return parseScreenNames(await db.settings.get<unknown>(KEY))
  } catch {
    return DEFAULT_SCREEN_NAMES
  }
}

export async function writeScreenNames(input: Partial<Record<ScreenKey, string>>): Promise<ScreenNames> {
  const custom = customScreenNames(input)
  await db.settings.set(KEY, custom)
  return parseScreenNames(custom)
}
