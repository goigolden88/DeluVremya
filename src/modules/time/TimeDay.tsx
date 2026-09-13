import { useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../core/db.ts'
import type { Category, TimeBlock } from '../../core/model.ts'
import { Fold } from '../../ui/Fold.tsx'
import { presetRow, type PresetButton } from './categories.ts'
import { blockFromPreset, blocksOn, categoryName, daySummary, type DaySummary } from './day.ts'
import {
  addedLine,
  blocksWord,
  formatMinutes,
  presetLabel,
  summaryLine,
  UNKNOWN_CATEGORY,
  unaccountedLine,
} from './labels.ts'
import { useBlocks } from './useBlocks.ts'
import { useCatalog } from './useCatalog.ts'

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/**
 * Учёт времени за день: кнопки, отклик, итог — и список блоков.
 *
 * Отклик идёт сразу за вводом, а не отдельным экраном: привычка держится
 * только петлёй «записал → увидел» (03-План, логика порядка).
 *
 * `compact` — на «Сегодня»: кнопки и итог, без списка блоков.
 */
export function TimeDay({ day, compact = false }: { day: string; compact?: boolean }) {
  const catalog = useCatalog()
  const time = useBlocks()
  /** Последний тап — его снимает «Отменить» (Р-20). */
  const [last, setLast] = useState<{ block: TimeBlock; name: string } | null>(null)
  const [error, setError] = useState('')

  if (catalog.status === 'failed') return <p className="error">Категории не прочитались: {catalog.error}</p>
  if (time.status === 'failed') return <p className="error">Блоки времени не прочитались: {time.error}</p>
  if (catalog.status !== 'ready' || time.status !== 'ready') return null

  const buttons = presetRow(catalog.categories, catalog.presets)
  const summary = daySummary(time.blocks, catalog.categories, day, new Date())
  // Блок, снятый из списка, «Отменить» больше не предлагает.
  const undoable = last !== null && time.blocks.some((each) => each.id === last.block.id)
  const categoryTotal =
    last === null ? 0 : (summary.byCategory.find((each) => each.categoryId === last.block.categoryId)?.minutes ?? 0)

  async function write(action: () => Promise<void>) {
    setError('')
    try {
      await action()
    } catch (failure) {
      setError(describe(failure))
    }
  }

  const add = (button: PresetButton) =>
    write(async () => {
      const block = await db.put('time', blockFromPreset(button.preset, day))
      setLast({ block, name: button.category.name })
    })

  const undo = (block: TimeBlock) =>
    write(async () => {
      await db.remove('time', block.id)
      setLast(null)
    })

  return (
    <>
      <section className="block">
        {buttons.length === 0 ? (
          <p className="stub">
            Кнопок нет — заведите их в <Link to="/time/categories">категориях</Link>.
          </p>
        ) : (
          <div className="presets">
            {buttons.map((button) => (
              <button key={button.preset.id} type="button" className="preset" onClick={() => void add(button)}>
                {button.category.name} {presetLabel(button.preset.minutes)}
              </button>
            ))}
          </div>
        )}

        {last && undoable && (
          <p className="added">
            <span>{addedLine(last.name, last.block.minutes, categoryTotal)}</span>
            <button type="button" className="link-btn" onClick={() => void undo(last.block)}>
              Отменить
            </button>
          </p>
        )}
        {error && <p className="error">Не записалось: {error}</p>}

        <Summary summary={summary} />
      </section>

      {!compact && (
        <DayBlocks blocks={blocksOn(time.blocks, day)} categories={catalog.categories} onRemove={(block) => void undo(block)} />
      )}
    </>
  )
}

function Summary({ summary }: { summary: DaySummary }) {
  return (
    <div className="day-sum">
      <p className="lead">{summaryLine(summary.total, summary.count)}</p>
      {summary.elapsed > 0 && <p className="muted">{unaccountedLine(summary.unaccounted, summary.elapsed)}</p>}
      {summary.byCategory.length > 0 && (
        <table className="stats">
          <tbody>
            {summary.byCategory.map((row) => (
              <tr key={row.categoryId}>
                <td>{row.name ?? UNKNOWN_CATEGORY}</td>
                <td className="num">{formatMinutes(row.minutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {summary.background.length > 0 && (
        <p className="muted">
          Фоном, в сумму не входит:{' '}
          {summary.background
            .map((row) => `${row.name ?? UNKNOWN_CATEGORY} ${formatMinutes(row.minutes)}`)
            .join(', ')}
        </p>
      )}
    </div>
  )
}

/** Блоки дня, свежие сверху. Отсюда снимается любой, не только последний (Р-20). */
function DayBlocks({
  blocks,
  categories,
  onRemove,
}: {
  blocks: TimeBlock[]
  categories: Category[]
  onRemove: (block: TimeBlock) => void
}) {
  if (blocks.length === 0) return null

  return (
    <Fold id="time:day-blocks" title="Блоки дня" summary={`${blocks.length} ${blocksWord(blocks.length)}`}>
      <ul className="plain">
        {blocks.map((block) => {
          const name = categoryName(categories, block.categoryId) ?? UNKNOWN_CATEGORY
          const background = block.bgCategoryId ? (categoryName(categories, block.bgCategoryId) ?? UNKNOWN_CATEGORY) : null
          return (
            <li key={block.id} className="tblock">
              <span className="tblock__main">
                {name} · {formatMinutes(block.minutes)}
                {background && <span className="muted"> · фоном {background}</span>}
              </span>
              <button
                type="button"
                className="link-btn"
                aria-label={`Убрать: ${name}, ${formatMinutes(block.minutes)}`}
                onClick={() => onRemove(block)}
              >
                Убрать
              </button>
            </li>
          )
        })}
      </ul>
    </Fold>
  )
}
