import { useState } from 'react'
import type { Category } from '../../app/model.ts'
import { Fold } from '../../shared/ui/Fold.tsx'
import { formatMinutes, NO_GROUP, UNKNOWN_CATEGORY } from './labels.ts'
import type { PeriodSummary } from './period.ts'
import { periodShares, type Share } from './shares.ts'

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

/**
 * Блок «Доли» (Р-95): какая часть всего учтённого за период — у каждой
 * группы; тап по группе раскрывает её категории. Групп нет — сразу
 * категории. Без времени за период блока нет.
 *
 * `id` — ключ блока: что свёрнуто, устройство помнит по нему.
 */
export function PeriodShares({
  id,
  summary,
  categories,
}: {
  id: string
  summary: PeriodSummary
  categories: readonly Category[]
}) {
  const [open, setOpen] = useState<ReadonlySet<string | null>>(new Set())
  const shares = periodShares(summary, categories)
  if (shares.categories.length === 0) return null

  const toggle = (key: string | null) =>
    setOpen((before) => {
      const next = new Set(before)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <Fold id={id} title="Доли" summary={`от ${formatMinutes(shares.total)}`} sub>
      <ul className="shares">
        {shares.groups
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
            ))}
      </ul>
      <p className="muted">
        Доля — от всего учтённого за период по основной категории; фоновое и особые дни не входят.
        {shares.groups && ' Тап по группе — её категории, их доли тоже от всего.'}
      </p>
    </Fold>
  )
}
