import { useState } from 'react'
import type { DateStr, Period } from '../../shared/core/dates.ts'
import type { Category, SpecialDays, TimeBlock } from '../../app/model.ts'
import { Fold } from '../../shared/ui/Fold.tsx'
import { useFold } from '../../shared/ui/useFold.ts'
import {
  formatMinutes,
  NO_GROUP,
  SHARE_MODES,
  SLEEP_ROW,
  UNACCOUNTED_ROW,
  UNKNOWN_CATEGORY,
  WHOLE_NO_DAYS,
  WHOLE_NO_ROUTINE,
  WHOLE_NOTE,
  wholeBasisText,
  wholeTitle,
} from './labels.ts'
import type { PeriodSummary } from './period.ts'
import { periodShares, wholeShares, type Share, type Shares } from './shares.ts'
import { useSleep } from './useSleep.ts'

/** Строка доли: название, процент и тонкая полоса под ними. Цвет один, признак не красит (Р-05). */
function ShareLine({ name, share }: { name: string; share: Share }) {
  return (
    <>
      <span className="share__head">
        <span className="share__name">{name}</span>
        <span className="share__text">{share.text}</span>
      </span>
      <span className="share__bar" aria-hidden="true">
        <span className="share__fill" style={{ width: `${share.part * 100}%` }} />
      </span>
    </>
  )
}

/** Строки групп — тап раскрывает категории; групп нет — сразу категории. */
function ShareRows({ shares }: { shares: Shares }) {
  const [open, setOpen] = useState<ReadonlySet<string | null>>(new Set())
  const toggle = (key: string | null) =>
    setOpen((before) => {
      const next = new Set(before)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return shares.groups
    ? shares.groups.map((group) => (
        <li key={group.key ?? ''}>
          <button
            type="button"
            className="share share--group"
            aria-expanded={open.has(group.key)}
            onClick={() => toggle(group.key)}
          >
            <ShareLine name={group.name ?? NO_GROUP} share={group} />
          </button>
          {open.has(group.key) && (
            <ul className="shares shares--sub">
              {group.categories.map((row) => (
                <li key={row.categoryId} className="share">
                  <ShareLine name={row.name ?? UNKNOWN_CATEGORY} share={row} />
                </li>
              ))}
            </ul>
          )}
        </li>
      ))
    : shares.categories.map((row) => (
        <li key={row.categoryId} className="share">
          <ShareLine name={row.name ?? UNKNOWN_CATEGORY} share={row} />
        </li>
      ))
}

/**
 * Блок «Доли» (Р-95): какая часть всего учтённого за период — у каждой
 * группы; тап по группе раскрывает её категории. Групп нет — сразу
 * категории. Без времени за период блока нет.
 *
 * Переключатель вверху (Р-97): «от учтённого» — как было; «от всего» —
 * сутки прошедших дней периода: группы, «Неучтено» и «Сон». Выбор помнит
 * устройство, как и что свёрнуто.
 *
 * `id` — ключ блока: что свёрнуто и какой режим, устройство помнит по нему.
 */
export function PeriodShares({
  id,
  summary,
  categories,
  blocks,
  specials,
  period,
  today,
}: {
  id: string
  summary: PeriodSummary
  categories: readonly Category[]
  blocks: readonly TimeBlock[]
  specials: readonly SpecialDays[]
  period: Period
  today: DateStr
}) {
  // Тот же механизм, что у свёрнутости: «свёрнут» здесь — режим «от всего».
  const mode = useFold(`${id}:whole`, false)
  const sleep = useSleep()
  const shares = periodShares(summary, categories)
  if (shares.categories.length === 0) return null

  const whole =
    mode.folded && sleep.status === 'ready'
      ? wholeShares(blocks, categories, sleep.records, period, today, specials)
      : null
  const title =
    whole?.status === 'ready'
      ? wholeTitle(whole.basis.days)
      : mode.folded
        ? SHARE_MODES.whole
        : `от ${formatMinutes(shares.total)}`

  return (
    <Fold id={id} title="Доли" summary={title} sub>
      <div className="chips" role="group" aria-label="Доли от чего">
        {([false, true] as const).map((each) => (
          <button
            key={String(each)}
            type="button"
            className={mode.folded === each ? 'chip chip--on' : 'chip'}
            aria-pressed={mode.folded === each}
            onClick={() => mode.set(each)}
          >
            {each ? SHARE_MODES.whole : SHARE_MODES.accounted}
          </button>
        ))}
      </div>

      {!mode.folded ? (
        <>
          <ul className="shares">
            <ShareRows shares={shares} />
          </ul>
          <p className="muted">
            Доля — от всего учтённого за период по основной категории; фоновое и особые дни не входят.
            {shares.groups && ' Тап по группе — её категории, их доли тоже от всего.'}
          </p>
        </>
      ) : sleep.status === 'failed' ? (
        <p className="error">Распорядок не прочитался: {sleep.error}</p>
      ) : whole === null ? null : whole.status === 'no-routine' ? (
        <p className="muted">{WHOLE_NO_ROUTINE}</p>
      ) : (
        <>
          <p className="muted share-basis">
            {whole.basis.days === 0 && whole.basis.beforeRoutine === 0 && whole.basis.special === 0
              ? WHOLE_NO_DAYS
              : wholeBasisText(whole.basis)}
          </p>
          {whole.status === 'ready' && (
            <>
              <ul className="shares">
                <ShareRows shares={whole.shares} />
                <li className="share share--rest">
                  <ShareLine name={UNACCOUNTED_ROW} share={whole.unaccounted} />
                </li>
                <li className="share share--rest">
                  <ShareLine name={SLEEP_ROW} share={whole.sleep} />
                </li>
              </ul>
              <p className="muted">
                {WHOLE_NOTE}
                {whole.shares.groups && ' Тап по группе — её категории.'}
              </p>
            </>
          )}
        </>
      )}
    </Fold>
  )
}
