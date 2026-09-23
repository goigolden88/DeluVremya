import { useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../app/core.ts'
import { ulid } from '../../shared/core/id.ts'
import type { Category, Preset } from '../../app/model.ts'
import { Fold } from '../../shared/ui/Fold.tsx'
import type { TimeBlock } from '../../app/model.ts'
import {
  activeCategories,
  archivedCategories,
  blocksUsing,
  createCategory,
  createPreset,
  MINUTES_PER_DAY,
  nameProblem,
  presetProblem,
  presetsOf,
  removeCategoryPlan,
  restoreCategory,
  type CategoryKind,
  type RemovePlan,
} from './categories.ts'
import {
  byGroup,
  groupKey,
  groupNames,
  hasGroups,
  moveGroup,
  moveInGroup,
  renameGroup,
  setGroup,
  ungroup,
  type Group,
} from './groups.ts'
import {
  deleteConfirm,
  GROUP_EMPTY,
  KIND_LABELS,
  moveLine,
  NAME_PROBLEMS,
  NO_GROUP,
  NORM_PROBLEMS,
  normSinceText,
  normText,
  PRESET_PROBLEMS,
  presetLabel,
} from './labels.ts'
import { normInput, normSince, readNorm, withNorm, type NormInput } from './period.ts'
import { useToday } from '../../shared/ui/useToday.ts'
import { useBlocks } from './useBlocks.ts'
import { useCatalog } from './useCatalog.ts'
import { quoted } from '../../ui/screenNames.ts'
import { useScreenNames } from '../../ui/useScreenNames.ts'

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
  const names = useScreenNames()
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
  // По группам (Р-81), если они есть; иначе — одним списком, как прежде.
  const grouped = hasGroups(catalog.categories)
  const groups = byGroup(active, catalog.categories, (category) => category.id)
  const named = groups.filter((group) => group.key !== null).length

  const row = (category: Category, index: number, list: readonly Category[], blocks: TimeBlock[]) => (
    <CategoryRow
      key={category.id}
      category={category}
      categories={catalog.categories}
      presets={catalog.presets}
      blocks={blocks}
      open={open === category.id}
      first={index === 0}
      last={index === list.length - 1}
      onToggle={() => setOpen(open === category.id ? null : category.id)}
      save={save}
    />
  )

  return (
    <>
      <header className="screen-head">
        <Link className="back" to="/time">
          ← {names.time}
        </Link>
        <h1>Категории</h1>
        <p className="muted">
          Порядок здесь — порядок кнопок на экране дня. Группа ставится в карточке категории: кнопки и итоги
          встают по группам. Признак категории нужен только обзору недели:
          на экране дня он ничего не красит. Норма недели «не меньше» видна на экране {quoted(names.time)},
          «не больше» — только в обзоре недели.
        </p>
      </header>

      {catalog.status === 'failed' && <p className="error">Категории не прочитались: {catalog.error}</p>}
      {time.status === 'failed' && <p className="error">Блоки времени не прочитались: {time.error}</p>}
      {error && <p className="error">Не записалось: {error}</p>}

      {/* Без блоков не посчитать, что удаление перенесёт: ждём и их. */}
      {catalog.status === 'ready' && time.status === 'ready' && (
        <>
          {grouped ? (
            groups.map((group, index) => (
              <section className="block" key={group.key ?? ''}>
                <GroupHead
                  group={group}
                  categories={catalog.categories}
                  first={index === 0}
                  last={index >= named - 1}
                  save={save}
                />
                <ul className="plain">
                  {group.items.map((category, place) => row(category, place, group.items, time.blocks))}
                </ul>
              </section>
            ))
          ) : (
            <section className="block">
              <ul className="plain">{active.map((category, place) => row(category, place, active, time.blocks))}</ul>
            </section>
          )}

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
                    {/* Из архива удаляется так же, как рабочая: возвращать ради этого незачем. */}
                    <RemoveCategory
                      category={category}
                      categories={catalog.categories}
                      presets={catalog.presets}
                      blocks={time.blocks}
                      save={save}
                    />
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
    void save(() => db.putMany('categories', moveInGroup(categories, category.id, step)))
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

          <GroupPicker category={category} categories={categories} save={save} />

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

          <NormForm category={category} save={save} />

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
          </div>

          <RemoveCategory category={category} categories={categories} presets={presets} blocks={blocks} save={save} />
        </div>
      )}
    </li>
  )
}

/**
 * Удаление категории (Р-22): пустой — после подтверждения, с блоками —
 * только переносом их в другую рабочую. Одно и то же для рабочей
 * и архивной.
 */
