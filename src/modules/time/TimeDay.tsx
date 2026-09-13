import { useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../core/db.ts'
import type { Category, Preset, TimeBlock } from '../../core/model.ts'
import { Fold } from '../../ui/Fold.tsx'
import { BlockForm } from './BlockForm.tsx'
import { presetRow, type PresetButton } from './categories.ts'
import { blockFromPreset, blocksOn, categoryName, daySummary, type DaySummary } from './day.ts'
import {
  addedLine,
  blocksWord,
  formatMinutes,
  presetLabel,
  savedLine,
  summaryLine,
  UNKNOWN_CATEGORY,
  unaccountedLine,
  writingFor,
} from './labels.ts'
import { TimerLine, TimerPanel } from './Timer.tsx'
import { useBlocks } from './useBlocks.ts'
import { useCatalog } from './useCatalog.ts'
import { useTimer } from './useTimer.ts'

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/**
 * Учёт времени за день: кнопки, отклик, итог — и на «Времени» таймер,
 * ввод задним числом и список блоков.
 *
 * Отклик идёт сразу за вводом, а не отдельным экраном: привычка держится
 * только петлёй «записал → увидел» (03-План, логика порядка).
 *
 * `compact` — на «Сегодня»: кнопки, идущий таймер и итог, без остального.
 */
export function TimeDay({
  day,
  today = day,
  compact = false,
}: {
  /** Показанный день: сегодня или прошлый (Р-25). */
  day: string
  /** Настоящее сегодня. Не задано — показан сегодняшний. */
  today?: string
  compact?: boolean
}) {
  const catalog = useCatalog()
  const time = useBlocks()
  const timer = useTimer()
  /** Последний тап — его снимает «Отменить» (Р-20). */
  const [last, setLast] = useState<{ block: TimeBlock; name: string } | null>(null)
  const [error, setError] = useState('')
  /** Смена ключа сбрасывает форму «задним числом» после записи. */
  const [retroKey, setRetroKey] = useState(0)
  const [retroSaved, setRetroSaved] = useState('')

  if (catalog.status === 'failed') return <p className="error">Категории не прочитались: {catalog.error}</p>
  if (time.status === 'failed') return <p className="error">Блоки времени не прочитались: {time.error}</p>
  if (catalog.status !== 'ready' || time.status !== 'ready') return null

  const buttons = presetRow(catalog.categories, catalog.presets)
  const summary = daySummary(time.blocks, catalog.categories, day, new Date())
  // Блок, снятый из списка, «Отменить» больше не предлагает.
  const undoable = last !== null && time.blocks.some((each) => each.id === last.block.id)
  const categoryTotal =
    last === null ? 0 : (summary.byCategory.find((each) => each.categoryId === last.block.categoryId)?.minutes ?? 0)
  const nameOf = (id: string) => categoryName(catalog.categories, id) ?? UNKNOWN_CATEGORY
  const isToday = day === today

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

  const remove = (block: TimeBlock) =>
    write(async () => {
      await db.remove('time', block.id)
      if (last?.block.id === block.id) setLast(null)
    })

  return (
    <>
      <section className="block">
        {compact && <TimerLine timer={timer} categories={catalog.categories} />}
        {!isToday && <p className="muted">{writingFor(day)}</p>}

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
            <button type="button" className="link-btn" onClick={() => void remove(last.block)}>
              Отменить
            </button>
          </p>
        )}
        {error && <p className="error">Не записалось: {error}</p>}

        <Summary summary={summary} />
      </section>

      {!compact && (
        <>
          {/* Таймер всегда про сейчас — на прошлом дне его нет (Р-25). */}
          {isToday && (
            <Fold id="time:timer" title="Таймер" summary={timer.timer ? 'идёт' : undefined}>
              <TimerPanel timer={timer} categories={catalog.categories} today={today} />
            </Fold>
          )}

          <Fold id="time:retro" title="Задним числом" summary="если забыл включить таймер" folded>
            <BlockForm
              key={retroKey}
              categories={catalog.categories}
              presets={catalog.presets}
              blocks={time.blocks}
              today={today}
              defaultDate={day}
              onDone={(saved) => {
                if (!saved) return
                setRetroSaved(savedLine(nameOf(saved.categoryId), saved.minutes, saved.date, day))
                setRetroKey((key) => key + 1)
              }}
            />
            {retroSaved && <p className="muted">{retroSaved}</p>}
          </Fold>

          <DayBlocks
            blocks={blocksOn(time.blocks, day)}
            all={time.blocks}
            categories={catalog.categories}
            presets={catalog.presets}
            today={today}
            onRemove={(block) => void remove(block)}
          />
        </>
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

/**
 * Блоки дня, свежие сверху. Тап по блоку открывает правку той же формой,
 * что и ввод задним числом; снимается любой, не только последний (Р-20).
 */
function DayBlocks({
  blocks,
  all,
  categories,
  presets,
  today,
  onRemove,
}: {
  blocks: TimeBlock[]
  all: TimeBlock[]
  categories: Category[]
  presets: Preset[]
  today: string
  onRemove: (block: TimeBlock) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  if (blocks.length === 0) return null

  return (
    <Fold id="time:day-blocks" title="Блоки дня" summary={`${blocks.length} ${blocksWord(blocks.length)}`}>
      <ul className="plain">
        {blocks.map((block) => {
          const name = categoryName(categories, block.categoryId) ?? UNKNOWN_CATEGORY
          const background = block.bgCategoryId ? (categoryName(categories, block.bgCategoryId) ?? UNKNOWN_CATEGORY) : null
          const open = editing === block.id
          return (
            <li key={block.id}>
              <div className="tblock">
                <button
                  type="button"
                  className="plain-btn tblock__main"
                  aria-expanded={open}
                  onClick={() => setEditing(open ? null : block.id)}
                >
                  {name} · {formatMinutes(block.minutes)}
                  {background && <span className="muted"> · фоном {background}</span>}
                </button>
                <button
                  type="button"
                  className="link-btn"
                  aria-label={`Убрать: ${name}, ${formatMinutes(block.minutes)}`}
                  onClick={() => onRemove(block)}
                >
                  Убрать
                </button>
              </div>
              {open && (
                <BlockForm
                  categories={categories}
                  presets={presets}
                  blocks={all}
                  today={today}
                  existing={block}
                  onDone={() => setEditing(null)}
                />
              )}
            </li>
          )
        })}
      </ul>
    </Fold>
  )
}
