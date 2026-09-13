import { describe, expect, it } from 'vitest'
import {
  customScreenNames,
  DEFAULT_SCREEN_NAMES,
  MAX_SCREEN_NAME,
  parseScreenNames,
  quoted,
} from './screenNames.ts'

describe('названия вкладок — Р-26', () => {
  it('по умолчанию экран учёта — «Учёт»', () => {
    expect(DEFAULT_SCREEN_NAMES).toEqual({ today: 'Сегодня', time: 'Учёт', inbox: 'Входящие' })
  })

  it('из настроек: своё — своё, пустое, длинное и кривое — по умолчанию', () => {
    expect(parseScreenNames({ time: ' Хронометраж ' })).toEqual({ ...DEFAULT_SCREEN_NAMES, time: 'Хронометраж' })
    expect(parseScreenNames({ time: '  ', inbox: 'x'.repeat(MAX_SCREEN_NAME + 1), today: 5 })).toEqual(DEFAULT_SCREEN_NAMES)
    expect(parseScreenNames(undefined)).toEqual(DEFAULT_SCREEN_NAMES)
    expect(parseScreenNames('чепуха')).toEqual(DEFAULT_SCREEN_NAMES)
  })

  it('хранится только своё: совпавшее с умолчанием и пустое не пишется', () => {
    expect(customScreenNames({ today: 'Сегодня', time: 'Хронометраж', inbox: '' })).toEqual({ time: 'Хронометраж' })
    expect(customScreenNames({})).toEqual({})
  })

  it('в тексте — в кавычках и в именительном: своё имя не склоняется', () => {
    expect(quoted('Хронометраж')).toBe('«Хронометраж»')
  })
})

/**
 * Сторож (Р-26): название вкладки не пишется в исходнике руками — только
 * берётся из `screenNames.ts`. Иначе после переименования в «Настройках»
 * текст разойдётся с вкладкой. Ловит название в кавычках-ёлочках, текстом
 * разметки и строкой кода. Комментарии не в счёт, «Что нового» — история.
 */
const SOURCES = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../**/*.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

// Пути — от этого файла: так их отдаёт import.meta.glob.
const EXEMPT = ['./screenNames.ts', '../changes.ts']

/** Строки, где название вкладки вписано руками. */
function typedNames(source: string, names: readonly string[]): string[] {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .filter((line) =>
      names.some((name) => [`«${name}»`, `>${name}<`, `'${name}'`, `"${name}"`].some((form) => line.includes(form))),
    )
    .map((line) => line.trim())
}

describe('названия вкладок — только из одного места', () => {
  // Прежнее название экрана учёта тоже: вернуть его руками — та же ошибка.
  const names = [...Object.values(DEFAULT_SCREEN_NAMES), 'Время']

  it('исходники нашлись — сторож смотрит не в пустоту', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(20)
  })

  it.each(Object.entries(SOURCES).filter(([path]) => !EXEMPT.includes(path)))(
    'в %s название вкладки не вписано руками',
    (_path, source) => {
      expect(typedNames(source, names)).toEqual([])
    },
  )

  it('сторож ловит вписанное название и не трогает комментарии', () => {
    const sample = ['/* экран «Учёт» */', '// на «Сегодня»', "label: 'Учёт'", '<h1>Входящие</h1>', 'за сегодня'].join('\n')
    expect(typedNames(sample, names)).toEqual(["label: 'Учёт'", '<h1>Входящие</h1>'])
  })
})
