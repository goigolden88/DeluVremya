import { describe, expect, it } from 'vitest'
import { filterFeed } from '../../shared/core/feed.ts'
import type { SpecialDays } from '../../app/model.ts'
import {
  checkSpecial,
  datesText,
  SPECIAL_LABEL,
  specialFeed,
  specialMarkdown,
  specialOn,
  specialProblemText,
  specialsIn,
  specialTitle,
} from './specials.ts'

const at = '2026-10-03T10:00:00.000Z'

function special(id: string, from: string, to: string, over: Partial<SpecialDays> = {}): SpecialDays {
  return { id, updatedAt: at, from, to, ...over }
}

const kazan = special('s1', '2026-10-05', '2026-10-07', { title: 'Поездка в Казань' })
const hike = special('s2', '2026-10-17', '2026-10-17', { title: 'Поход' })
const gone = special('s3', '2026-10-10', '2026-10-12', { deleted: true })

describe('какой период задевает день — Р-91', () => {
  it('первый, последний и средний день — особые; соседние — нет', () => {
    const all = [kazan, hike]
    expect(specialOn(all, '2026-10-05')).toBe(kazan)
    expect(specialOn(all, '2026-10-06')).toBe(kazan)
    expect(specialOn(all, '2026-10-07')).toBe(kazan)
    expect(specialOn(all, '2026-10-04')).toBeNull()
    expect(specialOn(all, '2026-10-08')).toBeNull()
    expect(specialOn(all, '2026-10-17')).toBe(hike)
  })

  it('удалённый период день не задевает', () => {
    expect(specialOn([gone], '2026-10-11')).toBeNull()
  })

  it('период с кривыми датами не задевает ничего, но и не роняет расчёт', () => {
    expect(specialOn([special('x', 'вчера', '2026-10-07')], '2026-10-06')).toBeNull()
    expect(specialOn([special('x', '2026-10-07', '2026-10-05')], '2026-10-06')).toBeNull()
  })

  it('промежуток: периоды, задевшие его хоть одним днём, по порядку дней', () => {
    const week = { from: '2026-10-05', to: '2026-10-11' }
    expect(specialsIn([hike, kazan, gone], week)).toEqual([kazan])
    // Период, начавшийся до недели и закончившийся в ней, — тоже задевает.
    const before = special('s4', '2026-09-30', '2026-10-05')
    expect(specialsIn([before], week)).toEqual([before])
    expect(specialsIn([before], { from: '2026-10-06', to: '2026-10-12' })).toEqual([])
  })
})

describe('правила периода — Р-91', () => {
  it('свободный период сохраняется', () => {
    expect(checkSpecial({ from: '2026-10-08', to: '2026-10-16' }, [kazan, hike])).toBeNull()
  })

  it('один день — «с» и «по» одинаковы', () => {
    expect(checkSpecial({ from: '2026-10-20', to: '2026-10-20' }, [kazan, hike])).toBeNull()
  })

  it('«по» раньше «с» — не сохраняется', () => {
    expect(checkSpecial({ from: '2026-10-09', to: '2026-10-08' }, [])).toEqual({ reason: 'order' })
  })

  it('без даты — не сохраняется', () => {
    expect(checkSpecial({ from: '', to: '2026-10-08' }, [])).toEqual({ reason: 'date' })
    expect(checkSpecial({ from: '2026-10-08', to: '2026-02-30' }, [])).toEqual({ reason: 'date' })
  })

  it('задевает другой период хоть одним днём — не сохраняется и называет его', () => {
    expect(checkSpecial({ from: '2026-10-07', to: '2026-10-09' }, [kazan, hike])).toEqual({
      reason: 'overlap',
      other: kazan,
    })
    expect(checkSpecial({ from: '2026-10-01', to: '2026-10-30' }, [hike, kazan])).toEqual({
      reason: 'overlap',
      other: kazan,
    })
    expect(checkSpecial({ from: '2026-10-06', to: '2026-10-06' }, [kazan])).toMatchObject({ reason: 'overlap' })
  })

  it('правка периода не спорит сама с собой', () => {
    expect(checkSpecial({ id: 's1', from: '2026-10-04', to: '2026-10-08' }, [kazan, hike])).toBeNull()
    expect(checkSpecial({ id: 's1', from: '2026-10-04', to: '2026-10-17' }, [kazan, hike])).toEqual({
      reason: 'overlap',
      other: hike,
    })
  })

  it('удалённый период не мешает', () => {
    expect(checkSpecial({ from: '2026-10-10', to: '2026-10-12' }, [gone])).toBeNull()
  })

  it('причина словами называет другой период', () => {
    expect(specialProblemText({ reason: 'overlap', other: kazan })).toBe(
      'Задевает другой период: «Поездка в Казань», 5–7 октября 2026, 3 дня.',
    )
    expect(specialProblemText({ reason: 'order' })).toContain('раньше')
  })
})

