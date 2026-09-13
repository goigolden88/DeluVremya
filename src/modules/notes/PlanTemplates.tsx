import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { DateStr } from '../../core/dates.ts'
import { db } from '../../core/db.ts'
import type { DayTemplate, Note } from '../../core/model.ts'
import { Fold } from '../../ui/Fold.tsx'
import { appliedText, templateSavedLine, TEMPLATES_TITLE } from './labels.ts'
import type { DayPlan } from './plan.ts'
import {
  applyTemplate,
  createTemplate,
  itemsFromPlan,
  NAME_PROBLEM_TEXT,
  templateNameProblem,
  templatesOf,
} from './templates.ts'
import { useTemplates } from './useTemplates.ts'

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/**
 * Шаблоны на «Сегодня» (Р-39): тап по названию ставит пункты шаблона
 * в сегодняшний план, «Сохранить план как шаблон» заводит новый из того,
 * что уже собрано. Правка — на экране шаблонов.
 */
export function PlanTemplates({ notes, plan, today }: { notes: readonly Note[]; plan: DayPlan; today: DateStr }) {
  const read = useTemplates()
  const [name, setName] = useState('')
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')
  /** Последнее применение — его снимает «Отменить». */
  const [applied, setApplied] = useState<{ name: string; ids: string[]; present: number } | null>(null)
  const list = templatesOf(read.templates ?? [])

  async function apply(template: DayTemplate) {
    setError('')
    setSaved('')
    const result = applyTemplate(template, notes, today, today)
    try {
      await db.putMany('notes', result.added)
      setApplied({ name: template.name, ids: result.added.map((each) => each.id), present: result.present })
    } catch (failure) {
      setError(describe(failure))
    }
  }

  // Снимает поставленное шаблоном — надгробиями, в нынешнем виде пунктов.
  async function undo() {
    if (!applied) return
    setError('')
    const ids = new Set(applied.ids)
    try {
      await db.putMany(
        'notes',
        notes.filter((each) => ids.has(each.id)).map((each) => ({ ...each, deleted: true })),
      )
      setApplied(null)
    } catch (failure) {
      setError(describe(failure))
    }
  }

  async function saveAsTemplate() {
    setSaved('')
    const problem = templateNameProblem(list, name)
    if (problem) {
      setError(NAME_PROBLEM_TEXT[problem])
      return
    }
    setError('')
    const items = itemsFromPlan(plan)
    try {
      await db.put('templates', createTemplate(list, name, items))
      setSaved(templateSavedLine(name.trim(), items.length))
      setName('')
    } catch (failure) {
      setError(describe(failure))
    }
  }

  return (
    <Fold id="today:templates" title={TEMPLATES_TITLE} summary={list.length > 0 ? list.length : undefined}>
      {read.error && <p className="error">Шаблоны не прочитались: {read.error}</p>}
      {list.length > 0 && (
        <div className="chips" role="group" aria-label="Поставить шаблон в план">
          {list.map((template) => (
            <button key={template.id} type="button" className="chip" onClick={() => void apply(template)}>
              {template.name}
            </button>
          ))}
        </div>
      )}
      {applied && (
        <p className="added">
          <span>{appliedText(applied.name, applied.ids.length, applied.present)}</span>
          {applied.ids.length > 0 && (
            <button type="button" className="link-btn" onClick={() => void undo()}>
              Отменить
            </button>
          )}
        </p>
      )}

      <form
        className="row plan__add"
        onSubmit={(event) => {
          event.preventDefault()
          void saveAsTemplate()
        }}
      >
        <input
          name="template-new"
          placeholder="Название шаблона"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" className="btn" disabled={plan.all.length === 0 || !name.trim()}>
          Сохранить план как шаблон
        </button>
      </form>
      {plan.all.length === 0 && list.length === 0 && (
        <p className="muted">Шаблон заводится из готового плана: соберите обычный день и сохраните его здесь.</p>
      )}
      {saved && <p className="muted">{saved}</p>}
      {error && <p className="error">{error}</p>}
      {list.length > 0 && (
        <p>
          <Link to="/templates">Править шаблоны →</Link>
        </p>
      )}
    </Fold>
  )
}
