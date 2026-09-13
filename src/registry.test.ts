import { describe, expect, it } from 'vitest'
import { IMPORT_FORMAT, IMPORT_VERSION, planTotal, type ImportPlan } from './core/importing.ts'
import { SYNCED_STORES } from './core/model.ts'
import { importPrompt, KIND_ORDER, KINDS, planImport, type Data } from './registry.ts'

// По образцу теста реестра «Дневников» с a913dcb: пример из промпта обязан
// проходить собственную проверку — описание и разбор не могут разойтись.

const at = '2026-09-13T10:00:00.000Z'

function empty(): Data {
  return Object.fromEntries(SYNCED_STORES.map((store) => [store, []])) as unknown as Data
}

describe('импорт записей', () => {
  let counter = 0
  const ctx = () => ({ newId: () => `n${++counter}`, now: at })

  /** Файл из примеров всех разделов — ровно то, что стоит в промпте. */
  function example(): Record<string, unknown> {
    const file: Record<string, unknown> = { format: IMPORT_FORMAT, version: IMPORT_VERSION }
    for (const kind of KIND_ORDER) {
      const entry = KINDS[kind].import
      if (entry) file[entry.spec.section] = entry.spec.example
    }
    return file
  }

  /** База после записи плана. */
  function applied(data: Data, plan: ImportPlan): Data {
    const next = { ...data } as Record<string, unknown[]>
    for (const [store, records] of Object.entries(plan.writes)) {
      next[store] = [...(next[store] ?? []), ...(records ?? [])]
    }
    return next as unknown as Data
  }

  it('формат — свой, не «Дневников»: базы на одном origin, файлы не должны путаться', () => {
    expect(IMPORT_FORMAT).toBe('deluvremya-import')
  })

  it('промпт называет разделы, формат, сегодняшнюю дату и приложение', () => {
    const prompt = importPrompt('2026-09-13')
    expect(prompt).toContain('"notes"')
    expect(prompt).toContain('"time"')
    expect(prompt).toContain('"format": "deluvremya-import"')
    expect(prompt).toContain('13.09.2026')
    expect(prompt).toContain('«Делу Время»')
    expect(prompt).not.toContain('Дневники')
  })

  it('пример из промпта проходит собственную проверку без единого замечания', () => {
    const plan = planImport(JSON.stringify(example()), empty(), ctx())
    expect(plan.issues).toEqual([])
    expect(plan.writes.notes?.length ?? 0).toBeGreaterThan(0)
    expect(plan.writes.time?.length ?? 0).toBeGreaterThan(0)
  })

  it('повторная загрузка того же файла ничего не удваивает', () => {
    const text = JSON.stringify(example())
    const first = planImport(text, empty(), ctx())
    const again = planImport(text, applied(empty(), first), ctx())
    expect(planTotal(again)).toBe(0)
    expect(again.skipped).toBeGreaterThan(0)
    expect(again.issues).toEqual([])
  })

  it('JSON в блоке ```json с текстом вокруг — как его отдаёт ИИ', () => {
    const text = `Вот файл:\n\`\`\`json\n${JSON.stringify(example())}\n\`\`\`\nНе разобрал: ничего.`
    expect(planImport(text, empty(), ctx()).issues).toEqual([])
  })

  it('незнакомый раздел — в отчёт, остальные разбираются', () => {
    const text = JSON.stringify({
      format: IMPORT_FORMAT,
      version: 1,
      food: [],
      time: [{ date: '2026-02-03', category: 'Чтение', minutes: 30 }],
    })
    const plan = planImport(text, empty(), ctx())
    expect(plan.issues.map((issue) => issue.section)).toEqual(['food'])
    expect(plan.writes.time).toHaveLength(1)
  })

  it('копию приложения отправляет к «Восстановить из копии»', () => {
    expect(() => planImport(JSON.stringify({ schemaVersion: 1, data: {} }), empty(), ctx())).toThrow(
      'Восстановить из копии',
    )
  })

  it('не JSON и чужой JSON, в том числе файл «Дневников», — внятный отказ', () => {
    expect(() => planImport('привет', empty(), ctx())).toThrow('не JSON')
    expect(() => planImport('{"time": []}', empty(), ctx())).toThrow('deluvremya-import')
    expect(() => planImport('{"format": "dnevniki-import", "items": []}', empty(), ctx())).toThrow(
      'deluvremya-import',
    )
  })
})

describe('реестр видов записей', () => {
  it('все три вида записи на месте, в порядке модели', () => {
    expect(KIND_ORDER).toEqual(['note', 'time', 'review'])
  })

  it('подписи видов не пустые', () => {
    for (const kind of KIND_ORDER) expect(KINDS[kind].label).not.toBe('')
  })
})
