import { describe, expect, it } from 'vitest'
import { addDays } from '../../core/dates.ts'
import type { Note } from '../../core/model.ts'
import {
  AGE_MONTHS_FROM,
  AGE_WEEKS_FROM,
  AGE_YEARS_FROM,
  ageText,
  deleteConfirm,
  monthHeading,
  progressText,
  shownText,
} from './labels.ts'

const TODAY = '2026-09-13'

function captured(capturedOn: string | null): Note {
  return {
    id: '01A',
    updatedAt: '2026-09-13T10:00:00.000Z',
    text: 'запись',
    kind: 'task',
    capturedOn,
    plannedFor: null,
    status: 'open',
  }
}

const age = (daysBack: number) => ageText(captured(addDays(TODAY, -daysBack)), TODAY)

describe('возраст записи словами', () => {
  it('сегодня, вчера, дни', () => {
    expect(age(0)).toBe('сегодня')
    expect(age(1)).toBe('вчера')
    expect(age(5)).toBe('5 дней назад')
    expect(age(AGE_WEEKS_FROM - 1)).toBe('13 дней назад')
  })

  it('с порога — неделями, месяцами, годами', () => {
    expect(age(AGE_WEEKS_FROM)).toBe('2 недели назад')
    expect(age(AGE_MONTHS_FROM - 1)).toBe('8 недель назад')
    expect(age(AGE_MONTHS_FROM)).toBe('2 месяца назад')
    expect(age(AGE_YEARS_FROM - 1)).toBe('12 месяцев назад')
    expect(age(AGE_YEARS_FROM)).toBe('1 год назад')
  })

  it('без даты — так и сказано; кривая дата — как лежит', () => {
    expect(ageText(captured(null), TODAY)).toBe('без даты')
    expect(ageText(captured('12.03'), TODAY)).toBe('12.03')
  })
})

describe('числа с основанием', () => {
  it('отбор называет скрытое числом', () => {
    expect(shownText(12, 12)).toBe('12 записей')
    expect(shownText(3, 12)).toBe('Показано 3 из 12')
  })

  it('дела замысла — сколько и сколько сделано', () => {
    expect(progressText({ total: 0, done: 0 })).toBe('дел пока нет')
    expect(progressText({ total: 3, done: 1 })).toBe('3 дела, сделано 1')
  })
})

describe('подписи', () => {
  it('заголовок месяца с прописной; без даты — своя группа', () => {
    expect(monthHeading('2026-03')).toBe('Март 2026')
    expect(monthHeading(null)).toBe('Без даты')
  })

  it('удаление называет запись началом первой строки', () => {
    expect(deleteConfirm('Купить фильтр\nссылка')).toBe('Удалить запись «Купить фильтр»?')
    expect(deleteConfirm('а'.repeat(50))).toBe(`Удалить запись «${'а'.repeat(40)}…»?`)
  })
})