function RemoveCategory({
  category,
  categories,
  presets,
  blocks,
  save,
}: {
  category: Category
  categories: Category[]
  presets: Preset[]
  blocks: TimeBlock[]
  save: Save
}) {
  /** Выбор, куда перенести блоки перед удалением. Null — не удаляем. */
  const [moving, setMoving] = useState<string | null>(null)
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

  return (
    <div className="cat__remove">
      <button
        type="button"
        className="btn btn--danger"
        aria-label={`Удалить категорию «${category.name}»`}
        onClick={() => remove(null)}
      >
        Удалить
      </button>

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
            <button type="button" className="btn btn--danger" disabled={!moving} onClick={() => remove(moving)}>
              Перенести и удалить
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Норма недели (Р-45): дней с блоком не меньше, часов не меньше, часов не
 * больше. Пустое поле — без этого правила; все пустые — нормы нет.
 * noValidate: пределы проверяет `readNorm` и называет причину.
 */
function NormForm({ category, save }: { category: Category; save: Save }) {
  const today = useToday()
  const [input, setInput] = useState<NormInput>(() => normInput(category.norm))
  const [problem, setProblem] = useState('')
  const since = category.norm ? normSince(category) : null

  function submit() {
    const read = readNorm(input)
    if ('problem' in read) {
      setProblem(NORM_PROBLEMS[read.problem])
      return
    }
    setProblem('')
    void save(() => db.put('categories', withNorm(category, read.norm, today)))
  }

  const field = (key: keyof NormInput, label: string, mode: 'numeric' | 'decimal') => (
    <label className="field">
      <span>{label}</span>
      <input
        name={`norm-${key}`}
        inputMode={mode}
        value={input[key]}
        onChange={(event) => setInput({ ...input, [key]: event.target.value })}
      />
    </label>
  )

  return (
    <form
      className="form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <p className="muted">
        {category.norm
          ? `Норма недели: ${normText(category.norm)}${since ? `, ${normSinceText(since)}` : ''}.`
          : 'Нормы недели нет.'}{' '}
        Пустое поле — без этого
        правила.
      </p>
      {field('minDays', 'Дней с блоком — не меньше', 'numeric')}
      {field('minHours', 'Часов — не меньше', 'decimal')}
      {field('maxHours', 'Часов — не больше', 'decimal')}
      {problem && <p className="error">{problem}</p>}
      <div className="form__actions">
        <button type="submit" className="btn">
          Сохранить норму
        </button>
      </div>
    </form>
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

/**
 * Группа категории (Р-81): чипами из тех, что есть, или новой; «Без группы» —
 * тоже чип. Категория встаёт в конец выбранной группы.
 */
function GroupPicker({ category, categories, save }: { category: Category; categories: Category[]; save: Save }) {
  const [fresh, setFresh] = useState('')
  const current = category.group?.trim() ? groupKey(category.group) : null

  function choose(name: string | null) {
    void save(() => db.putMany('categories', setGroup(categories, category.id, name)))
  }

  return (
    <div className="field">
      <span>Группа — где кнопка и строка в итогах</span>
      <div className="chips" role="group" aria-label="Группа">
        {groupNames(categories).map((name) => (
          <button
            key={name}
            type="button"
            className={groupKey(name) === current ? 'chip chip--on' : 'chip'}
            aria-pressed={groupKey(name) === current}
            onClick={() => choose(name)}
          >
            {name}
          </button>
        ))}
        <button
          type="button"
          className={current === null ? 'chip chip--on' : 'chip'}
          aria-pressed={current === null}
          onClick={() => choose(null)}
        >
          {NO_GROUP}
        </button>
      </div>
      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault()
          if (!fresh.trim()) return
          choose(fresh)
          setFresh('')
        }}
      >
        <input
          name="new-group"
          aria-label="Новая группа"
          placeholder="Новая группа"
          value={fresh}
          onChange={(event) => setFresh(event.target.value)}
        />
        <button type="submit" className="btn" disabled={!fresh.trim()}>
          В новую группу
        </button>
      </form>
    </div>
  )
}

/**
 * Заголовок группы на экране категорий (Р-81): порядок групп, переименование,
 * «Убрать группу» — её категории уходят в «Без группы». У «Без группы» —
 * только заголовок: она всегда последняя.
 */
function GroupHead({
  group,
  categories,
  first,
  last,
  save,
}: {
  group: Group<Category>
  categories: Category[]
  first: boolean
  last: boolean
  save: Save
}) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(group.name ?? '')
  const [problem, setProblem] = useState('')
  const key = group.key
  if (key === null) return <h2 className="cat-group__name">{NO_GROUP}</h2>

  function rename(target: string) {
    if (!name.trim()) {
      setProblem(GROUP_EMPTY)
      return
    }
    setProblem('')
    setRenaming(false)
    void save(() => db.putMany('categories', renameGroup(categories, target, name)))
  }

  return (
    <>
      <div className="cat-group__head">
        <h2 className="cat-group__name">{group.name}</h2>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Группа «${group.name}» — выше`}
          disabled={first}
          onClick={() => void save(() => db.putMany('categories', moveGroup(categories, key, -1)))}
        >
          ↑
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Группа «${group.name}» — ниже`}
          disabled={last}
          onClick={() => void save(() => db.putMany('categories', moveGroup(categories, key, 1)))}
        >
          ↓
        </button>
      </div>
      <div className="row row--wrap">
        <button type="button" className="link-btn" aria-expanded={renaming} onClick={() => setRenaming(!renaming)}>
          Переименовать группу
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={() => void save(() => db.putMany('categories', ungroup(categories, key)))}
        >
          Убрать группу
        </button>
      </div>
      {renaming && (
        <form
          className="row"
          onSubmit={(event) => {
            event.preventDefault()
            rename(key)
          }}
        >
          <input
            name="group-name"
            aria-label="Название группы"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit" className="btn">
            Сохранить
          </button>
        </form>
      )}
      {problem && <p className="error">{problem}</p>}
    </>
  )
}
