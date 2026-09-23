import { describe, expect, it } from 'vitest'
import type { DayTemplate, Note } from '../../app/model.ts'
import { appliedText, itemsText, templateSavedLine } from './labels.ts'
import { dayPlan, MAX_ESTIMATE } from './plan.ts'
import {
  applyTemplate,
  createTemplate,
  draftOf,
  itemsFromPlan,
  moveDraftItem,
  moveTemplate,
  NAME_PROBLEM_TEXT,
  readDraft,
  templateNameProblem,
  templatesOf,
  withDraftMain,
  type ItemDraft,
} from './templates.ts'

const TODAY = '2026-09-14'
const TOMORROW = '2026-09-15'

function note(id: string, over: Partial<Note> = {}): Note {
  return {
    id,
    updatedAt: '2026-09-14T08:00:00.000Z',
    text: `пункт ${id}`,
    kind: 'task',
    capturedOn: '2026-09-10',
    plannedFor: TODAY,
    status: 'open',
    ...over,
  }
}

function template(id: string, over: Partial<DayTemplate> = {}): DayTemplate {
  return { id, updatedAt: '2026-09-14T08:00:00.000Z', name: `шаблон ${id}`, items: [], order: 0, ...over }
}

describe('шаблоны в порядке кнопок', () => {
  it('живые, по порядку, при равном — по названию', () => {
    const list = [
      template('a', { name: 'Выходной', order: 1 }),
      template('b', { name: 'Рабочий', order: 0 }),
      template('c', { name: 'Отпуск', order: 1 }),
      template('d', { order: 0, deleted: true }),
    ]
    expect(templatesOf(list).map((each) => each.name)).toEqual(['Рабочий', 'Выходной', 'Отпуск'])
  })

  it('новый — последним', () => {
    expect(createTemplate([], ' Рабочий ', []).order).toBe(0)
    const made = createTemplate([template('a', { order: 4 }), template('b', { order: 9, deleted: true })], 'Выходной', [])
    expect(made).toMatchObject({ name: 'Выходной', order: 5 })
  })
})

describe('название шаблона', () => {
  const list = [template('a', { name: 'Рабочий' })]

  it('пустое, длинное, занятое — с причиной; регистр не в счёт', () => {
    expect(templateNameProblem(list, '  ')).toBe('empty')
    expect(templateNameProblem(list, 'я'.repeat(31))).toBe('long')
    expect(templateNameProblem(list, ' рабочий ')).toBe('taken')
    expect(templateNameProblem(list, 'Выходной')).toBeNull()
  })

  it('своё название при правке не занято', () => {
    expect(templateNameProblem(list, 'Рабочий', 'a')).toBeNull()
  })
})

describe('шаблон из плана дня', () => {
  it('главное первым, дальше открытые и сделанные, с оценками', () => {
    const plan = dayPlan(
      [
        note('01', { text: 'Работа', estMin: 480 }),
        note('02', { text: 'Зарядка', estMin: 20, main: true }),
        note('03', { text: 'Звонок', status: 'done', doneOn: TODAY }),
      ],
      TODAY,
    )
    expect(itemsFromPlan(plan)).toEqual([
      { title: 'Зарядка', estMin: 20, main: true },
      { title: 'Работа', estMin: 480 },
      { title: 'Звонок' },
    ])
  })
})

describe('применение шаблона (Р-39)', () => {
  const workday = template('w', {
    name: 'Рабочий',
    items: [
      { title: 'Работа', estMin: 480 },
      { title: 'Зарядка', estMin: 20, main: true },
      { title: '  ' },
      { title: 'Дорога', estMin: 60 },
    ],
  })

  it('пункты — заметками на день, записаны сегодня, с оценкой и главным', () => {
    const { added, present } = applyTemplate(workday, [], TOMORROW, TODAY)
    expect(present).toBe(0)
    expect(added.map((each) => [each.text, each.estMin, each.main ?? false])).toEqual([
      ['Работа', 480, false],
      ['Зарядка', 20, true],
      ['Дорога', 60, false],
    ])
    expect(added.every((each) => each.plannedFor === TOMORROW && each.capturedOn === TODAY && each.kind === 'task')).toBe(true)
  })

  it('уже стоящее в этот день — открытое или сделанное — не ставится; регистр не в счёт', () => {
    const notes = [
      note('01', { text: 'работа' }),
      note('02', { text: 'Дорога', status: 'done', doneOn: TODAY }),
      note('03', { text: 'Зарядка', plannedFor: TOMORROW }),
      note('04', { text: 'Зарядка', deleted: true }),
    ]
    const { added, present } = applyTemplate(workday, notes, TODAY, TODAY)
    expect(added.map((each) => each.text)).toEqual(['Зарядка'])
    expect(present).toBe(2)
  })

  it('главное из шаблона — только если у дня главного нет', () => {
    const { added } = applyTemplate(workday, [note('01', { text: 'Своё', main: true })], TODAY, TODAY)
    expect(added.some((each) => each.main)).toBe(false)
  })

  it('кривая оценка из шаблона другого устройства не переносится', () => {
    const odd = template('o', { items: [{ title: 'Странное', estMin: 0 }, { title: 'Большое', estMin: MAX_ESTIMATE + 1 }] })
    expect(applyTemplate(odd, [], TODAY, TODAY).added.map((each) => 'estMin' in each)).toEqual([false, false])
  })
})

