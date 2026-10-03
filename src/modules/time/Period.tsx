import { Fragment } from 'react'
import { formatPeriod, type DateStr, type Period } from '../../shared/core/dates.ts'
import { Fold } from '../../shared/ui/Fold.tsx'
import { quoted } from '../../ui/screenNames.ts'
import { useScreenNames } from '../../ui/useScreenNames.ts'
import {
  backgroundText,
  categoriesLine,
  formatMinutes,
  historyText,
  kindLine,
  lowerFirst,
  MARKS_BASIS,
  marksLine,
  NO_GROUP,
  normText,
  periodLine,
  specialMarksText,
  UNKNOWN_CATEGORY,
  YEAR_NORMS_BASIS,
} from './labels.ts'
import { byGroup, groupMinutes, hasGroups } from './groups.ts'
import { compareRows, periodNorms, periodSummary, specialTime, type SpecialTime } from './period.ts'
import { datesText, specialTitle } from './specials.ts'
import { useBlocks } from './useBlocks.ts'
import { useCatalog } from './useCatalog.ts'
import { useSpecials, type Specials } from './useSpecials.ts'

/** Ошибка чтения — словами; ещё не прочитано — ничего. */
export function Unready({
  catalog,
  time,
  specials,
}: {
  catalog: ReturnType<typeof useCatalog>
  time: ReturnType<typeof useBlocks>
  specials?: Specials
}) {
  if (catalog.status === 'failed') return <p className="error">Категории не прочитались: {catalog.error}</p>
  if (time.status === 'failed') return <p className="error">Блоки времени не прочитались: {time.error}</p>
  if (specials?.status === 'failed') return <p className="error">Особые дни не прочитались: {specials.error}</p>
  return null
}

/** Всё прочитано: категории, блоки, особые дни. */
export function ready(
  catalog: ReturnType<typeof useCatalog>,
  time: ReturnType<typeof useBlocks>,
  specials: Specials,
): boolean {
  return catalog.status === 'ready' && time.status === 'ready' && specials.status === 'ready'
}

/**
 * Блок «Особые дни» под итогом (Р-91): каждый период, задевший промежуток, —
 * название, даты, учтено и категории за его дни внутри промежутка. Периодов
 * нет — блока нет.
 */
export function SpecialTimeList({ rows }: { rows: readonly SpecialTime[] }) {
  if (rows.length === 0) return null
  return (
    <Fold id="time:specials" title="Особые дни" summary={rows.length} sub>
      <ul className="plain">
        {rows.map(({ special, period, summary }) => {
          const whole = special.from === period.from && special.to === period.to
          const line = summary.elapsedDays === 0 ? 'Ещё не наступили' : periodLine(summary)
          const categories = categoriesLine(summary.byCategory)
          return (
            <li key={special.id} className="tblock__main">
              <p>
                {specialTitle(special)} · {datesText(special)}
              </p>
              <p className="muted">{whole ? line : `${formatPeriod(period)}: ${lowerFirst(line)}`}</p>
              {categories && <p className="muted">{categories}</p>}
            </li>
          )
        })}
      </ul>
      <p className="muted">В итог выше особые дни не входят: он — по обычным дням.</p>
    </Fold>
  )
}

/** Прежний промежуток для сравнения и подписи столбцов. */
export type Compare = { period: Period; label: string; own: string }

/**
 * Время промежутка — шаг обзора недели и блок итогов месяца. Сумма
 * с основанием, категории в своём порядке, фоновое у категории отдельно
 * и в сумму не входит (Р-43), разбивка по признаку — только в обзорах,
 * дневной экран им не красится (Р-05).
 *
 * `compare` — второй столбец: прежний промежуток со своим основанием,
 * без пересчёта на день (Р-55).
 *
 * Итог и сравнение — по обычным дням с обеих сторон; особые — ниже, своим
 * блоком (Р-91).
 */
