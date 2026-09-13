import { describe, expect, it } from 'vitest'
import { isUlid } from '../../core/id.ts'
import type { Note } from '../../core/model.ts'
import { DEFAULT_KIND, captureNote, inboxOf } from './inbox.ts'

function note(id: string, over: Partial<Note> = {}): Note {
  return {
    id,
    updatedAt: '2026-09-13T10:00:00.000Z',
    text: `запись ${id}`,
    kind: 'task',
    capturedOn: '2026-09-13',
    plannedFor: null,
    status: 'open',
    ...over,
  }
}

describe('захват одной строкой — Р-09, Р-13', () => {
  it('текст — единственное, что нужно: остальное ставится само', () => {
    const captured = captureNote('  купить фильтр  ', '2026-09-13')
    expect(captured).toMatchObject({
      text: 'купить фильтр',
      kind: 'task',
      capturedOn: '2026-09-13',
      plannedFor: null,
      status: 'open',
    })
    expect(isUlid(captured?.id ?? '')).toBe(true)
  })

  it('вид по умолчанию — дело', () => {
    expect(DEFAULT_KIND).toBe('task')
  })

  it('переводы строк внутри текста сохраняются', () => {
    expect(captureNote('Статья\nhttps://example.com', '2026-09-13')?.text).toBe('Статья\nhttps://example.com')
  })

  it('пустое и пробелы не записываются', () => {
    expect(captureNote('', '2026-09-13')).toBeNull()
    expect(captureNote('   \n ', '2026-09-13')).toBeNull()
  })
})

describe('что во входящих', () => {
  it('только не поставленное в план и открытое, свежие сверху', () => {
    const list = inboxOf([
      note('01A'),
      note('01C'),
      note('01B', { plannedFor: '2026-09-14' }),
      note('01D', { status: 'done' }),
      note('01E', { status: 'someday' }),
      note('01F', { deleted: true }),
    ])
    expect(list.map((each) => each.id)).toEqual(['01C', '01A'])
  })

  it('мысль без даты во входящих видна — Р-08', () => {
    expect(inboxOf([note('01A', { kind: 'thought', capturedOn: null })])).toHaveLength(1)
  })
})
