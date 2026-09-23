/**
 * Заметки в ленте и в выгрузке markdown (Р-59, Р-63).
 *
 * Строка стоит в дне записи, `capturedOn`, — там же, где заметка лежит
 * в раскладке и на «Заметках». Без даты — пустая дата: лента поставит её
 * внизу, в «Без даты» (Р-08). Лента только читает: тап открывает карточку
 * лишь у того, что показывают «Заметки», — неразобранного и замыслов.
 *
 * Чистые функции, без React и без базы.
 */

import { formatDate, inPeriod, isDateStr, type Period } from '../../shared/core/dates.ts'
import { dateWords, escapeMarkdown as md, type FeedItem } from '../../shared/core/feed.ts'
import type { Note } from '../../app/model.ts'
import { goalOf, groupByMonth, isUnsorted } from './inbox.ts'
import { firstLine, goalLine, KIND_NAMES, monthHeading } from './labels.ts'

/** День в подписи: в ленте — `14.09`, месяц и год стоят заголовком; в выгрузке — полностью. */
type DayFormat = (day: string) => string

const shortDay: DayFormat = (day) => (isDateStr(day) ? formatDate(day).slice(0, 5) : day)
const fullDay: DayFormat = (day) => (isDateStr(day) ? formatDate(day) : day)

/** Вид и состояние: «дело · сделано 14.09», «дело · в плане на 15.09 · главное», «мысль». */
function stateParts(note: Note, day: DayFormat): string[] {
  const parts = [KIND_NAMES[note.kind].toLowerCase()]
  if (note.status === 'done') {
    const word = note.kind === 'goal' ? 'достигнут' : 'сделано'
    parts.push(note.doneOn ? `${word} ${day(note.doneOn)}` : word)
  } else if (note.status === 'someday') {
    parts.push('когда-нибудь')
  } else if (note.status === 'dropped') {
    parts.push('отброшено')
  } else if (note.plannedFor !== null) {
    parts.push(`в плане на ${day(note.plannedFor)}`)
  }
  if (note.main && note.plannedFor !== null) parts.push('главное')
  return parts
}

/** Открывается ли карточка на «Заметках»: там лежат неразобранное и замыслы в работе (Р-59). */
function opensOnNotes(note: Note): boolean {
  return isUnsorted(note) || (note.kind === 'goal' && note.status === 'open')
}

export function noteFeed(notes: readonly Note[]): FeedItem[] {
  return notes
    .filter((note) => !note.deleted)
    .map((note): FeedItem => {
      const goal = goalOf(note, notes)
      // Весь текст, замысел и дни плана и выполнения ищутся, но в строке их нет.
      const extra = [
        note.text,
        goal?.text ?? '',
        note.plannedFor !== null ? dateWords(note.plannedFor) : '',
        note.doneOn ? dateWords(note.doneOn) : '',
      ]
        .filter(Boolean)
        .join(' ')
      return {
        kind: 'note',
        id: note.id,
        date: note.capturedOn ?? '',
        title: firstLine(note.text),
        detail: [...stateParts(note, shortDay), ...(goal ? [goalLine(goal)] : [])].join(' · '),
        extra,
        ...(opensOnNotes(note) ? { link: `/inbox?open=${encodeURIComponent(note.id)}` } : {}),
      }
    })
}

/**
 * Раздел выгрузки — дневником: месяцы от старых к новым, внутри — по дню
 * записи; без даты — в конце (Р-63). Заголовок раздела ставит реестр.
 */
export function noteMarkdown(notes: readonly Note[], period: Period | null = null): string {
  const live = notes.filter((note) => !note.deleted)
  // За период — по дню записи; без даты в период не попадает (Р-79). Замысел
  // у дела ищется среди всех: он мог быть записан в другом месяце.
  const shown =
    period === null
      ? live
      : live.filter((note) => note.capturedOn !== null && isDateStr(note.capturedOn) && inPeriod(note.capturedOn, period))
  if (shown.length === 0) return 'Записей нет.'

  // `groupByMonth` отдаёт свежие сверху и «без даты» последней группой.
  const groups = groupByMonth(shown)
  const dated = groups.filter((group) => group.month !== null).reverse()
  const undated = groups.filter((group) => group.month === null)

  const lines: string[] = []
  for (const group of [...dated, ...undated]) {
    const list = group.month === null ? group.notes : [...group.notes].reverse()
    lines.push(`### ${monthHeading(group.month)}`, '', ...list.map((note) => line(note, live)), '')
  }
  return lines.join('\n').trimEnd()
}

function line(note: Note, notes: readonly Note[]): string {
  const dated = note.capturedOn !== null && isDateStr(note.capturedOn)
  const day = dated && note.capturedOn !== null ? `${shortDay(note.capturedOn)} · ` : ''
  const parts = stateParts(note, fullDay)
  const goal = goalOf(note, notes)
  if (goal) parts.push(`к замыслу «${md(firstLine(goal.text))}»`)
  // Кривая дата называется прямо: без этого непонятно, почему запись в «Без даты».
  if (note.capturedOn !== null && !dated) parts.push(`дата не разобрана: «${md(note.capturedOn)}»`)
  return `- ${day}${md(note.text)} — ${parts.join(' · ')}`
}
