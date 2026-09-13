import { weekStart, type DateStr } from '../../core/dates.ts'
import { Fold } from '../../ui/Fold.tsx'
import { checkText, progressLead } from './labels.ts'
import { weekProgress } from './period.ts'
import { useBlocks } from './useBlocks.ts'
import { useCatalog } from './useCatalog.ts'

/**
 * «Неделя» на экране учёта: как идут нормы «не меньше» с понедельника (Р-45).
 * Отклик на неделе, а не только в воскресенье. Пределы «не больше» здесь
 * не показываются — только в обзоре недели (Р-05).
 *
 * Норм нет — блока нет: считать не с чем.
 */
export function WeekProgress({ today }: { today: DateStr }) {
  const catalog = useCatalog()
  const time = useBlocks()
  if (catalog.status !== 'ready' || time.status !== 'ready') return null

  const rows = weekProgress(time.blocks, catalog.categories, today)
  if (rows.length === 0) return null
  const done = rows.filter((row) => row.checks.every((check) => check.met)).length

  return (
    <Fold id="time:week" title="Неделя" summary={`выполнено ${done} из ${rows.length}`}>
      <p className="muted">{progressLead(weekStart(today))}</p>
      <table className="stats">
        <tbody>
          {rows.map((row) => (
            <tr key={row.category.id}>
              <td>{row.category.name}</td>
              <td className="num">{row.checks.map(checkText).join(' · ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Fold>
  )
}
