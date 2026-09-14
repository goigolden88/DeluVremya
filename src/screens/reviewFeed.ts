/**
 * Обзор недели в ленте и в выгрузке markdown (Р-60, Р-63).
 *
 * Обзор — не модуль (Р-10), и его строки живут здесь, рядом с экраном.
 * Строка стоит в дне проведения: лента — хроника того, что было. Под ней —
 * наблюдение недели: обычная мысль, на которую обзор ссылается (Р-49).
 *
 * Чистые функции, без React и без базы.
 */

import { formatDate, formatPeriod, inPeriod, isDateStr, toDateStr, weekPeriod, type DateStr, type Period } from '../core/dates.ts'
import { escapeMarkdown as md, type FeedItem } from '../core/feed.ts'
import type { Note, Review } from '../core/model.ts'

/** Ссылка на заметку в `refs` — вид записи в начале строки (02-Архитектура). */
const NOTE_REF = 'note:'

/** День проведения по часам устройства. Null — время кривое. */
function doneDay(review: Review): DateStr | null {
  const at = new Date(review.doneAt)
  return Number.isNaN(at.getTime()) ? null : toDateStr(at)
}

/** Неделя словами: «7–13 сентября 2026». Кривая — как лежит. */
function weekText(review: Review): string {
  return isDateStr(review.weekStart) ? formatPeriod(weekPeriod(review.weekStart)) : review.weekStart
}

/** Наблюдения недели — живые заметки, на которые ссылается обзор. Удалённая молчит. */
function observations(review: Review, notes: readonly Note[]): Note[] {
  return (review.refs ?? [])
    .filter((ref) => ref.startsWith(NOTE_REF))
    .flatMap((ref) => {
      const id = ref.slice(NOTE_REF.length)
      const note = notes.find((each) => each.id === id && !each.deleted)
      return note ? [note] : []
    })
}

function firstLine(text: string): string {
  return text.split('\n')[0] ?? ''
}

export function reviewFeed(reviews: readonly Review[], notes: readonly Note[]): FeedItem[] {
  return reviews
    .filter((review) => !review.deleted)
    .map((review): FeedItem => {
      const seen = observations(review, notes)
      return {
        kind: 'review',
        id: review.id,
        date: doneDay(review) ?? '',
        title: `Обзор недели ${weekText(review)}`,
        detail: seen.map((note) => firstLine(note.text)).join(' · '),
        ...(seen.length > 0 ? { extra: seen.map((note) => note.text).join(' ') } : {}),
        ...(isDateStr(review.weekStart) ? { link: `/review?week=${review.weekStart}` } : {}),
      }
    })
}

/** Раздел выгрузки: неделя, когда проведён, наблюдения подпунктами. От старых к новым. */
export function reviewMarkdown(reviews: readonly Review[], notes: readonly Note[], period: Period | null = null): string {
  // За период — по понедельнику недели (Р-79).
  const live = reviews
    .filter((review) => !review.deleted && (period === null || inPeriod(review.weekStart, period)))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
  if (live.length === 0) return 'Записей нет.'

  return live
    .flatMap((review) => {
      const day = doneDay(review)
      const head = `- ${md(weekText(review))}` + (day === null ? '' : ` — проведён ${formatDate(day)}`)
      return [head, ...observations(review, notes).map((note) => `  - ${md(note.text)}`)]
    })
    .join('\n')
}
