import { describe, expect, it } from 'vitest'
import type { TimeBlock } from '../../app/model.ts'
import { blockFromDraft, blockProblem, DEFAULT_MINUTES, MEDIAN_OF, medianMinutes, quickDates } from './retro.ts'

const AT = '2026-09-13T10:00:00.000Z'
const TODAY = '2026-09-13'

function block(id: string, minutes: number, extra: Partial<TimeBlock> = {}): TimeBlock {
  return { id, updatedAt: AT, date: TODAY, categoryId: 'a', minutes, ...extra }
}

describe('медиана своей истории', () => {
  it('нечётное число блоков — средний, чётное — среднее двух средних', () => {
    expect(medianMinutes([block('1', 30), block('2', 90), block('3', 45)], 'a')).toBe(45)
    expect(medianMinutes([block('1', 30), block('2', 45)], 'a')).toBe(38)
  })

  it('один забытый таймер подсказку не сдвигает', () => {
    expect(medianMinutes([block('1', 30), block('2', 30), block('3', 600)], 'a')).toBe(30)
  })

  it('чужая категория, удалённые и кривые минуты не в счёт; истории нет — запасное', () => {
    const blocks = [block('1', 60, { categoryId: 'b' }), block('2', 90, { deleted: true }), block('3', 0)]
    expect(medianMinutes(blocks, 'a')).toBe(DEFAULT_MINUTES)
    expect(medianMinutes(blocks, 'a', 15)).toBe(15)
  })

  it('берёт только последние блоки — нынешняя привычка важнее давней', () => {
    const old = Array.from({ length: MEDIAN_OF }, (_, i) => block(`old${i}`, 120, { date: '2026-01-01' }))
    const fresh = Array.from({ length: MEDIAN_OF }, (_, i) => block(`new${i}`, 20, { date: '2026-09-01' }))
    expect(medianMinutes([...old, ...fresh], 'a')).toBe(20)
  })
})

describe('проверка черновика', () => {
  const good = { categoryId: 'a', minutes: 30, date: TODAY }

  it('годный — без замечаний, вчера — тоже', () => {
    expect(blockProblem(good, TODAY)).toBeNull()
    expect(blockProblem({ ...good, date: '2026-09-12' }, TODAY)).toBeNull()
  })

  it('без категории, кривые минуты, кривая дата, будущее', () => {
    expect(blockProblem({ ...good, categoryId: '' }, TODAY)).toBe('category')
    expect(blockProblem({ ...good, minutes: 0 }, TODAY)).toBe('minutes')
    expect(blockProblem({ ...good, minutes: 12.5 }, TODAY)).toBe('minutes')
    expect(blockProblem({ ...good, date: '2026-02-30' }, TODAY)).toBe('date')
    expect(blockProblem({ ...good, date: '2026-09-14' }, TODAY)).toBe('future')
  })

  it('фоновая — другая категория, не та же самая', () => {
    expect(blockProblem({ ...good, bgCategoryId: 'p' }, TODAY)).toBeNull()
    expect(blockProblem({ ...good, bgCategoryId: 'a' }, TODAY)).toBe('same-bg')
  })
})

describe('блок из черновика', () => {
  it('новый — свой id; без фоновой — поля нет вовсе', () => {
    const made = blockFromDraft({ categoryId: 'a', minutes: 30, date: TODAY })
    expect(made).toMatchObject({ categoryId: 'a', minutes: 30, date: TODAY })
    expect(made.id).toBeTruthy()
    expect('bgCategoryId' in made).toBe(false)
    expect(blockFromDraft({ categoryId: 'a', minutes: 30, date: TODAY, bgCategoryId: 'p' }).bgCategoryId).toBe('p')
  })

  it('правка — тот же id, поля вне формы на месте', () => {
    const existing = block('X', 30, { bgCategoryId: 'p', note: 'под подкаст', refs: ['r1'] })
    expect(
      blockFromDraft({ categoryId: 'b', minutes: 45, date: '2026-09-12', bgCategoryId: 'q', note: 'Толстой' }, existing),
    ).toEqual({
      ...existing,
      categoryId: 'b',
      minutes: 45,
      date: '2026-09-12',
      bgCategoryId: 'q',
      note: 'Толстой',
    })
  })

  it('фоновую и заметку убрали в форме — уходят и из блока', () => {
    const existing = block('X', 30, { bgCategoryId: 'p', note: 'под подкаст', refs: ['r1'] })
    const edited = blockFromDraft({ categoryId: 'a', minutes: 30, date: TODAY }, existing)
    expect('bgCategoryId' in edited).toBe(false)
    expect('note' in edited).toBe(false)
    expect(edited.refs).toEqual(['r1'])
    // Исходный блок не тронут: правка — новая запись, а не порча старой.
    expect(existing.bgCategoryId).toBe('p')
    expect(existing.note).toBe('под подкаст')
  })

  it('новый с заметкой — заметка в блоке', () => {
    expect(blockFromDraft({ categoryId: 'a', minutes: 30, date: TODAY, note: 'Толстой' }).note).toBe('Толстой')
  })
})

describe('кнопки у даты', () => {
  it('сегодня и вчера, через границу месяца', () => {
    expect(quickDates('2026-10-01')).toEqual([
      { label: 'сегодня', date: '2026-10-01' },
      { label: 'вчера', date: '2026-09-30' },
    ])
  })
})