describe('правка шаблона', () => {
  const rows = (...titles: string[]): ItemDraft[] => titles.map((title) => ({ title, estimate: '', main: false }))

  it('черновик — оценка строкой поля', () => {
    expect(draftOf(template('a', { name: 'Рабочий', items: [{ title: 'Работа', estMin: 480, main: true }, { title: 'Обед' }] }))).toEqual({
      name: 'Рабочий',
      items: [
        { title: 'Работа', estimate: '480', main: true },
        { title: 'Обед', estimate: '', main: false },
      ],
    })
  })

  it('главное — одно: отметка снимает прежнюю, повторная — свою', () => {
    const one = withDraftMain(rows('а', 'б', 'в'), 0)
    const other = withDraftMain(one, 2)
    expect(other.map((each) => each.main)).toEqual([false, false, true])
    expect(withDraftMain(other, 2).map((each) => each.main)).toEqual([false, false, false])
  })

  it('пункт — на шаг выше или ниже; за край — без изменений', () => {
    expect(moveDraftItem(rows('а', 'б', 'в'), 2, -1).map((each) => each.title)).toEqual(['а', 'в', 'б'])
    expect(moveDraftItem(rows('а', 'б'), 0, -1).map((each) => each.title)).toEqual(['а', 'б'])
  })

  it('пустые строки выбрасываются, главное — первое отмеченное', () => {
    const draft = {
      name: ' Рабочий ',
      items: [
        { title: 'Работа', estimate: ' 480 ', main: true },
        { title: '  ', estimate: '10', main: false },
        { title: 'Обед', estimate: '', main: true },
      ],
    }
    expect(readDraft(draft, [], 'a')).toEqual({
      name: 'Рабочий',
      items: [{ title: 'Работа', estMin: 480, main: true }, { title: 'Обед' }],
    })
  })

  it('кривая оценка — причина с названием пункта; без пунктов и без названия — тоже причина', () => {
    const bad = { name: 'Рабочий', items: [{ title: 'Зарядка', estimate: '0', main: false }] }
    expect(readDraft(bad, [], 'a')).toEqual({ error: `«Зарядка»: оценка — целое число минут от 1 до ${MAX_ESTIMATE}` })
    expect(readDraft({ name: 'Рабочий', items: rows(' ') }, [], 'a')).toEqual({ error: 'В шаблоне нет ни одного пункта' })
    expect(readDraft({ name: '', items: rows('Работа') }, [], 'a')).toEqual({ error: NAME_PROBLEM_TEXT.empty })
  })
})

describe('тексты шаблонов', () => {
  it('применение — число с основанием', () => {
    expect(appliedText('Рабочий', 4, 0)).toBe('«Рабочий»: добавлено 4 из 4')
    expect(appliedText('Рабочий', 1, 3)).toBe('«Рабочий»: добавлено 1 из 4, уже было 3')
  })

  it('сохранение и число пунктов', () => {
    expect(itemsText(1)).toBe('1 пункт')
    expect(templateSavedLine('Рабочий', 3)).toBe('Шаблон «Рабочий» сохранён — 3 пункта')
  })
})

describe('порядок шаблонов — Р-75', () => {
  const tpl = (id: string, order: number): DayTemplate => ({
    id,
    updatedAt: '2026-09-14T08:00:00.000Z',
    name: id,
    items: [],
    order,
  })

  it('сдвиг нумерует живые подряд; крайний дальше не двигается', () => {
    const list = [tpl('a', 0), tpl('b', 1), tpl('c', 5)]
    expect(moveTemplate(list, 'c', -1).map((each) => [each.id, each.order])).toEqual([
      ['c', 1],
      ['b', 2],
    ])
    expect(moveTemplate(list, 'a', -1)).toEqual([])
  })
})

