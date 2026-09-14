import { weekPeriod, weekStart, type DateStr } from '../../core/dates.ts'
import { Fold } from '../../ui/Fold.tsx'
import { quoted } from '../../ui/screenNames.ts'
import { useScreenNames } from '../../ui/useScreenNames.ts'
import {
  backgroundText,
  checkText,
  formatMinutes,
  keptText,
  kindLine,
  periodLine,
  progressLead,
  UNKNOWN_CATEGORY,
} from './labels.ts'
import { periodSummary, weekNorms, weekProgress } from './period.ts'
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

/** Ошибка чтения — словами; ещё не прочитано — ничего. */
function Unready({ catalog, time }: { catalog: ReturnType<typeof useCatalog>; time: ReturnType<typeof useBlocks> }) {
  if (catalog.status === 'failed') return <p className="error">Категории не прочитались: {catalog.error}</p>
  if (time.status === 'failed') return <p className="error">Блоки времени не прочитались: {time.error}</p>
  return null
}

/**
 * Время недели — шаг обзора. Сумма с основанием, категории в своём порядке,
 * фоновое у категории отдельно и в сумму не входит (Р-43), разбивка по
 * признаку — только здесь, дневной экран им не красится (Р-05).
 */
export function WeekTime({ week, today }: { week: DateStr; today: DateStr }) {
  const catalog = useCatalog()
  const time = useBlocks()
  if (catalog.status !== 'ready' || time.status !== 'ready') return <Unready catalog={catalog} time={time} />

  const summary = periodSummary(time.blocks, catalog.categories, weekPeriod(week), today)
  const withBackground = summary.byCategory.some((row) => row.background > 0)

  return (
    <div className="day-sum">
      <p className="lead">{periodLine(summary)}</p>
      {summary.byCategory.length > 0 && (
        <table className="stats">
          <tbody>
            {summary.byCategory.map((row) => (
              <tr key={row.categoryId}>
                <td>
                  {row.name ?? UNKNOWN_CATEGORY}
                  {row.background > 0 && <span className="muted"> · {backgroundText(row.background)}</span>}
                </td>
                <td className="num">{row.minutes > 0 ? formatMinutes(row.minutes) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {withBackground && <p className="muted">Фоновое в сумму не входит: час ютуба под покер — один час.</p>}
      {summary.byKind.length > 0 && <p className="muted">По признаку: {kindLine(summary.byKind)}</p>}
    </div>
  )
}

/**
 * Нормы недели — шаг обзора (Р-45): каждое правило с основанием, вместо
 * серии — в скольких из последних недель выполнена. Пределы видны здесь.
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
          row.weeks > 0 ? keptText(row.kept, row.weeks) : null,
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
