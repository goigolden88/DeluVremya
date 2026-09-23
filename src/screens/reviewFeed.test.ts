import { describe, expect, it } from 'vitest'
import type { Note, Review } from '../app/model.ts'
import { reviewFeed, reviewMarkdown } from './reviewFeed.ts'

const at = '2026-09-14T10:00:00.000Z'

function review(week: string, over: Partial<Review> = {}): Review {
  return { id: `review:${week}`, updatedAt: at, weekStart: week, doneAt: at, ...over }
}

const thought: Note = {
  id: 't1',
  updatedAt: at,
  text: 'Неделя вышла ровной\nи тихой',
  kind: 'thought',
  capturedOn: '2026-09-14',
  plannedFor: null,
  status: 'open',
}

describe('обзор в ленте — Р-60', () => {
  it('день проведения, неделя в заголовке, наблюдение под ним, тап — обзор той недели', () => {
    const [item] = reviewFeed([review('2026-09-07', { refs: ['note:t1'] })], [thought])
    expect(item).toMatchObject({
      kind: 'review',
      date: '2026-09-14',
      title: 'Обзор недели 7–13 сентября 2026',
      detail: 'Неделя вышла ровной',
      link: '/review?week=2026-09-07',
    })
    expect(item?.extra).toContain('и тихой')
  })

  it('удалённое наблюдение молчит, кривое время — без даты, удалённый обзор не попадает', () => {
    const items = reviewFeed(
      [review('2026-09-07', { refs: ['note:t1'], doneAt: 'когда-то' }), review('2026-08-31', { deleted: true })],
      [{ ...thought, deleted: true }],
    )
    expect(items).toHaveLength(1)
    expect(items[0]?.detail).toBe('')
    expect(items[0]?.date).toBe('')
  })
})

describe('обзор в markdown — Р-63', () => {
  it('неделя, когда проведён, наблюдение подпунктом; от старых к новым', () => {
    const text = reviewMarkdown(
      [review('2026-09-07', { refs: ['note:t1'] }), review('2026-08-31', { doneAt: '2026-09-07T10:00:00.000Z' })],
      [thought],
    )
    expect(text).toBe(
      [
        '- 31 августа – 6 сентября 2026 — проведён 07.09.2026',
        '- 7–13 сентября 2026 — проведён 14.09.2026',
        '  - Неделя вышла ровной и тихой',
      ].join('\n'),
    )
  })

  it('пусто — так и сказано', () => {
    expect(reviewMarkdown([], [])).toBe('Записей нет.')
  })
})

describe('обзор в markdown за период — Р-79', () => {
  it('только недели, чей понедельник в периоде', () => {
    const text = reviewMarkdown([review('2026-08-31'), review('2026-09-07')], [], {
      from: '2026-09-01',
      to: '2026-09-30',
    })
    expect(text).toContain('7–13 сентября')
    expect(text).not.toContain('31 августа')
  })
})
