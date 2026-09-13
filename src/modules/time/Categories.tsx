import { useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../core/db.ts'
import { ulid } from '../../core/id.ts'
import type { Category, Preset } from '../../core/model.ts'
import { Fold } from '../../ui/Fold.tsx'
import type { TimeBlock } from '../../core/model.ts'
import {
  activeCategories,
  archivedCategories,
  blocksUsing,
  createCategory,
  createPreset,
  MINUTES_PER_DAY,
  moveCategory,
  nameProblem,
  presetProblem,
  presetsOf,
  removeCategoryPlan,
  restoreCategory,
  type CategoryKind,
  type RemovePlan,
} from './categories.ts'
import { deleteConfirm, KIND_LABELS, moveLine, NAME_PROBLEMS, PRESET_PROBLEMS, presetLabel } from './labels.ts'
import { useBlocks } from './useBlocks.ts'
import { useCatalog } from './useCatalog.ts'

const KINDS: readonly CategoryKind[] = ['useful', 'neutral', 'idle']

/** Запись в базу с текстом ошибки наружу. */
type Save = (write: () => Promise<unknown>) => Promise<void>

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/** Блоки — первыми: прерванная посередине запись оставит живую категорию без блоков, а не блоки без категории. */
async function writeRemoval(plan: RemovePlan): Promise<void> {
  await db.putMany('time', plan.blocks)
  await db.putMany('presets', plan.presets)
  await db.putMany('categories', plan.categories)
}

/**
 * Категории и кнопки: порядок, название, признак, кнопки категории,
 * архив, удаление.
 *
 * Архив — для категории, которой больше не размечают, но чьи блоки
 * остаются под своим именем: она пропадает из кнопок и выбора, а в итогах
 * остаётся. Удаление — пустой сразу, с блоками только переносом их
 * в другую категорию (Р-22).
 */
export function Categories() {
  const catalog = useCatalog()
  const time = useBlocks()
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState('')

  const save: Save = async (write) => {
    setError('')
    try {
      await write()
    } catch (failure) {
      setError(describe(failure))
    }
  }

  const active = activeCategories(catalog.categories)
  const archived = archivedCategories(catalog.categories)

  return (
    <>
      <header className="screen-head">
        <Link className="back" to="/time">
          ← Учёт времени
        </Link>
        <h1>Категории</h1>
        <p className="muted">
          Порядок здесь — порядок кнопок на экране дня. Признак категории нужен только обзору недели:
          на экране дня он ничего не красит.
        </p>
      </header>

      {catalog.status === 'failed' && <p className="error">Категории не прочитались: {catalog.error}</p>}
      {time.status === 'failed' && <p className="error">Блоки времени не прочитались: {time.error}</p>}
      {error && <p className="error">Не записалось: {error}</p>}

      {/* Без блоков не посчитать, что удаление перенесёт: ждём и их. */}
      {catalog.status === 'ready' && time.status === 'ready' && (
        <>
          <section className="block">
            <ul className="plain">
              {active.map((category, index) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  categories={catalog.categories}
                  presets={catalog.presets}
                  blocks={time.blocks}
                  open={open === category.id}
                  first={index === 0}
                  last={index === active.length - 1}
                  onToggle={() => setOpen(open === category.id ? null : category.id)}
                  save={save}
                />
              ))}
            </ul>
          </section>

          <NewCategory categories={catalog.categories} save={save} />

          {archived.length > 0 && (
            <Fold id="time:categories:archive" title="Архив" summary={archived.length} folded>
              <ul className="plain">
                {archived.map((category) => (
                  <li key={category.id} className="cat">
                    <div className="cat__head">
                      <span className="cat__name">{category.name}</span>
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => void save(() => db.put('categories', restoreCategory(catalog.categories, category)))}
                      >
                        Вернуть
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </Fold>
          )}
        </>
      )}
    </>
  )
}

function CategoryRow({
  category,
  categories,
  presets,
  blocks,
  open,
  first,
  last,
  onToggle,
  save,
}: {
  category: Category
  categories: Category[]
  presets: Preset[]
  blocks: TimeBlock[]
  open: boolean
  first: boolean
  last: boolean
  onToggle: () => void
  save: Save
}) {
  const [name, setName] = useState(category.name)
  const [minutes, setMinutes] = useState('')
  const [problem, setProblem] = useState('')
  /** Выбор, куда перенести блоки перед удалением. Null — не удаляем. */
  const [moving, setMoving] = useState<string | null>(null)
  const own = presetsOf(presets, category.id)
  const used = blocksUsing(blocks, category.id)
  const targets = activeCategories(categories).filter((each) => each.id !== category.id)

  function remove(moveTo: string | null) {
    if (used > 0 && moveTo === null) {
      setMoving('')
      return
    }
    if (used === 0 && !window.confirm(deleteConfirm(category.name))) return
    const plan = removeCategoryPlan(categories, presets, blocks, category.id, moveTo)
    if (plan) void save(() => writeRemoval(plan))
  }

  function rename() {
    const found = nameProblem(categories, name, category.id)
    if (found) {
      setProblem(NAME_PROBLEMS[found])
      return
    }
    setProblem('')
    if (name.trim() !== category.name) void save(() => db.put('categories', { ...category, name: name.trim() }))
  }

  function addPreset() {
    const value = Number(minutes)
    const found = presetProblem(presets, category.id, value)
    if (found) {
      setProblem(PRESET_PROBLEMS[found])
      return
    }
    setProblem('')
    void save(async () => {
      await db.put('presets', createPreset(category.id, value))
      setMinutes('')
    })
  }

  function move(step: -1 | 1) {
    void save(() => db.putMany('categories', moveCategory(categories, category.id, step)))
  }

  return (
    <li className="cat">
      <div className="cat__head">
        <button type="button" className="plain-btn cat__name" aria-expanded={open} onClick={onToggle}>
          {category.name}
        </button>
        <span className="muted cat__presets">{own.map((each) => presetLabel(each.minutes)).join(' ')}</span>
        <button
          type="button"
          className="icon-btn"
          aria-label={`${category.name} — выше`}
          disabled={first}
          onClick={() => move(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={`${category.name} — ниже`}
          disabled={last}
          onClick={() => move(1)}
        >
          ↓
        </button>
      </div>

      {open && (
        <div className="cat__body">
          <form
            className="row"
            onSubmit={(event) => {
              event.preventDefault()
              rename()
            }}
          >
            <input name="name" aria-label="Название" value={name} onChange={(event) => setName(event.target.value)} />
            <button type="submit" className="btn">
              Переименовать
            </button>
          </form>

          <label className="field">
            <span>Для обзора недели</span>
            <select
              name="kind"
              value={category.kind}
              onChange={(event) =>
                void save(() => db.put('categories', { ...category, kind: event.target.value as CategoryKind }))
              }
            >
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>

          {own.length > 0 && (
            <div className="chips">
              {own.map((each) => (
                <button
                  key={each.id}
                  type="button"
                  className="chip"
                  aria-label={`Убрать кнопку ${presetLabel(each.minutes)}`}
                  onClick={() => void save(() => db.remove('presets', each.id))}
                >
                  {presetLabel(each.minutes)} ✕
                </button>
              ))}
            </div>
          )}

          {/* noValidate: пределы минут проверяет `presetProblem` и называет
              причину; браузер перехватил бы её своей подсказкой. */}
          <form
            className="row"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              addPreset()
            }}
          >
            <input
              name="minutes"
              type="number"
              inputMode="numeric"
              min={1}
              max={MINUTES_PER_DAY}
              placeholder="минут"
              aria-label="Минут на новой кнопке"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            />
            <button type="submit" className="btn" disabled={!minutes}>
              Добавить кнопку
            </button>
          </form>

          {problem && <p className="error">{problem}</p>}

          <div className="row row--wrap">
            <button
              type="button"
              className="btn"
              onClick={() => void save(() => db.put('categories', { ...category, archived: true }))}
            >
              В архив
            </button>
            <button type="button" className="btn btn--danger" onClick={() => remove(null)}>
              Удалить
            </button>
          </div>

          {moving !== null && (
            <div className="form">
              <p>{moveLine(category.name, used)}</p>
              <select
                name="move-target"
                aria-label="Куда перенести блоки"
                value={moving}
                onChange={(event) => setMoving(event.target.value)}
              >
                <option value="">— выберите категорию —</option>
                {targets.map((each) => (
                  <option key={each.id} value={each.id}>
                    {each.name}
                  </option>
                ))}
              </select>
              <div className="form__actions">
                <button type="button" className="btn" onClick={() => setMoving(null)}>
                  Отмена
                </button>
                <button
                  type="button"
                  className="btn btn--danger"
                  disabled={!moving}
                  onClick={() => remove(moving)}
                >
                  Перенести и удалить
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function NewCategory({ categories, save }: { categories: Category[]; save: Save }) {
  const [name, setName] = useState('')
  const [problem, setProblem] = useState('')

  function add() {
    const found = nameProblem(categories, name)
    if (found) {
      setProblem(NAME_PROBLEMS[found])
      return
    }
    setProblem('')
    void save(async () => {
      await db.put('categories', createCategory(categories, name, 'neutral', ulid()))
      setName('')
    })
  }

  return (
    <form
      className="form block"
      onSubmit={(event) => {
        event.preventDefault()
        add()
      }}
    >
      <label className="field">
        <span>Новая категория</span>
        <input name="category" value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      {problem && <p className="error">{problem}</p>}
      <div className="form__actions">
        <button type="submit" className="btn btn--primary" disabled={!name.trim()}>
          Добавить
        </button>
      </div>
    </form>
  )
}
