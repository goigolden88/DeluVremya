import { weekStart, type DateStr } from '../../core/dates.ts'
import { Fold } from '../../ui/Fold.tsx'
import { quoted } from '../../ui/screenNames.ts'
import { useScreenNames } from '../../ui/useScreenNames.ts'
import { backgroundText, checkText, historyText, progressLead } from './labels.ts'
import { weekNorms, weekProgress } from './period.ts'
import { Unready } from './Period.tsx'
import { useBlocks } from './useBlocks.ts'
import { useCatalog } from './useCatalog.ts'

/**
 * «Неделя» на экране учёта: как идут нормы «не меньше» с понедельника (Р-45).
 * Отклик на неделе, а не только в воскресенье. Пределы «не больше» здесь
 * не показываются — только в обзоре недели (Р-05).
 *
 * Норм нет — блока нет: считать не с чем. Свёрнут, пока не развернули:
 * экран учёта и так длинный, а итог «выполнено N из M» виден и у свёрнутого.
 */
export function WeekProgress({ today }: { today: DateStr }) {
  const catalog = useCatalog()
  const time = useBlocks()
  if (catalog.status !== 'ready' || time.status !== 'ready') return null

  const rows = weekProgress(time.blocks, catalog.categories, today)
  if (rows.length === 0) return null
  const done = rows.filter((row) => row.checks.every((check) => check.met)).length

  return (
    <Fold id="time:week" title="Неделя" summary={`выполнено ${done} из ${rows.length}`} folded>
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

/**
 * Нормы недели — шаг обзора (Р-45): каждое правило с основанием, вместо
 * серии — в скольких из последних недель выполнена, а пока недель в счёт
 * мало — с какого дня норма (Р-56). Пределы видны здесь.
 */
export function WeekNorms({ week, today }: { week: DateStr; today: DateStr }) {
  const catalog = useCatalog()
  const time = useBlocks()
  const names = useScreenNames()
  if (catalog.status !== 'ready' || time.status !== 'ready') return <Unready catalog={catalog} time={time} />

  const rows = weekNorms(time.blocks, catalog.categories, week, today)
  if (rows.length === 0) {
    return (
      <p className="muted">
        Норм нет. Норма ставится в карточке категории — экран {quoted(names.time)} → ☰.
      </p>
    )
  }

  return (
    <ul className="plain">
      {rows.map((row) => {
        const notes = [
          historyText(row.history),
          row.background > 0 ? `${backgroundText(row.background)} — в норму не входит` : null,
        ].filter((each): each is string => each !== null)
        return (
          <li key={row.category.id} className="tblock__main">
            <p>
              {row.category.name}: {row.checks.map(checkText).join(' · ')}
            </p>
            {notes.length > 0 && <p className="muted">{notes.join(' · ')}</p>}
          </li>
        )
      })}
    </ul>
  )
}
