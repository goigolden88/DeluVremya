import { describe, expect, it } from 'vitest'
import { buildSummary, checkSummary, type Metric, type PeriodSummary } from '../shared/core/summary.ts'
import type { Category, Note, Review, TimeBlock } from '../app/model.ts'
import { importTime } from '../modules/time/import.ts'
import { summary, type SummaryData } from './summary.ts'

const AT = '2026-09-20T10:00:00.000Z'
/** 21.09.2026 — понедельник: прошлая неделя 14–20 сентября кончилась вчера. */
const MONDAY = '2026-09-21'

function cat(id: string, name: string, order: number, extra: Partial<Category> = {}): Category {
  return { id, updatedAt: AT, name, order, kind: 'neutral', ...extra }
}

function block(id: string, categoryId: string, date: string, minutes: number, extra: Partial<TimeBlock> = {}): TimeBlock {
  return { id, updatedAt: AT, date, categoryId, minutes, ...extra }
}

function item(id: string, text: string, plannedFor: string, extra: Partial<Note> = {}): Note {
  return { id, updatedAt: AT, text, kind: 'task', capturedOn: plannedFor, plannedFor, status: 'open', ...extra }
}

function empty(): SummaryData {
  return { categories: [], presets: [], templates: [], notes: [], time: [], reviews: [] }
}

function data(extra: Partial<SummaryData> = {}): SummaryData {
  return {
    ...empty(),
    categories: [
      cat('cat:чтение', 'Чтение', 0, { group: 'Развитие', norm: { minDays: 2, since: '2026-09-01' } }),
      // Норма заведена в среду прошлой недели — эта неделя не судится (Р-56).
      cat('cat:ютуб', 'Ютуб', 1, { group: 'Развлечения', norm: { maxMinutes: 120, since: '2026-09-16' } }),
      cat('cat:покер', 'Покер', 2),
      cat('cat:шахматы', 'Шахматы', 3, { group: 'Развитие', norm: { minMinutes: 180, since: '2026-09-01' } }),
      cat('cat:старое', 'Старое', 4, { group: 'Архив', archived: true }),
    ],
    time: [
      block('1', 'cat:чтение', '2026-09-14', 30),
      block('2', 'cat:чтение', '2026-09-15', 30),
      block('3', 'cat:ютуб', '2026-09-15', 60, { bgCategoryId: 'cat:покер' }),
      block('4', 'cat:старое', '2026-09-16', 20),
      block('5', 'cat:шахматы', '2026-09-16', 40),
      block('6', 'cat:чтение', '2026-09-21', 25),
    ],
    notes: [
      item('n1', 'Позвонить маме', '2026-09-14', { status: 'done', doneOn: '2026-09-14', main: true, estMin: 15 }),
      item('n2', 'Отчёт Петрову', '2026-09-15', { status: 'done', doneOn: '2026-09-17', estMin: 60 }),
      item('n3', 'Купить лампу', '2026-09-16'),
      item('n4', 'Удалённый пункт', '2026-09-16', { deleted: true }),
      item('n5', 'Мысль без дня', '2026-09-16', { plannedFor: null, kind: 'thought', capturedOn: null }),
    ],
    ...extra,
  }
}

/** Срез через ядро — как его положит проход синхронизации. */
function sliced(input: SummaryData, day: string) {
  return checkSummary(buildSummary(summary(input, day), input, day))
}

function metrics(period: PeriodSummary | undefined): Metric[] {
  if (!period || !Array.isArray(period.metrics)) throw new Error('у отрезка нет показателей')
  return period.metrics
}

function byKey(period: PeriodSummary | undefined): Record<string, Metric> {
  return Object.fromEntries(metrics(period).map((metric) => [metric.key, metric]))
}

describe('срез итогов — форма договора', () => {
  it('проходит проверку ядра: четыре отрезка, у каждого показателя основание', () => {
    const result = sliced(data(), MONDAY)
    expect(result.periods.map((period) => [period.grain, period.from, period.to, period.through])).toEqual([
      ['week', '2026-09-14', '2026-09-20', null],
      ['week', '2026-09-21', '2026-09-27', MONDAY],
      ['month', '2026-08-01', '2026-08-31', null],
      ['month', '2026-09-01', '2026-09-30', MONDAY],
    ])
  })

  it('пустая база — тоже годный срез', () => {
    const result = sliced(empty(), MONDAY)
    expect(result.lastEdit).toBeNull()
    expect(byKey(result.periods[0])['time.total']?.value).toMatchObject({ unknown: 'no-data' })
  })

  it('те же данные в тот же день — побайтно тот же срез (Я-16 «FamilyCore»)', () => {
    expect(JSON.stringify(summary(data(), MONDAY))).toBe(JSON.stringify(summary(data(), MONDAY)))
  })
})

