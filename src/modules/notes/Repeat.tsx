import { useState } from 'react'
import { Link } from 'react-router-dom'
import { isDateStr, type DateStr } from '../../shared/core/dates.ts'
import { db } from '../../app/core.ts'
import type { Note, NoteRepeat } from '../../app/model.ts'
import { withText } from './inbox.ts'
import { durationText } from './labels.ts'
import { ESTIMATE_CHOICES, readEstimate, withEstimate } from './plan.ts'
import {
  draftOfRule,
  editPattern,
  EVERY_NAMES,
  patternLine,
  readRule,
  REPEAT_EVERY,
  ruleOf,
  ruleText,
  stopPattern,
  toggleWeekday,
  toPattern,
  WEEKDAY_NAMES,
  withPatternMain,
  type RuleDraft,
} from './repeat.ts'

/** Заголовок блока на «Заметках» и кнопка в карточке дела (Р-107). */
export const REPEATS_TITLE = 'Повторы'
export const REPEAT_LABEL = 'Повторять'

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/** Ссылка на образец на «Заметках»: блок «Повторы» раскроется сам. */
function patternLink(id: string): string {
  return `/inbox?open=${encodeURIComponent(id)}`
}

/**
 * Поля правила: с какого дня, как часто, до какого — по желанию. Общие
 * для формы правила в карточке и для записи дела на «Заметках» (Р-108).
 */
export function RuleFields({ draft, onChange }: { draft: RuleDraft; onChange: (part: Partial<RuleDraft>) => void }) {
  return (
    <>
      <label className="field">
        <span>С какого дня</span>
        <input
          type="date"
          name="repeat-from"
          value={draft.from}
          onChange={(event) => {
            const day = event.target.value
            if (isDateStr(day)) onChange({ from: day })
          }}
        />
      </label>

      <div className="chips" role="group" aria-label="Как часто">
        {REPEAT_EVERY.map((every) => (
          <button
            key={every}
            type="button"
            className={draft.every === every ? 'chip chip--on' : 'chip'}
            aria-pressed={draft.every === every}
            onClick={() => onChange({ every })}
          >
            {EVERY_NAMES[every]}
          </button>
        ))}
      </div>

      {draft.every === 'days' && (
        <label className="field">
          <span>Каждые сколько дней</span>
          <input
            name="repeat-step"
            inputMode="numeric"
            value={draft.step}
            onChange={(event) => onChange({ step: event.target.value })}
          />
        </label>
      )}
      {draft.every === 'week' && (
        <div className="chips" role="group" aria-label="Дни недели">
          {WEEKDAY_NAMES.map((name, index) => {
            const day = index + 1
            const on = draft.weekdays.includes(day)
            return (
              <button
                key={name}
                type="button"
                className={on ? 'chip chip--on' : 'chip'}
                aria-pressed={on}
                onClick={() => onChange({ weekdays: toggleWeekday(draft.weekdays, day) })}
              >
                {name}
              </button>
            )
          })}
        </div>
      )}
      {draft.every === 'month' && (
        <label className="field">
          <span>Какого числа — в коротком месяце последний день</span>
          <input
            name="repeat-month-day"
            inputMode="numeric"
            value={draft.monthDay}
            onChange={(event) => onChange({ monthDay: event.target.value })}
          />
        </label>
      )}

      <label className="field">
        <span>До какого дня — по желанию</span>
        <input
          type="date"
          name="repeat-until"
          min={draft.from}
          value={draft.until}
          onChange={(event) => onChange({ until: event.target.value })}
        />
      </label>
    </>
  )
}

/**
 * Правило повтора: поля и кнопка. Кривое — причина под кнопкой,
 * ничего не пишется.
 */
function RuleForm({
  rule,
  from,
  submit,
  onSave,
  onCancel,
}: {
  rule: NoteRepeat | null
  from: DateStr
  submit: string
  onSave: (rule: NoteRepeat) => void
  onCancel?: () => void
}) {
  const [draft, setDraft] = useState<RuleDraft>(() => draftOfRule(rule, from))
  const [error, setError] = useState('')
  const change = (part: Partial<RuleDraft>) => {
    setError('')
    setDraft({ ...draft, ...part })
  }

  function save() {
    const read = readRule(draft)
    if ('error' in read) {
      setError(read.error)
      return
    }
    onSave(read.rule)
  }

  return (
    <form
      className="form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <RuleFields draft={draft} onChange={change} />
      {error && <p className="error">{error}</p>}
      <div className="row row--wrap">
        <button type="submit" className="btn">
          {submit}
        </button>
        {onCancel && (
          <button type="button" className="link-btn" onClick={onCancel}>
            Отмена
          </button>
        )}
      </div>
    </form>
  )
}

/**
 * «Повторять» в карточке дела — на «Заметках» и в плане (Р-107). Дело
 * становится повтором: уходит в блок «Повторы», а в план встают его пункты.
 * Первый день — день, на который дело стоит, иначе сегодня.
 */
