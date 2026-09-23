import { useState } from 'react'
import { Link } from 'react-router-dom'
import { db } from '../../app/core.ts'
import type { DayTemplate } from '../../app/model.ts'
import { quoted } from '../../ui/screenNames.ts'
import { useScreenNames } from '../../ui/useScreenNames.ts'
import { durationText, itemsText } from './labels.ts'
import {
  draftOf,
  moveDraftItem,
  moveTemplate,
  readDraft,
  templatesOf,
  withDraftMain,
  type ItemDraft,
  type TemplateDraft,
} from './templates.ts'
import { useTemplates } from './useTemplates.ts'

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/**
 * Шаблоны дня (Р-39): название, пункты, оценки, главное, порядок, удаление.
 * Заводятся не здесь, а из готового плана на «Сегодня»: так в шаблоне
 * сразу настоящие пункты.
 */
export function Templates() {
  const read = useTemplates()
  const names = useScreenNames()
  const [openId, setOpenId] = useState<string | null>(null)
  const list = templatesOf(read.templates ?? [])

  return (
    <>
      <header className="screen-head">
        <Link className="back" to="/">
          ← {names.today}
        </Link>
        <h1>Шаблоны дня</h1>
        <p className="muted">
          Шаблон — пункты обычного дня: работа, дорога, привычки. Тап по нему на экране {quoted(names.today)}{' '}
          ставит их в план; пункт, который в этот день уже стоит, второй раз не встаёт. Работу и дорогу
          стоит вписать с оценкой — по оценкам план сравнивается с остатком дня.
        </p>
      </header>

      {read.error && <p className="error">Шаблоны не прочитались: {read.error}</p>}
      {read.templates !== null && list.length === 0 && (
        <p className="stub">
          Шаблонов пока нет. Заводятся на экране {quoted(names.today)}: соберите план дня и нажмите «Сохранить
          план как шаблон».
        </p>
      )}

      <section className="block">
        <ul className="plain">
          {list.map((template, index) => (
            <TemplateRow
              key={template.id}
              template={template}
              templates={list}
              first={index === 0}
              last={index === list.length - 1}
              open={openId === template.id}
              onToggle={() => setOpenId(openId === template.id ? null : template.id)}
            />
          ))}
        </ul>
      </section>
    </>
  )
}

function TemplateRow({
  template,
  templates,
  first,
  last,
  open,
  onToggle,
}: {
  template: DayTemplate
  templates: DayTemplate[]
  first: boolean
  last: boolean
  open: boolean
  onToggle: () => void
}) {
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Порядок шаблонов между собой — порядок кнопок на «Сегодня» (Р-75).
  async function move(step: -1 | 1) {
    setError('')
    try {
      await db.putMany('templates', moveTemplate(templates, template.id, step))
    } catch (failure) {
      setError(describe(failure))
    }
  }
  const estimated = template.items.reduce((sum, each) => sum + (each.estMin ?? 0), 0)

  return (
    <li className="cat">
      <div className="cat__head">
        <button type="button" className="plain-btn cat__name" aria-expanded={open} onClick={onToggle}>
          {template.name}
        </button>
        <span className="muted cat__presets">
          {itemsText(template.items.length)}
          {estimated > 0 && ` · ${durationText(estimated)}`}
        </span>
        <button
          type="button"
          className="icon-btn"
          aria-label={`${template.name} — выше`}
          disabled={first}
          onClick={() => void move(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={`${template.name} — ниже`}
          disabled={last}
          onClick={() => void move(1)}
        >
          ↓
        </button>
      </div>
      {saved && <p className="muted">Сохранено</p>}
      {error && <p className="error">Не записалось: {error}</p>}
      {/* Ключ — время правки: сохранённое или приехавшее с другого устройства
          пересобирает правку с нуля, а не держит старый черновик. */}
      {open && (
        <TemplateEditor key={template.updatedAt} template={template} templates={templates} onSaved={() => setSaved(true)} />
      )}
    </li>
  )
}

function TemplateEditor({
  template,
  templates,
  onSaved,
}: {
  template: DayTemplate
  templates: DayTemplate[]
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<TemplateDraft>(() => draftOf(template))
  const [error, setError] = useState('')

  const setItems = (change: (items: ItemDraft[]) => ItemDraft[]) =>
    setDraft((prev) => ({ ...prev, items: change(prev.items) }))
  const setItem = (index: number, patch: Partial<ItemDraft>) =>
    setItems((items) => items.map((each, at) => (at === index ? { ...each, ...patch } : each)))

  async function save() {
    const read = readDraft(draft, templates, template.id)
    if ('error' in read) {
      setError(read.error)
      return
    }
    setError('')
    try {
      await db.put('templates', { ...template, name: read.name, items: read.items })
      onSaved()
    } catch (failure) {
      setError(describe(failure))
    }
  }

  async function remove() {
    if (!window.confirm(`Удалить шаблон «${template.name}»? Пункты, которые он уже поставил в план, останутся.`)) return
    try {
      await db.remove('templates', template.id)
    } catch (failure) {
      setError(describe(failure))
    }
  }

  // noValidate: оценку проверяет `readDraft` и называет причину с пунктом.
  return (
    <form
      className="form cat__body"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <label className="field">
        <span>Название</span>
        <input
          name="template-name"
          value={draft.name}
          onChange={(event) => {
            const name = event.target.value
            setDraft((prev) => ({ ...prev, name }))
          }}
        />
      </label>

      <ul className="plain">
        {draft.items.map((item, index) => (
          <li key={index} className="tpl-item">
            <div className="row">
              <input
                name="template-item"
                aria-label="Пункт"
                value={item.title}
                onChange={(event) => setItem(index, { title: event.target.value })}
              />
              <input
                name="template-estimate"
                className="tpl-item__est"
                inputMode="numeric"
                placeholder="мин"
                aria-label="Оценка, минут"
                value={item.estimate}
                onChange={(event) => setItem(index, { estimate: event.target.value })}
              />
            </div>
            <div className="row tpl-item__tools">
              <button
                type="button"
                className="star-btn"
                aria-pressed={item.main}
                aria-label={`${item.main ? 'Снять главное' : 'Сделать главным'}: ${item.title}`}
                onClick={() => setItems((items) => withDraftMain(items, index))}
              >
                {item.main ? '★' : '☆'}
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`${item.title} — выше`}
                disabled={index === 0}
                onClick={() => setItems((items) => moveDraftItem(items, index, -1))}
              >
                ↑
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`${item.title} — ниже`}
                disabled={index === draft.items.length - 1}
                onClick={() => setItems((items) => moveDraftItem(items, index, 1))}
              >
                ↓
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Убрать пункт: ${item.title}`}
                onClick={() => setItems((items) => items.filter((_, at) => at !== index))}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="link-btn"
        onClick={() => setItems((items) => [...items, { title: '', estimate: '', main: false }])}
      >
        + пункт
      </button>

      {error && <p className="error">{error}</p>}
      <div className="form__actions">
        <button type="button" className="btn btn--danger" onClick={() => void remove()}>
          Удалить шаблон
        </button>
        <button type="submit" className="btn btn--primary">
          Сохранить
        </button>
      </div>
    </form>
  )
}
