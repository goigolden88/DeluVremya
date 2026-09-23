import { describe, expect, it } from 'vitest'
import type { Note } from '../../app/model.ts'
import { isUnsorted } from './inbox.ts'
import {
  ahead,
  dayPlan,
  doneOffPlan,
  mainOf,
  makeMain,
  movePlanItem,
  MAX_ESTIMATE,
  overdue,
  planLoad,
  planNote,
  plannedCount,
  readEstimate,
  realism,
  withEstimate,
  withoutMain,
  withPlan,
} from './plan.ts'

const TODAY = '2026-09-14'
const YESTERDAY = '2026-09-13'
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

const ids = (list: readonly Note[]) => list.map((each) => each.id)

describe('пункт с экрана дня', () => {
  it('дело, записано сегодня, стоит на выбранный день', () => {
    expect(planNote('  позвонить  ', TODAY, TOMORROW)).toMatchObject({
      text: 'позвонить',
      kind: 'task',
      capturedOn: TODAY,
      plannedFor: TOMORROW,
      status: 'open',
    })
  })

  it('пустое не записывается', () => {
    expect(planNote('  ', TODAY, TODAY)).toBeNull()
  })
})

describe('план дня', () => {
  it('только пункты этого дня — живые, открытые и сделанные, в порядке добавления', () => {
    const notes = [
      note('03'),
      note('01'),
      note('02', { status: 'done', doneOn: TODAY }),
      note('04', { plannedFor: TOMORROW }),
      note('05', { plannedFor: null }),
      note('06', { deleted: true }),
      note('07', { status: 'someday' }),
    ]
    const plan = dayPlan(notes, TODAY)
    expect(ids(plan.all)).toEqual(['01', '02', '03'])
    expect(ids(plan.open)).toEqual(['01', '03'])
    expect(ids(plan.done)).toEqual(['02'])
    expect(plan.main).toBeNull()
  })

  it('главное — отдельно от списков, даже сделанное', () => {
    const plan = dayPlan([note('01'), note('02', { main: true, status: 'done', doneOn: TODAY })], TODAY)
    expect(plan.main?.id).toBe('02')
    expect(ids(plan.open)).toEqual(['01'])
    expect(plan.done).toEqual([])
  })
})

describe('главное дело — одно (Р-40)', () => {
  it('два отмеченных — главное позднее по времени правки, второе — обычный пункт', () => {
    const early = note('02', { main: true, updatedAt: '2026-09-14T08:00:00.000Z' })
    const late = note('01', { main: true, updatedAt: '2026-09-14T09:00:00.000Z' })
    expect(mainOf([early, late])?.id).toBe('01')
    expect(ids(dayPlan([early, late], TODAY).open)).toEqual(['02'])
  })

  it('при равном времени правки — по id: оба устройства ответят одинаково', () => {
    expect(mainOf([note('01', { main: true }), note('02', { main: true })])?.id).toBe('02')
  })

  it('отметка снимает главное с прежних пунктов дня', () => {
    const items = [note('01', { main: true }), note('02'), note('03', { main: true })]
    const writes = makeMain(items[1] as Note, items)
    expect(writes.map((each) => [each.id, each.main ?? false])).toEqual([
      ['02', true],
      ['01', false],
      ['03', false],
    ])
    expect('main' in (writes[1] as Note)).toBe(false)
  })

  it('снять отметку — поля нет вовсе', () => {
    expect('main' in withoutMain(note('01', { main: true }))).toBe(false)
  })
})

describe('перенос и возврат (Р-34)', () => {
  it('на другой день — главное снимается', () => {
    const moved = withPlan(note('01', { main: true }), TOMORROW)
    expect(moved.plannedFor).toBe(TOMORROW)
    expect(moved.main).toBeUndefined()
  })

  it('в неразобранное — снова лежит там', () => {
    const back = withPlan(note('01'), null)
    expect(back.plannedFor).toBeNull()
    expect(isUnsorted(back)).toBe(true)
  })

  it('день записи не меняется: мысль из марта остаётся мартовской', () => {
    expect(withPlan(note('01', { capturedOn: '2026-03-01' }), TOMORROW).capturedOn).toBe('2026-03-01')
  })
})

describe('оценка', () => {
  it('из поля — целые минуты; пусто — без оценки', () => {
    expect(readEstimate(' 45 ')).toEqual({ minutes: 45 })
    expect(readEstimate('')).toEqual({ minutes: null })
    expect(readEstimate(String(MAX_ESTIMATE))).toEqual({ minutes: MAX_ESTIMATE })
  })

  it('кривое — причина с пределами', () => {
    for (const bad of ['0', '-5', '1.5', '1,5', 'час', String(MAX_ESTIMATE + 1)]) {
      expect(readEstimate(bad)).toEqual({ error: `Оценка — целое число минут от 1 до ${MAX_ESTIMATE}` })
    }
  })

  it('убрать оценку — поля нет вовсе', () => {
    expect(withEstimate(note('01'), 30).estMin).toBe(30)
    expect('estMin' in withEstimate(note('01', { estMin: 30 }), null)).toBe(false)
  })
})

