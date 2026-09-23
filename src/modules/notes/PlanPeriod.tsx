import type { DateStr, Period } from '../../shared/core/dates.ts'
import { estimateFactText, mainFactText, PLAN_FACT_BASIS, planFactText, repeatText } from './labels.ts'
import { planFact } from './period.ts'
import { useNotes } from './useNotes.ts'

/**
 * План против факта за промежуток (Р-44) — шаг обзора недели и блок итогов
 * месяца и года (Р-55, Р-57): сделано из намеченного, позже своего дня,
 * хвост; главное по дням; оценки; повторы пунктов.
 */
export function PlanPeriod({ period, today }: { period: Period; today: DateStr }) {
  const read = useNotes()
  if (read.error) return <p className="error">Записи не прочитались: {read.error}</p>
  if (read.notes === null) return null

  const fact = planFact(read.notes, period, today)
  const estimate = estimateFactText(fact)

  return (
    <div className="day-sum">
      <p className="lead">{planFactText(fact)}</p>
      {fact.planned > 0 && (
        <>
          <p className="muted">{PLAN_FACT_BASIS}</p>
          <p>{mainFactText(fact)}</p>
          {estimate && <p>{estimate}</p>}
        </>
      )}
      {fact.repeats.length > 0 && (
        <>
          <h3 className="unit__name">Повторы</h3>
          <ul className="plain">
            {fact.repeats.map((repeat) => (
              <li key={repeat.text}>{repeatText(repeat)}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