describe('подписи', () => {
  it('без названия и с пустым — «Особые дни»', () => {
    expect(specialTitle({})).toBe(SPECIAL_LABEL)
    expect(specialTitle({ title: '  ' })).toBe(SPECIAL_LABEL)
    expect(specialTitle({ title: ' Поход ' })).toBe('Поход')
  })

  it('даты: период с числом дней, один день — без него, кривые — как лежат', () => {
    expect(datesText(kazan)).toBe('5–7 октября 2026, 3 дня')
    expect(datesText(hike)).toBe('17 октября 2026')
    expect(datesText(special('x', '2026-09-28', '2026-10-02'))).toBe('28 сентября – 2 октября 2026, 5 дней')
    expect(datesText(special('x', 'вчера', 'сегодня'))).toBe('вчера – сегодня')
  })
})

describe('особые дни в ленте — Р-91', () => {
  it('строка в первый день периода: название и даты; тап — этот день на «Учёте»', () => {
    expect(specialFeed([kazan])).toEqual([
      {
        kind: 'special',
        id: 's1',
        date: '2026-10-05',
        title: 'Поездка в Казань',
        detail: '5–7 октября 2026, 3 дня',
        link: '/time?day=2026-10-05',
      },
    ])
  })

  it('без названия — «Особые дни»; удалённого нет', () => {
    const items = specialFeed([special('s5', '2026-11-01', '2026-11-02'), gone])
    expect(items.map((item) => item.title)).toEqual([SPECIAL_LABEL])
  })

  it('кривая дата — строкой как лежит, без перехода', () => {
    const [item] = specialFeed([special('x', 'вчера', 'вчера')])
    expect(item).toMatchObject({ date: 'вчера', detail: 'вчера' })
    expect(item).not.toHaveProperty('link')
  })

  it('ищется по названию и по дню начала', () => {
    const items = specialFeed([kazan, hike])
    expect(filterFeed(items, { query: 'казань' }).map((item) => item.id)).toEqual(['s1'])
    expect(filterFeed(items, { query: '17 октября' }).map((item) => item.id)).toEqual(['s2'])
  })
})

describe('особые дни в markdown — Р-91', () => {
  it('период строкой — даты и название, от старых к новым; удалённого нет', () => {
    expect(specialMarkdown([hike, gone, kazan])).toBe(
      ['- 5–7 октября 2026, 3 дня — Поездка в Казань', '- 17 октября 2026 — Поход'].join('\n'),
    )
  })

  it('без названия — одни даты: подпись уже в заголовке раздела', () => {
    expect(specialMarkdown([special('s5', '2026-11-01', '2026-11-02')])).toBe('- 1–2 ноября 2026, 2 дня')
  })

  it('название экранируется', () => {
    expect(specialMarkdown([special('s6', '2026-11-05', '2026-11-05', { title: '*Дача* #1' })])).toBe(
      '- 5 ноября 2026 — \\*Дача\\* \\#1',
    )
  })

  it('за период — каждый, задевший его хоть одним днём', () => {
    const before = special('s4', '2026-09-28', '2026-10-02', { title: 'Сплав' })
    const october = { from: '2026-10-01', to: '2026-10-31' }
    expect(specialMarkdown([before, kazan], october).split('\n')).toHaveLength(2)
    expect(specialMarkdown([before, kazan], { from: '2026-11-01', to: '2026-11-30' })).toBe('Записей нет.')
  })

  it('пусто — «Записей нет.»', () => {
    expect(specialMarkdown([])).toBe('Записей нет.')
  })
})