describe('с прошлых дней (Р-34)', () => {
  it('открытые пункты прошедших дней, старые сверху; сделанные и сегодняшние — нет', () => {
    const notes = [
      note('01', { plannedFor: YESTERDAY }),
      note('02', { plannedFor: '2026-09-10' }),
      note('03', { plannedFor: YESTERDAY, status: 'done', doneOn: YESTERDAY }),
      note('04'),
      note('05', { plannedFor: '2026-09-11', deleted: true }),
      note('06', { plannedFor: null }),
    ]
    expect(ids(overdue(notes, TODAY))).toEqual(['02', '01'])
  })

  it('кривая дата плана не пропадает — она в хвосте', () => {
    expect(ids(overdue([note('01', { plannedFor: '14.09' })], TODAY))).toEqual(['01'])
  })
})

describe('впереди (Р-37)', () => {
  it('открытые пункты будущих дней по дням, ближние сверху', () => {
    const notes = [
      note('01', { plannedFor: '2026-09-20' }),
      note('02', { plannedFor: TOMORROW }),
      note('03', { plannedFor: TOMORROW }),
      note('04'),
      note('05', { plannedFor: TOMORROW, status: 'done', doneOn: TODAY }),
    ]
    expect(ahead(notes, TODAY).map((group) => [group.day, ids(group.notes)])).toEqual([
      [TOMORROW, ['02', '03']],
      ['2026-09-20', ['01']],
    ])
  })
})

describe('сделано вне плана', () => {
  it('сделанное сегодня не из сегодняшнего плана: из заметок, из хвоста, заранее', () => {
    const notes = [
      note('01', { plannedFor: null, status: 'done', doneOn: TODAY }),
      note('02', { plannedFor: YESTERDAY, status: 'done', doneOn: TODAY }),
      note('03', { plannedFor: TOMORROW, status: 'done', doneOn: TODAY }),
      note('04', { status: 'done', doneOn: TODAY }),
      note('05', { plannedFor: null, status: 'done', doneOn: YESTERDAY }),
    ]
    expect(ids(doneOffPlan(notes, TODAY))).toEqual(['01', '02', '03'])
  })

  it('сколько открытого стоит в плане на любой день', () => {
    const notes = [note('01'), note('02', { plannedFor: TOMORROW }), note('03', { plannedFor: null }), note('04', { status: 'done' })]
    expect(plannedCount(notes)).toBe(2)
  })
})

describe('реализм (Р-35)', () => {
  it('сумма оценок открытых пунктов — по скольким из скольких', () => {
    const items = [
      note('01', { estMin: 60, main: true }),
      note('02', { estMin: 30 }),
      note('03'),
      note('04', { estMin: 90, status: 'done' }),
    ]
    expect(planLoad(items)).toEqual({ minutes: 90, estimated: 2, total: 3 })
  })

  it('не влезает — на сколько; влезает — ноль', () => {
    const items = [note('01', { estMin: 300 }), note('02', { estMin: 120 })]
    expect(realism(items, 360)).toMatchObject({ minutes: 420, left: 360, over: 60 })
    expect(realism(items, 600)?.over).toBe(0)
  })

  it('открытых пунктов нет — говорить не о чем', () => {
    expect(realism([], 600)).toBeNull()
    expect(realism([note('01', { status: 'done', estMin: 30 })], 600)).toBeNull()
  })
})

describe('порядок пунктов дня — Р-75', () => {
  it('с order — по нему, без — после, по времени добавления', () => {
    const notes = [note('01'), note('02', { order: 1 }), note('03', { order: 0 }), note('04')]
    expect(dayPlan(notes, TODAY).open.map((each) => each.id)).toEqual(['03', '02', '01', '04'])
  })

  it('сдвиг нумерует пункты дня подряд; крайний дальше не двигается', () => {
    const list = [note('01'), note('02'), note('03')]
    expect(movePlanItem(list, '03', -1).map((each) => [each.id, each.order])).toEqual([
      ['01', 0],
      ['03', 1],
      ['02', 2],
    ])
    expect(movePlanItem(list, '01', -1)).toEqual([])
  })

  it('перенос и возврат снимают место в дне', () => {
    expect(withPlan(note('01', { order: 2 }), TOMORROW)).not.toHaveProperty('order')
    expect(withPlan(note('01', { order: 2 }), null)).not.toHaveProperty('order')
  })
})