describe('время — по группам, фон отдельно (Р-43, Р-81)', () => {
  it('ключи прошлой недели по порядку: итог, группы, без группы, фон', () => {
    const keys = metrics(sliced(data(), MONDAY).periods[0])
      .map((metric) => metric.key)
      .filter((key) => key.startsWith('time.'))
    expect(keys).toEqual([
      'time.total',
      'time.group.развитие',
      'time.group.развлечения',
      'time.ungrouped',
      'time.background.ungrouped',
      'time.group.архив',
    ])
  })

  it('минуты и основание — «учёт в N днях из M»', () => {
    const week = byKey(sliced(data(), MONDAY).periods[0])
    expect(week['time.total']).toMatchObject({ value: { n: 180, unit: 'minutes' } })
    expect(week['time.total']?.basis).toContain('учёт в 3 днях из 7')
    expect(week['time.total']?.basis).toContain('фоновое в сумму не входит')
    expect(week['time.group.развитие']).toMatchObject({ label: 'Развитие', value: { n: 100, unit: 'minutes' } })
    expect(week['time.group.развитие']?.basis).toContain('3 блока в 3 днях')
    // Покер — только фоном: минут у «Без группы» ноль, фон назван отдельно.
    expect(week['time.ungrouped']).toMatchObject({ label: 'Без группы', value: { n: 0, unit: 'minutes' } })
    expect(week['time.background.ungrouped']).toMatchObject({ value: { n: 60, unit: 'minutes' } })
  })

  it('группа рабочих категорий без минут — строкой с нулём, а не пропадает', () => {
    const month = byKey(sliced(data(), MONDAY).periods[3])
    const week = byKey(sliced(data({ time: [block('1', 'cat:ютуб', '2026-09-15', 30)] }), MONDAY).periods[0])
    expect(month['time.group.развитие']?.value).toMatchObject({ n: 125 })
    expect(week['time.group.развитие']).toMatchObject({ value: { n: 0 } })
    expect(week['time.group.развитие']?.basis).toContain('блоков группы нет')
  })

  it('идущий отрезок — основание из прошедших дней', () => {
    const week = byKey(sliced(data(), MONDAY).periods[1])
    expect(week['time.total']?.basis).toContain('учёт в 1 дне из 1 прошедшего, отрезок — 7 дней')
  })

  it('отрезок без блоков — «не известно», а не ноль: не учитывал и не делал не различить', () => {
    const august = metrics(sliced(data(), MONDAY).periods[2])
    expect(august.filter((metric) => metric.key.startsWith('time.'))).toEqual([
      expect.objectContaining({ key: 'time.total', value: expect.objectContaining({ unknown: 'no-data' }) }),
    ])
  })

  it('без групп — только общий итог, как на экранах', () => {
    const plain = data({ categories: [cat('cat:чтение', 'Чтение', 0)] })
    const keys = metrics(sliced(plain, MONDAY).periods[0]).map((metric) => metric.key)
    expect(keys.filter((key) => key.startsWith('time.'))).toEqual(['time.total'])
  })

  it('разбивки по признаку и средних на день нет (Р-05, Р-55)', () => {
    const text = JSON.stringify(sliced(data(), MONDAY))
    expect(text).not.toMatch(/useful|idle|neutral|kind/)
    expect(text).not.toMatch(/в среднем|в день/)
  })
})

describe('план и факт — счёты без текстов (Я-14 «FamilyCore»)', () => {
  it('намечено, сделано, позже, ждут, главное, оценки', () => {
    const week = byKey(sliced(data(), MONDAY).periods[0])
    expect(week['plan.planned']?.value).toEqual({ n: 3, unit: 'count' })
    expect(week['plan.done']).toMatchObject({ value: { n: 2 }, basis: 'из 3 намеченных; из них 1 позже своего дня' })
    expect(week['plan.late']?.value).toEqual({ n: 1, unit: 'count' })
    expect(week['plan.waiting']?.value).toEqual({ n: 1, unit: 'count' })
    expect(week['plan.main']).toMatchObject({ value: { n: 1, unit: 'days' } })
    expect(week['plan.estimate']).toMatchObject({ value: { n: 75, unit: 'minutes' } })
    expect(week['plan.estimate']?.basis).toContain('из 75 мин по оценкам')
  })

  it('без пунктов — одна строка «намечено 0» с основанием', () => {
    const august = metrics(sliced(data(), MONDAY).periods[2]).filter((metric) => metric.key.startsWith('plan.'))
    expect(august).toEqual([
      { key: 'plan.planned', label: 'Намечено', value: { n: 0, unit: 'count' }, basis: 'Пунктов плана с днём в отрезке нет' },
    ])
  })

  it('без главного и без оценок — «не известно» с причиной', () => {
    const plain = data({ notes: [item('n1', 'Дело', '2026-09-14')] })
    const week = byKey(sliced(plain, MONDAY).periods[0])
    expect(week['plan.main']?.value).toMatchObject({ unknown: 'no-main' })
    expect(week['plan.estimate']?.value).toMatchObject({ unknown: 'no-estimates' })
  })

  it('ни текста пунктов, ни заметок в срезе нет', () => {
    const text = JSON.stringify(sliced(data(), MONDAY))
    for (const words of ['Позвонить маме', 'Петрову', 'лампу', 'Мысль']) expect(text).not.toContain(words)
  })
})

