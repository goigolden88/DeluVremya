import { weekPeriod, type DateStr } from '../../core/dates.ts'
import { estimateFactText, mainFactText, PLAN_FACT_BASIS, planFactText, repeatText } from './labels.ts'
import { planFact } from './period.ts'
import { useNotes } from './useNotes.ts'

/**
 * План против факта — шаг обзора недели (Р-44): сделано из намеченного,
 * позже своего дня, хвост; главное по дням; оценки; повторы пунктов.
 */
export function PlanWeek({ week, today }: { week: DateStr; today: DateStr }) {
  const read = useNotes()
  if (read.error) return <p className="error">Записи не прочитались: {read.error}</p>
  if (read.notes === null) return null

  const fact = planFact(read.notes, weekPeriod(week), today)
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
