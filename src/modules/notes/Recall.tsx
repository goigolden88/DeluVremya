import type { DateStr } from '../../core/dates.ts'
import { RECALL_EMPTY, recallTitle } from './labels.ts'
import { recall } from './review.ts'
import { useNotes } from './useNotes.ts'

/**
 * Возврат мыслей — шаг обзора недели (Р-49, Р-04): мысли, записанные
 * в ту же неделю месяц и три месяца назад. Единственное, ради чего мысль
 * стоит вести здесь, а не в блокноте.
 */
export function RecallWeeks({ week }: { week: DateStr }) {
  const read = useNotes()
  if (read.error) return <p className="error">Записи не прочитались: {read.error}</p>
  if (read.notes === null) return null

  return (
    <>
      {recall(read.notes, week).map((each) => (
        <div key={each.weeksAgo} className="month-group">
          <h3 className="unit__name">{recallTitle(each.weeksAgo, each.period)}</h3>
          {each.notes.length === 0 ? (
            <p className="muted">{RECALL_EMPTY}</p>
          ) : (
            <ul className="plain">
              {each.notes.map((note) => (
                <li key={note.id} className="recall">
                  {note.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </>
  )
}