describe('нормы недели — вердиктом (Р-45, Р-56)', () => {
  it('прошлая неделя: выполнена, не выполнена, не полная с дня нормы', () => {
    const week = byKey(sliced(data(), MONDAY).periods[0])
    expect(week['norm.cat:чтение']).toMatchObject({ label: 'Норма: Чтение', value: { verdict: 'met' } })
    expect(week['norm.cat:чтение']?.basis).toContain('не меньше 2 дней')
    expect(week['norm.cat:шахматы']).toMatchObject({ value: { verdict: 'failed' } })
    expect(week['norm.cat:шахматы']?.basis).toContain('40 мин из 3 ч')
    expect(week['norm.cat:ютуб']?.value).toMatchObject({ unknown: 'norm-since' })
  })

  it('идущая неделя — «не ясно», досрочно не судится', () => {
    const over = data({ time: [block('1', 'cat:ютуб', MONDAY, 300)] })
    const week = byKey(sliced(over, MONDAY).periods[1])
    expect(week['norm.cat:ютуб']?.value).toEqual({ verdict: 'open' })
    expect(week['norm.cat:ютуб']?.basis).toContain('неделя идёт: прошло 1 день из 7')
    expect(week['norm.cat:чтение']?.value).toEqual({ verdict: 'open' })
  })

  it('неделя раньше начала учёта — «не известно», а не провал', () => {
    const late = data({ time: [block('1', 'cat:чтение', MONDAY, 30)] })
    expect(byKey(sliced(late, MONDAY).periods[0])['norm.cat:чтение']?.value).toMatchObject({ unknown: 'no-data' })
  })

  it('у месяца норм нет: в составе договора — только неделя', () => {
    for (const month of [2, 3]) {
      expect(metrics(sliced(data(), MONDAY).periods[month]).some((metric) => metric.key.startsWith('norm.'))).toBe(false)
    }
  })

  it('ключ нормы — id категории: переименование его не меняет', () => {
    const renamed = data()
    renamed.categories = renamed.categories.map((each) => (each.id === 'cat:чтение' ? { ...each, name: 'Книги' } : each))
    expect(byKey(sliced(renamed, MONDAY).periods[0])['norm.cat:чтение']?.label).toBe('Норма: Книги')
  })
})

describe('требует внимания — обзор прошлой недели (Я-18, Я-20 «FamilyCore»)', () => {
  const review: Review = { id: 'review:2026-09-14', updatedAt: AT, weekStart: '2026-09-14', doneAt: AT }

  it('в понедельник без обзора — пункт с воскресеньем недели и основанием', () => {
    expect(sliced(data(), MONDAY).attention).toEqual([
      {
        key: 'review',
        label: 'Обзор недели не проведён',
        count: null,
        day: '2026-09-20',
        link: '/review?week=2026-09-14',
        basis: expect.stringContaining('Записи обзора за неделю 14–20 сентября 2026 нет'),
      },
    ])
  })

  it('обзор проведён — пусто', () => {
    expect(sliced(data({ reviews: [review] }), MONDAY).attention).toEqual([])
  })

  it('в воскресенье неделя не кончилась, со вторника приложение не зовёт — пусто (Р-41, Р-51)', () => {
    expect(sliced(data(), '2026-09-20').attention).toEqual([])
    expect(sliced(data(), '2026-09-22').attention).toEqual([])
  })
})

/**
 * Настоящий февраль (`seed/`, под `.gitignore`; нет файла — пропуск, как
 * в `february.test.ts`): сверенный с таблицей итог месяца доезжает в срез.
 */
const found = import.meta.glob<{ default: { time?: unknown } }>('../../seed/deluvremya-import-2026-02.json', {
  eager: true,
})
const february = Object.values(found)[0]?.default

describe('настоящий февраль в срезе', () => {
  it.skipIf(!february)('прошлый месяц на 2 марта — 211 ч 50 мин, учёт в 28 днях из 28', () => {
    let next = 0
    const plan = importTime(
      february?.time,
      { categories: [], time: [] },
      { newId: () => `id${String(next++).padStart(4, '0')}`, now: '2026-09-14T10:00:00.000Z' },
    )
    const input = { ...empty(), categories: plan.writes.categories ?? [], time: plan.writes.time ?? [] }
    const month = byKey(sliced(input, '2026-03-02').periods[2])
    expect(month['time.total']?.value).toEqual({ n: 211 * 60 + 50, unit: 'minutes' })
    expect(month['time.total']?.basis).toContain('учёт в 28 днях из 28')
  })
})
