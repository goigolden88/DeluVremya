import { describe, expect, it } from 'vitest'
import { captureDraft, NO_DAY_ERROR, PAST_DAY_ERROR } from './capture.ts'
import { isUnsorted } from './inbox.ts'
import { SPAN_ERROR } from './labels.ts'
import { draftOfRule, isPattern, patternsOf } from './repeat.ts'

const TODAY = '2026-10-25'

describe('дело при записи — день, период, повтор (Р-73, Р-108)', () => {
  it('ничего не выбрано — в неразобранное', () => {
    const read = captureDraft('Позвонить в сервис', TODAY, 'task', { at: 'unsorted' })
    expect(read).not.toBeNull()
    if (read === null || 'error' in read) throw new Error('нет черновика')
    expect(read.note).toMatchObject({ plannedFor: null, status: 'open', kind: 'task' })
    expect(read.note.repeat).toBeUndefined()
    expect(isUnsorted(read.note)).toBe(true)
  })

  it('пустой текст — записывать нечего, что бы ни было выбрано', () => {
    expect(captureDraft('  ', TODAY, 'task', { at: 'day', day: '', to: null })).toBeNull()
  })

  it('на любой день — в план этого дня, без периода', () => {
    const read = captureDraft('Сдать отчёт', TODAY, 'task', { at: 'day', day: '2026-11-03', to: null })
    expect(read).toMatchObject({ note: { plannedFor: '2026-11-03', text: 'Сдать отчёт' } })
    if (read === null || 'error' in read) throw new Error('нет черновика')
    expect('plannedTo' in read.note).toBe(false)
  })

  it('на день с «По какой день» — на период (Р-101)', () => {
    const read = captureDraft('Ремонт', TODAY, 'task', { at: 'day', day: TODAY, to: '2026-10-30' })
    expect(read).toMatchObject({ note: { plannedFor: TODAY, plannedTo: '2026-10-30' } })
  })

  it('кривой день и период — ошибка, ничего не пишется', () => {
    expect(captureDraft('Ремонт', TODAY, 'task', { at: 'day', day: '', to: null })).toEqual({ error: NO_DAY_ERROR })
    expect(captureDraft('Ремонт', TODAY, 'task', { at: 'day', day: '2026-10-24', to: null })).toEqual({
      error: PAST_DAY_ERROR,
    })
    expect(captureDraft('Ремонт', TODAY, 'task', { at: 'day', day: '2026-10-28', to: '2026-10-28' })).toEqual({
      error: SPAN_ERROR,
    })
  })

  it('повтором — сразу образец: не в плане и не в неразобранном (Р-107)', () => {
    const rule = draftOfRule(null, TODAY)
    const read = captureDraft('Полить цветы', TODAY, 'task', { at: 'repeat', rule })
    if (read === null || 'error' in read) throw new Error('нет черновика')
    expect(read.note).toMatchObject({
      text: 'Полить цветы',
      kind: 'task',
      plannedFor: null,
      status: 'open',
      repeat: { from: TODAY, every: 'week', weekdays: [7] },
    })
    expect(isPattern(read.note)).toBe(true)
    expect(isUnsorted(read.note)).toBe(false)
    expect(patternsOf([read.note])).toHaveLength(1)
  })

  it('кривое правило — та же ошибка, что в карточке, ничего не пишется', () => {
    const rule = { ...draftOfRule(null, TODAY), weekdays: [] }
    expect(captureDraft('Полить цветы', TODAY, 'task', { at: 'repeat', rule })).toEqual({
      error: 'Не выбран ни один день недели',
    })
    const early = { ...draftOfRule(null, TODAY), until: '2026-10-20' }
    expect(captureDraft('Полить цветы', TODAY, 'task', { at: 'repeat', rule: early })).toEqual({
      error: '«До какого дня» — не раньше первого дня',
    })
  })

  it('у мысли и замысла выбор не действует — в план и повтор ставится дело', () => {
    const day = captureDraft('Мысль', TODAY, 'thought', { at: 'day', day: TODAY, to: null })
    expect(day).toMatchObject({ note: { kind: 'thought', plannedFor: null } })
    const repeat = captureDraft('Замысел', TODAY, 'goal', { at: 'repeat', rule: draftOfRule(null, TODAY) })
    if (repeat === null || 'error' in repeat) throw new Error('нет черновика')
    expect(repeat.note.repeat).toBeUndefined()
  })
})
