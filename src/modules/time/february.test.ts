import { describe, expect, it } from 'vitest'
import { monthPeriod } from '../../shared/core/dates.ts'
import { timeMarkdown } from './feed.ts'
import { importTime } from './import.ts'
import { formatMinutes } from './labels.ts'
import { periodSummary } from './period.ts'

/**
 * Сверка итога месяца на настоящем феврале — «Готово когда» Этапа 8.
 * Сумма по категориям сверена с таблицей до минуты (Журнал, 13.09.2026):
 * 211 ч 50 мин по 173 блокам, учёт во всех 28 днях.
 *
 * Файл личный и лежит в `seed/` под `.gitignore`: нет файла — тест
 * пропускается, на сборке в GitHub Actions его нет. Glob, а не `node:fs`:
 * типов Node в проекте нет, а пустой glob — это и есть «файла нет».
 */
const found = import.meta.glob<{ default: { time?: unknown } }>('../../../seed/deluvremya-import-2026-02.json', {
  eager: true,
})
const file = Object.values(found)[0]?.default

describe('настоящий февраль — Р-55', () => {
  it.skipIf(!file)('итог месяца по категориям — 211 ч 50 мин, 173 блока, 28 дней', () => {
    let next = 0
    const plan = importTime(
      file?.time,
      { categories: [], time: [] },
      { newId: () => `id${String(next++).padStart(4, '0')}`, now: '2026-09-14T10:00:00.000Z' },
    )
    const summary = periodSummary(plan.writes.time ?? [], plan.writes.categories ?? [], monthPeriod('2026-02'), '2026-09-14')

    expect(plan.issues).toEqual([])
    expect(formatMinutes(summary.total)).toBe('211 ч 50 мин')
    expect(summary.byCategory.reduce((sum, row) => sum + row.minutes, 0)).toBe(summary.total)
    expect(summary.count).toBe(173)
    expect(summary.days).toBe(28)
  })

  it.skipIf(!file)('в markdown — тот же итог и строка на каждый из 28 дней — Р-63', () => {
    let next = 0
    const plan = importTime(
      file?.time,
      { categories: [], time: [] },
      { newId: () => `id${String(next++).padStart(4, '0')}`, now: '2026-09-14T10:00:00.000Z' },
    )
    const text = timeMarkdown(plan.writes.time ?? [], plan.writes.categories ?? [], '2026-09-14')

    expect(text).toContain('### Февраль 2026')
    expect(text).toContain('Учтено 211 ч 50 мин · 173 блока · учёт был в 28 днях из 28')
    expect(text.split('\n').filter((line) => /^- \d\d\.02 — /.test(line))).toHaveLength(28)
  })
})
