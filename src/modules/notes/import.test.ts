import { describe, expect, it } from 'vitest'
import type { Note } from '../../app/model.ts'
import { importNotes } from './import.ts'

const NOW = '2026-09-13T10:00:00.000Z'

function note(text: string, capturedOn: string | null, extra: Partial<Note> = {}): Note {
  return {
    id: `${text}-${capturedOn}`,
    updatedAt: NOW,
    text,
    kind: 'task',
    capturedOn,
    plannedFor: null,
    status: 'open',
    ...extra,
  }
}

function run(raw: unknown, notes: Note[] = []) {
  let counter = 0
  return importNotes(raw, { notes }, { newId: () => `n${++counter}`, now: NOW })
}

describe('раздел «notes» импорта — Р-08', () => {
  it('одного текста хватает: дело, без даты, открыто, не в плане', () => {
    const plan = run([{ text: '  Заменить лампу  ' }])
    expect(plan.issues).toEqual([])
    expect(plan.writes.notes).toEqual([
      {
        id: 'n1',
        updatedAt: NOW,
        text: 'Заменить лампу',
        kind: 'task',
        capturedOn: null,
        plannedFor: null,
        status: 'open',
      },
    ])
    expect(plan.added).toEqual([{ count: 1, forms: ['заметка', 'заметки', 'заметок'] }])
  })

  it('вид: мысль и замысел — свои, регистр не важен; чужое слово — в отчёт', () => {
    const plan = run([
      { text: 'На ходу думается лучше', kind: 'thought' },
      { text: 'Научиться плавать', kind: ' Goal ' },
      { text: 'Непонятное', kind: 'idea' },
    ])
    expect(plan.writes.notes?.map((each) => each.kind)).toEqual(['thought', 'goal'])
    expect(plan.issues.map((each) => [each.title, each.reason])).toEqual([
      ['«Непонятное»', 'вид «idea» — не "task", "thought" или "goal"'],
    ])
  })

  it('дата: день — принимается; только месяц, кривая и будущая — в отчёт с причиной', () => {
    const plan = run([
      { text: 'Март', date: '2026-03-12' },
      { text: 'Месяц', date: '2026-03' },
      { text: 'Кривая', date: '12.03.2026' },
      { text: 'Будущая', date: '2026-09-14' },
      { text: 'Пустая', date: '' },
    ])
    expect(plan.writes.notes?.map((each) => [each.text, each.capturedOn])).toEqual([
      ['Март', '2026-03-12'],
      ['Пустая', null],
    ])
    expect(plan.issues.map((each) => each.reason)).toEqual([
      'дата «2026-03» — только месяц; не пиши её, и заметка ляжет без даты',
      'дата «12.03.2026» — не ГГГГ-ММ-ДД',
      'дата 2026-09-14 ещё не наступила — заметка про то, что уже записано',
    ])
  })

  it('текст обязателен; не строка — в отчёт, запись названа номером', () => {
    const plan = run([{ date: '2026-03-12' }, { text: 5 }, { text: '   ' }])
    expect(plan.issues.map((each) => [each.title, each.reason])).toEqual([
      ['заметка 1', 'нет текста ("text")'],
      ['заметка 2', 'текст «5» — не строка'],
      ['заметка 3', 'нет текста ("text")'],
    ])
    expect(plan.writes.notes).toEqual([])
  })

  it('только добавляет: совпавшее по тексту и дню с базой и повтор в файле пропускаются', () => {
    const plan = run(
      [
        { text: 'Лампа', date: '2026-03-12' },
        { text: 'Лампа', date: '2026-03-13' },
        { text: 'Без даты' },
        { text: 'Без даты' },
      ],
      [note('Лампа', '2026-03-12')],
    )
    expect(plan.writes.notes?.map((each) => [each.text, each.capturedOn])).toEqual([
      ['Лампа', '2026-03-13'],
      ['Без даты', null],
    ])
    expect(plan.skipped).toBe(2)
  })

  it('удалённая заметка не мешает загрузить такую же заново', () => {
    const plan = run([{ text: 'Лампа', date: '2026-03-12' }], [note('Лампа', '2026-03-12', { deleted: true })])
    expect(plan.writes.notes).toHaveLength(1)
  })

  it('раздел не список — в отчёт целиком', () => {
    expect(run({ text: 'одна' }).issues).toHaveLength(1)
  })
})
