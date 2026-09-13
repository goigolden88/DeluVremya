import { describe, expect, it } from 'vitest'
import { addDays } from '../../core/dates.ts'
import type { Note } from '../../core/model.ts'
import {
  AGE_MONTHS_FROM,
  AGE_WEEKS_FROM,
  AGE_YEARS_FROM,
  ageText,
  dayText,
  deleteConfirm,
  durationText,
  monthHeading,
  plannedCountText,
  plannedLine,
  progressText,
  realismText,
  shownText,
} from './labels.ts'
import type { Realism } from './plan.ts'

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

describe('план дня', () => {
  const load = (minutes: number, estimated: number, total: number, left: number): Realism => ({
    minutes,
    estimated,
    total,
    left,
    over: Math.max(0, minutes - left),
  })

  it('длительность — часами и минутами', () => {
    expect(durationText(45)).toBe('45 мин')
    expect(durationText(120)).toBe('2 ч')
    expect(durationText(90)).toBe('1 ч 30 мин')
  })

  it('реализм — число с основанием и вывод (Р-35)', () => {
    expect(realismText(load(570, 6, 8, 420))).toBe(
      'Намечено 9 ч 30 мин по 6 пунктам из 8 — до конца дня 7 ч: не влезает на 2 ч 30 мин',
    )
    expect(realismText(load(90, 1, 1, 600))).toBe('Намечено 1 ч 30 мин по 1 пункту — до конца дня 10 ч: влезает, в запасе 8 ч 30 мин')
    expect(realismText(load(60, 1, 1, 60))).toBe('Намечено 1 ч по 1 пункту — до конца дня 1 ч: влезает впритык')
  })

  it('оценок нет — посчитать нечего, и это сказано', () => {
    expect(realismText(load(0, 0, 5, 600))).toBe('Влезает ли в день — не посчитать: оценки нет ни у одного из 5 пунктов')
    expect(realismText(load(0, 0, 1, 600))).toBe('Влезает ли в день — не посчитать: у пункта нет оценки')
  })

  it('день плана словами', () => {
    expect(dayText('2026-09-13', TODAY)).toBe('сегодня')
    expect(dayText('2026-09-12', TODAY)).toBe('вчера')
    expect(dayText('2026-09-14', TODAY)).toBe('завтра')
    expect(dayText('2026-09-20', TODAY)).toBe('20 сентября 2026')
    expect(dayText('14.09', TODAY)).toBe('14.09')
    expect(plannedLine('2026-09-14', TODAY)).toBe('Поставлено на завтра')
  })

  it('поставленное в план названо числом и экраном — своим именем устройства', () => {
    expect(plannedCountText(3, 'День')).toBe('Ещё 3 записи в плане — экран «День»')
  })
})
