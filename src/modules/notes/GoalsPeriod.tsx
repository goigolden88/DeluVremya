import { Link } from 'react-router-dom'
import type { Period } from '../../shared/core/dates.ts'
import { goalLink, goalTitle } from './goal.ts'
import { goalsPeriod } from './goalPeriod.ts'
import {
  GOALS_PERIOD_BASIS,
  GOALS_PERIOD_TITLE,
  goalMoveText,
  goalsStillText,
  goalsUndatedText,
} from './labels.ts'
import { useNotes } from './useNotes.ts'

/**
 * Блок «Замыслы» обзора недели и итогов месяца (Р-104): по каждому замыслу
 * с движением за промежуток — сделано и записано, тап — экран замысла.
 * Замыслов нет совсем — блока нет. `span` — «неделю», «месяц»: для строки
 * «движения нет».
 */
export function GoalsPeriod({ period, span }: { period: Period; span: string }) {
  const read = useNotes()
  if (read.error) {
    return (
      <section className="block">
        <h2>{GOALS_PERIOD_TITLE}</h2>
        <p className="error">Записи не прочитались: {read.error}</p>
      </section>
    )
  }
  if (read.notes === null) return null

  const result = goalsPeriod(read.notes, period)
  if (result.goals === 0) return null

  return (
    <section className="block">
      <h2>{GOALS_PERIOD_TITLE}</h2>
      {result.moves.length === 0 ? (
        <p className="muted">{goalsStillText(span)}</p>
      ) : (
        <ul className="plain">
          {result.moves.map((move) => (
            <li key={move.goal.id}>
              <Link to={goalLink(move.goal.id)}>{goalTitle(move.goal)}</Link>{' '}
              <span className="muted">— {goalMoveText(move)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted">{GOALS_PERIOD_BASIS}</p>
      {result.undated > 0 && <p className="muted">{goalsUndatedText(result.undated)}</p>}
    </section>
  )
}
