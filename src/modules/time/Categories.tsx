import { useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../core/db.ts'
import { ulid } from '../../core/id.ts'
import type { Category, Preset } from '../../core/model.ts'
import { Fold } from '../../ui/Fold.tsx'
import {
  activeCategories,
  archivedCategories,
  createCategory,
  createPreset,
  MINUTES_PER_DAY,
  moveCategory,
  nameProblem,
  presetProblem,
  presetsOf,
  restoreCategory,
  type CategoryKind,
} from './categories.ts'
import { KIND_LABELS, NAME_PROBLEMS, PRESET_PROBLEMS, presetLabel } from './labels.ts'
import { useCatalog } from './useCatalog.ts'

const KINDS: readonly CategoryKind[] = ['useful', 'neutral', 'idle']

/** Запись в базу с текстом ошибки наружу. */
type Save = (write: () => Promise<unknown>) => Promise<void>

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/**
 * Категории и кнопки: порядок, название, признак, кнопки категории, архив.
 *
 * Удаления категории нет, есть архив: у категории есть блоки, и удалённая
 * оставила бы их без названия. Архивная пропадает из кнопок и выбора,
 * а в итогах её блоки остаются.
 */
export function Categories() {
  const catalog = useCatalog()
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
      {error && <p className="error">Не записалось: {error}</p>}

      {catalog.status === 'ready' && (
        <>
          <section className="block">
            <ul className="plain">
              {active.map((category, index) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  categories={catalog.categories}
                  presets={catalog.presets}
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
  open,
  first,
  last,
  onToggle,
  save,
}: {
  category: Category
  categories: Category[]
  presets: Preset[]
  open: boolean
  first: boolean
  last: boolean
  onToggle: () => void
  save: Save
}) {
  const [name, setName] = useState(category.name)
  const [minutes, setMinutes] = useState('')
  const [problem, setProblem] = useState('')
  const own = presetsOf(presets, category.id)

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

          <form
            className="row"
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

          <button
            type="button"
            className="link-btn"
            onClick={() => void save(() => db.put('categories', { ...category, archived: true }))}
          >
            В архив
          </button>
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
