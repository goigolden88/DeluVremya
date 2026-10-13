import { describe, expect, it } from 'vitest'
import { config } from '../app/config.ts'
import { SYNCED_STORES } from '../app/model.ts'
import { checkDemo } from '../shared/core/demo.ts'
import { addDays } from '../shared/core/dates.ts'
import { demo } from './demo.ts'

/**
 * Демо-данные (Я-44, Я-45 «FamilyCore»). Сторож ядра `checkDemo`: каждое
 * хранилище получает записи, у записей — поля `Base`, id не повторяются.
 * Новое хранилище без строки в `demo.ts` — красный тест здесь.
 */

const DAY = '2026-10-12'

describe('демо «Делу Время»', () => {
  it('полное: записи каждому хранилищу, без изъянов', () => {
    expect(checkDemo(config, DAY)).toEqual([])
  })

  it('в конфиге — та же функция', () => {
    expect(config.demo).toBe(demo)
  })

  it('даты от дня входа: план сегодня, учёт не позже сегодня', () => {
    const data = demo(DAY)
    expect(data.notes.some((note) => note.plannedFor === DAY && note.main)).toBe(true)
    expect(data.time.every((block) => block.date <= DAY && block.date >= addDays(DAY, -14))).toBe(true)
    expect(data.time.length).toBeGreaterThan(0)
  })

  it('блоки — на категории демо, дела замысла — на замысел демо', () => {
    const data = demo(DAY)
    const categories = new Set(data.categories.map((category) => category.id))
    expect(data.time.every((block) => categories.has(block.categoryId))).toBe(true)
    const notes = new Set(data.notes.map((note) => `note:${note.id}`))
    for (const note of data.notes) for (const ref of note.refs ?? []) expect(notes.has(ref)).toBe(true)
  })

  it('учёт разнообразный: есть и полезное, и бездельное, у всех категорий демо — блоки', () => {
    const data = demo(DAY)
    const used = new Set(data.time.map((block) => block.categoryId))
    const kinds = new Set(data.categories.filter((category) => used.has(category.id)).map((category) => category.kind))
    expect(kinds.has('useful')).toBe(true)
    expect(kinds.has('idle')).toBe(true)
    expect(data.categories.every((category) => used.has(category.id))).toBe(true)
  })

  it('другой день — другие даты: демо не стареет', () => {
    const later = '2026-12-01'
    expect(demo(later).notes.some((note) => note.plannedFor === later)).toBe(true)
    expect(Object.keys(demo(later)).sort()).toEqual([...SYNCED_STORES].sort())
  })
})