export function RepeatSetup({ note, today, onError }: { note: Note; today: DateStr; onError: (message: string) => void }) {
  const [open, setOpen] = useState(false)
  const from = note.plannedFor !== null && isDateStr(note.plannedFor) ? note.plannedFor : today

  async function save(rule: NoteRepeat) {
    try {
      await db.put('notes', toPattern(note, rule))
    } catch (failure) {
      onError(describe(failure))
    }
  }

  if (!open) {
    return (
      <div className="row row--wrap">
        <button type="button" className="btn" aria-expanded={false} onClick={() => setOpen(true)}>
          {REPEAT_LABEL}
        </button>
      </div>
    )
  }
  return (
    <>
      <span className="plan__label">{REPEAT_LABEL}</span>
      <RuleForm
        rule={null}
        from={from}
        submit="Повторять"
        onSave={(rule) => void save(rule)}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}

/** У пункта повтора в плане: из какого он повтора и где повтор правится. */
export function RepeatOrigin({ pattern }: { pattern: Note }) {
  return (
    <p className="muted">
      Повтор: {patternLine(pattern)}. <Link to={patternLink(pattern.id)}>Править повтор</Link> — на «Заметках»,
      в «{REPEATS_TITLE}».
    </p>
  )
}

type ItemProps = {
  pattern: Note
  notes: readonly Note[]
  today: DateStr
  open: boolean
  onToggle: () => void
  onError: (message: string) => void
  /** Якорь строки — к нему прокручивает переход из плана и ленты. */
  anchor: string
}

/** Строка повтора в блоке «Повторы»: текст и правило словами, тап — правка (Р-107). */
export function RepeatItem({ pattern, notes, today, open, onToggle, onError, anchor }: ItemProps) {
  const meta = [patternLine(pattern)]
  if (pattern.estMin !== undefined) meta.push(durationText(pattern.estMin))
  if (pattern.main) meta.push('главное')
  return (
    <li className="note" id={anchor}>
      <button type="button" className="plain-btn note__main" aria-expanded={open} onClick={onToggle}>
        <span className="note__text">{pattern.text}</span>
      </button>
      <span className="muted note__meta">{meta.join(' · ')}</span>
      {open && <RepeatCard pattern={pattern} notes={notes} today={today} onError={onError} />}
    </li>
  )
}

/**
 * Правка повтора: текст, оценка, «главное», правило, «Остановить повтор».
 * Правка уходит и в пункты с сегодняшнего дня, ещё не отмеченные; прошлые
 * и сделанные — как были.
 */
function RepeatCard({
  pattern,
  notes,
  today,
  onError,
}: {
  pattern: Note
  notes: readonly Note[]
  today: DateStr
  onError: (message: string) => void
}) {
  const [text, setText] = useState(pattern.text)
  const [estimate, setEstimate] = useState('')
  const [estimateError, setEstimateError] = useState('')
  const [ruleOpen, setRuleOpen] = useState(false)
  const edited = withText(pattern, text)
  const rule = ruleOf(pattern)

  async function save(next: Note) {
    if (next === pattern) return
    try {
      await db.putMany('notes', editPattern(pattern, next, notes, today))
    } catch (failure) {
      onError(describe(failure))
    }
  }

  async function stop() {
    if (!window.confirm(`Остановить повтор «${pattern.text}»? Не отмеченные пункты с сегодняшнего дня уберутся.`)) return
    try {
      await db.putMany('notes', stopPattern(pattern, notes, today))
    } catch (failure) {
      onError(describe(failure))
    }
  }

  function saveEstimate() {
    const read = readEstimate(estimate)
    if ('error' in read) {
      setEstimateError(read.error)
      return
    }
    setEstimateError('')
    setEstimate('')
    void save(withEstimate(pattern, read.minutes))
  }

  return (
    <div className="form note__card">
      <label className="field">
        <span>Текст</span>
        <textarea name="repeat-text" rows={2} value={text} onChange={(event) => setText(event.target.value)} />
      </label>
      {edited !== null && edited !== pattern && (
        <div className="form__actions">
          <button type="button" className="btn" onClick={() => void save(edited)}>
            Сохранить текст
          </button>
        </div>
      )}

      <div className="chips" role="group" aria-label="Оценка">
        {ESTIMATE_CHOICES.map((minutes) => (
          <button
            key={minutes}
            type="button"
            className={pattern.estMin === minutes ? 'chip chip--on' : 'chip'}
            aria-pressed={pattern.estMin === minutes}
            onClick={() => void save(withEstimate(pattern, pattern.estMin === minutes ? null : minutes))}
          >
            {durationText(minutes)}
          </button>
        ))}
      </div>
      <form
        className="row"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          saveEstimate()
        }}
      >
        <input
          name="repeat-estimate"
          inputMode="numeric"
          placeholder="Своя оценка, минут"
          value={estimate}
          onChange={(event) => setEstimate(event.target.value)}
        />
        <button type="submit" className="btn">
          Поставить
        </button>
      </form>
      {estimateError && <p className="error">{estimateError}</p>}

      <div className="chips" role="group" aria-label="Главное">
        <button
          type="button"
          className={pattern.main ? 'chip chip--on' : 'chip'}
          aria-pressed={Boolean(pattern.main)}
          onClick={() => void save(withPatternMain(pattern, !pattern.main))}
        >
          ★ Главное
        </button>
      </div>

      <span className="plan__label">Правило</span>
      {ruleOpen ? (
        <RuleForm
          rule={rule}
          from={today}
          submit="Сохранить правило"
          onSave={(next) => {
            setRuleOpen(false)
            void save({ ...pattern, repeat: next })
          }}
          onCancel={() => setRuleOpen(false)}
        />
      ) : (
        <div className="row row--wrap">
          <span>{rule === null ? patternLine(pattern) : ruleText(rule)}</span>
          <button type="button" className="link-btn" onClick={() => setRuleOpen(true)}>
            Изменить
          </button>
        </div>
      )}

      <div className="row row--wrap">
        <button type="button" className="btn btn--danger" onClick={() => void stop()}>
          Остановить повтор
        </button>
      </div>
    </div>
  )
}