export function PeriodTime({ period, today, compare }: { period: Period; today: DateStr; compare?: Compare }) {
  const catalog = useCatalog()
  const time = useBlocks()
  const specials = useSpecials()
  if (!ready(catalog, time, specials)) return <Unready catalog={catalog} time={time} specials={specials} />

  const summary = periodSummary(time.blocks, catalog.categories, period, today, specials.specials)
  const before = compare
    ? periodSummary(time.blocks, catalog.categories, compare.period, today, specials.specials)
    : null
  const special = specialTime(time.blocks, catalog.categories, specials.specials, period, today)
  const rows = before
    ? compareRows(summary, before, catalog.categories)
    : summary.byCategory.map((row) => ({ ...row, before: 0 }))
  const withBackground = rows.some((row) => row.background > 0)
  // По группам (Р-81): строка группы с суммой в каждом столбце, под ней её категории.
  const groups = hasGroups(catalog.categories) ? byGroup(rows, catalog.categories, (row) => row.categoryId) : null
  const dash = (minutes: number) => (minutes > 0 ? formatMinutes(minutes) : '—')
  const line = (row: (typeof rows)[number], sub: boolean) => (
    <tr key={row.categoryId}>
      <td className={sub ? 'stats__sub' : undefined}>
        {row.name ?? UNKNOWN_CATEGORY}
        {row.background > 0 && <span className="muted"> · {backgroundText(row.background)}</span>}
      </td>
      <td className="num">{dash(row.minutes)}</td>
      {compare && <td className="num muted">{dash(row.before)}</td>}
    </tr>
  )

  return (
    <div className="day-sum">
      <p className="lead">{periodLine(summary)}</p>
      {compare && before && (
        <p className="muted">
          {compare.label}: {lowerFirst(periodLine(before))}
        </p>
      )}
      {rows.length > 0 && (
        <table className="stats">
          {compare && (
            <thead>
              <tr>
                <th />
                <th className="num">{compare.own}</th>
                <th className="num">{compare.label}</th>
              </tr>
            </thead>
          )}
          <tbody>
            {groups
              ? groups.map((group) => (
                  <Fragment key={group.key ?? ''}>
                    <tr className="stats__group">
                      <td>{group.name ?? NO_GROUP}</td>
                      <td className="num">{dash(groupMinutes(summary.byGroup, group.key))}</td>
                      {compare && (
                        <td className="num muted">{dash(before ? groupMinutes(before.byGroup, group.key) : 0)}</td>
                      )}
                    </tr>
                    {group.items.map((row) => line(row, true))}
                  </Fragment>
                ))
              : rows.map((row) => line(row, false))}
          </tbody>
        </table>
      )}
      {withBackground && <p className="muted">Фоновое в сумму не входит: час ютуба под покер — один час.</p>}
      {summary.byKind.length > 0 && <p className="muted">По признаку: {kindLine(summary.byKind)}</p>}
      <SpecialTimeList rows={special} />
    </div>
  )
}

/**
 * Нормы по неделям промежутка (Р-55, Р-56): месяц — с отметкой каждой недели
 * в счёт, год — строкой истории. Пока недель в счёт мало — с какого дня
 * норма и сколько набралось.
 */
export function PeriodNorms({ period, today, marks }: { period: Period; today: DateStr; marks: boolean }) {
  const catalog = useCatalog()
  const time = useBlocks()
  const specials = useSpecials()
  const names = useScreenNames()
  if (!ready(catalog, time, specials)) return <Unready catalog={catalog} time={time} specials={specials} />

  const rows = periodNorms(time.blocks, catalog.categories, period, today, specials.specials)
  if (rows.length === 0) {
    return (
      <p className="muted">
        Норм нет. Норма ставится в карточке категории — экран {quoted(names.time)} → ☰.
      </p>
    )
  }
  const special = specialMarksText(rows[0]?.history.marks ?? [], marks)

  return (
    <>
      <ul className="plain">
        {rows.map((row) => {
          const line = marks && row.history.enough ? marksLine(row.history.marks) : ''
          return (
            <li key={row.category.id} className="tblock__main">
              <p>
                {row.category.name}: {row.category.norm ? normText(row.category.norm) : ''}
              </p>
              {line && <p className="norm-marks">{line}</p>}
              <p className="muted">{historyText(row.history)}</p>
            </li>
          )
        })}
      </ul>
      {/* Недели у всех норм одни: особые названы один раз (Р-91). */}
      {special && <p>{special}</p>}
      <p className="muted">{marks ? MARKS_BASIS : YEAR_NORMS_BASIS}</p>
    </>
  )
}
