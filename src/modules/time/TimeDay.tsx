import { Fragment, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '../../app/core.ts'
import type { Category, Preset, TimeBlock } from '../../app/model.ts'
import { Fold } from '../../shared/ui/Fold.tsx'
import { useLongPress } from '../../ui/useLongPress.ts'
import { BlockForm } from './BlockForm.tsx'
import { categoryEditPath, hiddenPresets, presetLines, shownPresets, type PresetLine } from './categories.ts'
import { byGroup, groupMinutes, hasGroups } from './groups.ts'
import { blockFromPreset, blocksOn, categoryName, clearDayBlocks, daySummary, type DaySummary } from './day.ts'
import { dayWindow } from './sleep.ts'
import {
  addedLine,
  blocksWord,
  CLEAR_DAY,
  clearDayConfirm,
  FEWER_PRESETS,
  formatMinutes,
  morePresetsLabel,
  NO_GROUP,
  presetFullLabel,
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
import { useSleep } from './useSleep.ts'
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
  const sleep = useSleep()
  const timer = useTimer()
  const navigate = useNavigate()
  const longPress = useLongPress()
  /** Последний тап — его снимает «Отменить» (Р-20). */
  const [last, setLast] = useState<{ block: TimeBlock; name: string } | null>(null)
  const [error, setError] = useState('')
  /** Смена ключа сбрасывает форму «задним числом» после записи. */
  const [retroKey, setRetroKey] = useState(0)
  const [retroSaved, setRetroSaved] = useState('')
  /** Категории, у которых раскрыты кнопки сверх первых. */
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const toggle = (id: string) =>
    setOpened((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })

  if (catalog.status === 'failed') return <p className="error">Категории не прочитались: {catalog.error}</p>
  if (time.status === 'failed') return <p className="error">Блоки времени не прочитались: {time.error}</p>
  if (sleep.status === 'failed') return <p className="error">Распорядок не прочитался: {sleep.error}</p>
  if (catalog.status !== 'ready' || time.status !== 'ready' || sleep.status !== 'ready') return null

  const lines = presetLines(catalog.categories, catalog.presets)
  // Неучтённое — от окна показанного дня: его отметки или распорядка (Р-94).
  const summary = daySummary(time.blocks, catalog.categories, day, new Date(), dayWindow(sleep.records, day))
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

  const add = (category: Category, preset: Preset) =>
    write(async () => {
      const block = await db.put('time', blockFromPreset(preset, day))
      setLast({ block, name: category.name })
    })

  const remove = (block: TimeBlock) =>
    write(async () => {
      await db.remove('time', block.id)
      if (last?.block.id === block.id) setLast(null)
    })

  // Все блоки дня одной записью — после подтверждения, чтобы не стереть случайно.
  const clear = () => {
    const cleared = clearDayBlocks(time.blocks, day)
    if (cleared.length === 0 || !window.confirm(clearDayConfirm(cleared.length, day))) return
    void write(async () => {
      await db.putMany('time', cleared)
      if (last && cleared.some((block) => block.id === last.block.id)) setLast(null)
    })
  }

  // По группам (Р-81), если они есть; у группы — сколько в ней учтено за день.
  const grouped = hasGroups(catalog.categories)
    ? byGroup(lines, catalog.categories, (line) => line.category.id)
    : null
  // Строка на категорию: название, рядом кнопки одними минутами. Долгий тап
  // по строке — по названию или кнопке — правка категории; блок не пишется.
  const presetLine = (line: PresetLine) => {
    const { category } = line
    const hidden = hiddenPresets(line)
    const open = hidden > 0 && opened.has(category.id)
    return (
      <div
        key={category.id}
        className="preset-line"
        {...longPress(() => void navigate(categoryEditPath(category.id)))}
      >
        {/* «Ещё» — у названия, а не за кнопками: столбцы кнопок у строк ровные. */}
        <span className="preset-line__name">
          <span>{category.name}</span>
          {hidden > 0 && (
            <button
              type="button"
              className="link-btn preset-line__more"
              aria-expanded={open}
              aria-label={`${category.name}: ${open ? FEWER_PRESETS : morePresetsLabel(hidden)}`}
              onClick={() => toggle(category.id)}
            >
              {open ? FEWER_PRESETS : morePresetsLabel(hidden)}
            </button>
          )}
        </span>
        <span className="preset-line__buttons">
          {shownPresets(line, open).map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="preset"
              aria-label={presetFullLabel(category.name, preset.minutes)}
              onClick={() => void add(category, preset)}
            >
              {presetLabel(preset.minutes)}
            </button>
          ))}
        </span>
      </div>
    )
  }

  return (
    <>
      <section className="block">
        {compact && <TimerLine timer={timer} categories={catalog.categories} />}
        {!isToday && <p className="muted">{writingFor(day)}</p>}

        {lines.length === 0 ? (
          <p className="stub">
            Кнопок нет — заведите их в <Link to="/time/categories">категориях</Link>.
          </p>
        ) : grouped ? (
          grouped.map((group) => {
            const spent = groupMinutes(summary.byGroup, group.key)
            return (
              <Fold
                key={group.key ?? ''}
                id={`${compact ? 'today' : 'time'}:group:${group.key ?? ''}`}
                title={group.name ?? NO_GROUP}
                summary={spent > 0 ? formatMinutes(spent) : undefined}
                sub
              >
                <div className="presets">{group.items.map(presetLine)}</div>
              </Fold>
            )
          })
        ) : (
          <div className="presets">{lines.map(presetLine)}</div>
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

        <Summary summary={summary} categories={catalog.categories} />
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
            onClear={clear}
          />
        </>
      )}
    </>
  )
}

function Summary({ summary, categories }: { summary: DaySummary; categories: Category[] }) {
  // По группам (Р-81): строка группы с суммой, под ней её категории.
  const groups = hasGroups(categories) ? byGroup(summary.byCategory, categories, (row) => row.categoryId) : null
  const row = (each: DaySummary['byCategory'][number], sub: boolean) => (
    <tr key={each.categoryId}>
      <td className={sub ? 'stats__sub' : undefined}>{each.name ?? UNKNOWN_CATEGORY}</td>
      <td className="num">{formatMinutes(each.minutes)}</td>
    </tr>
  )
  return (
    <div className="day-sum">
      <p className="lead">{summaryLine(summary.total, summary.count)}</p>
      {summary.elapsed > 0 && <p className="muted">{unaccountedLine(summary.unaccounted, summary.elapsed)}</p>}
      {summary.byCategory.length > 0 && (
        <table className="stats">
          <tbody>
            {groups
              ? groups.map((group) => (
                  <Fragment key={group.key ?? ''}>
                    <tr className="stats__group">
                      <td>{group.name ?? NO_GROUP}</td>
                      <td className="num">{formatMinutes(groupMinutes(summary.byGroup, group.key))}</td>
                    </tr>
                    {group.items.map((each) => row(each, true))}
                  </Fragment>
                ))
              : summary.byCategory.map((each) => row(each, false))}
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
  onClear,
}: {
  blocks: TimeBlock[]
  all: TimeBlock[]
  categories: Category[]
  presets: Preset[]
  today: string
  onRemove: (block: TimeBlock) => void
  /** «Очистить день»: подтверждение и запись — у вызывающего. */
  onClear: () => void
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
              {block.note && <p className="muted tblock__note">{block.note}</p>}
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
      <button type="button" className="btn btn--danger day-clear" onClick={onClear}>
        {CLEAR_DAY}
      </button>
    </Fold>
  )
}
