/**
 * Срез итогов «Делу Время» для метаприложения семьи (Р-87; Я-16…Я-20
 * «FamilyCore»).
 *
 * Итоги считает хозяин данных своими функциями (Я-11 «FamilyCore»): здесь
 * они только переложены в форму договора — показатель с ключом, подписью,
 * значением и основанием. Состав — таблица «Состав» договора (Я-19
 * «FamilyCore»): минуты по группам и фон отдельно, счёты плана и факта,
 * нормы недели вердиктом, «требует внимания» — непроведённый обзор.
 *
 * Чего здесь нет намеренно: текстов заметок и пунктов плана, повторов
 * (Я-14 «FamilyCore»); средних на день (Р-55), разбивки по признаку (Р-05),
 * серий (Р-45) — метаприложение показывает, а не досчитывает (Я-15
 * «FamilyCore»). Настроек устройства — порогов обзора, идущего таймера —
 * тоже: срез считается только из синхронизируемых записей (Я-16 «FamilyCore»).
 *
 * Живёт в `screens/`, а не в модуле: читает и учёт времени, и заметки,
 * и обзоры (Р-10).
 */

import { days, formatDateLong, formatPeriod, periodDays, plural, weekPeriod, type DateStr } from '../shared/core/dates.ts'
import {
  summaryPeriods,
  UNKNOWN,
  type Attention,
  type Metric,
  type PeriodSummary,
  type SummaryBody,
  type SummaryPeriod,
} from '../shared/core/summary.ts'
import type { StoreRecord, SyncedStore } from '../app/model.ts'
import { activeCategories } from '../modules/time/categories.ts'
import { byGroup, hasGroups, type GroupTotal } from '../modules/time/groups.ts'
import { blocksWord, checkText, formatMinutes, NO_GROUP, normText } from '../modules/time/labels.ts'
import { periodSummary, weekNorms, type PeriodSummary as TimeSummary, type WeekNorm } from '../modules/time/period.ts'
import { PLAN_FACT_BASIS, planFact, type PlanFact } from '../modules/notes/period.ts'
import { reviewCall } from './review.ts'

/** Живые записи синхронизируемых хранилищ — то, что даёт срезу ядро. */
export type SummaryData = { [S in SyncedStore]: StoreRecord[S][] }

/** Свои причины «не известно» — сверх общих кодов ядра. */
export const OWN_UNKNOWN = {
  /** Неделя не полная с дня нормы — не судится (Р-56). */
  normSince: 'norm-since',
  /** Главное дело не выбиралось ни в одном дне. */
  noMain: 'no-main',
  /** Ни у одного пункта нет оценки. */
  noEstimates: 'no-estimates',
} as const

// ─── Ключи (Р-87) ──────────────────────────────────────────────────────────

/**
 * Ключи показателей. Устойчивы между срезами: по ним метаприложение ставит
 * строки рядом. Ключ группы — её нормализованное название (`groupKey`):
 * переименование группы меняет ключ (Я-17 «FamilyCore», «Цена», п. 3).
 * Ключ нормы — id категории: он переживает переименование (Р-29).
 */
export const KEYS = {
  total: 'time.total',
  group: (key: string) => `time.group.${key}`,
  ungrouped: 'time.ungrouped',
  background: (key: string) => `time.background.${key}`,
  ungroupedBackground: 'time.background.ungrouped',
  planned: 'plan.planned',
  done: 'plan.done',
  late: 'plan.late',
  waiting: 'plan.waiting',
  main: 'plan.main',
  estimate: 'plan.estimate',
  norm: (categoryId: string) => `norm.${categoryId}`,
  review: 'review',
} as const

// ─── Основания ─────────────────────────────────────────────────────────────

function inDays(count: number): string {
  return `${count} ${plural(count, ['дне', 'днях', 'днях'])}`
}

/** «учёт в 5 днях из 7»; у идущего — «в 2 днях из 3 прошедших, отрезок — 7 дней». */
function recordedText(time: TimeSummary, length: number): string {
  const recorded = `учёт в ${inDays(time.days)} из ${time.elapsedDays}`
  if (time.elapsedDays >= length) return recorded
  return `${recorded} ${plural(time.elapsedDays, ['прошедшего', 'прошедших', 'прошедших'])}, отрезок — ${days(length)}`
}

// ─── Время ─────────────────────────────────────────────────────────────────

/** Группы рабочих категорий по порядку — строки есть и у группы без минут. */
function activeGroups(data: SummaryData): { key: string | null; name: string | null }[] {
  const categories = data.categories
  return byGroup(activeCategories(categories), categories, (category) => category.id).map(({ key, name }) => ({
    key,
    name,
  }))
}

function timeMetrics(data: SummaryData, time: TimeSummary, length: number): Metric[] {
  const recorded = recordedText(time, length)
  if (time.count === 0) {
    // Модель не отличает «не учитывал» от «не делал»: ноль соврал бы.
    return [
      {
        key: KEYS.total,
        label: 'Учтено',
        value: {
          unknown: UNKNOWN.noData,
          text: 'За отрезок ни одного блока: не учитывал или не делал — по записям не различить',
        },
        basis: recorded,
      },
    ]
  }

  const metrics: Metric[] = [
    {
      key: KEYS.total,
      label: 'Учтено',
      value: { n: time.total, unit: 'minutes' },
      basis: `${recorded}, ${time.count} ${blocksWord(time.count)}; фоновое в сумму не входит`,
    },
  ]
  // Пока групп нет ни у одной категории — итог только общий, как на экранах (Р-81).
  if (!hasGroups(data.categories)) return metrics

  // Сначала группы рабочих категорий по порядку — и без минут, затем
  // группы только архивных категорий, у которых в отрезке есть блоки.
  const totals = new Map(time.byGroup.map((group) => [group.key, group]))
  const shown = activeGroups(data)
  const listed = new Set(shown.map((group) => group.key))
  const rows = [...shown, ...time.byGroup.filter((group) => !listed.has(group.key))]
  for (const { key, name } of rows) {
    const total: GroupTotal = totals.get(key) ?? { key, name, minutes: 0, count: 0, days: 0, background: 0 }
    const label = name ?? NO_GROUP
    metrics.push({
      key: key === null ? KEYS.ungrouped : KEYS.group(key),
      label,
      value: { n: total.minutes, unit: 'minutes' },
      basis:
        total.count === 0
          ? `блоков группы нет; ${recorded}`
          : `${total.count} ${blocksWord(total.count)} в ${inDays(total.days)}; ${recorded}`,
    })
    if (total.background > 0) {
      metrics.push({
        key: key === null ? KEYS.ungroupedBackground : KEYS.background(key),
        label: `${label} — фоном`,
        value: { n: total.background, unit: 'minutes' },
        basis: 'фоновое в сумму не входит: это время уже учтено у основной категории блока',
      })
    }
  }
  return metrics
}

// ─── План и факт ───────────────────────────────────────────────────────────

/** «из 1 намеченного», «из 5 намеченных» — после «из» родительный. */
function ofCount(count: number, forms: [string, string, string]): string {
  return `из ${count} ${plural(count, forms)}`
}

const OF_PLANNED: [string, string, string] = ['намеченного', 'намеченных', 'намеченных']
const OF_DONE: [string, string, string] = ['сделанного', 'сделанных', 'сделанных']
/** «1 намеченный, …», «5 намеченных, …». */
const PLANNED: [string, string, string] = ['намеченный', 'намеченных', 'намеченных']

function planMetrics(fact: PlanFact): Metric[] {
  const planned: Metric = {
    key: KEYS.planned,
    label: 'Намечено',
    value: { n: fact.planned, unit: 'count' },
    basis:
      fact.planned === 0
        ? 'Пунктов плана с днём в отрезке нет'
        : `Пункты плана с днём в отрезке, открытые и сделанные. ${PLAN_FACT_BASIS}`,
  }
  if (fact.planned === 0) return [planned]

  const of = ofCount(fact.planned, OF_PLANNED)
  const rest = fact.today + fact.ahead
  return [
    planned,
    {
      key: KEYS.done,
      label: 'Сделано',
      value: { n: fact.done, unit: 'count' },
      basis: fact.late > 0 ? `${of}; из них ${fact.late} позже своего дня` : of,
    },
    {
      key: KEYS.late,
      label: 'Сделано позже своего дня',
      value: { n: fact.late, unit: 'count' },
      basis: `${ofCount(fact.done, OF_DONE)}; день факта — когда отмечено сделанным`,
    },
    {
      key: KEYS.waiting,
      label: 'Ждут решения',
      value: { n: fact.waiting, unit: 'count' },
      basis: `открытые, чей день прошёл, ${of}` + (rest > 0 ? `; ещё ${rest} — на сегодня и впереди` : ''),
    },
    {
      key: KEYS.main,
      label: 'Главное сделано',
      value:
        fact.mainDays === 0
          ? { unknown: OWN_UNKNOWN.noMain, text: 'Главное дело не выбиралось ни в одном дне' }
          : { n: fact.mainDone, unit: 'days' },
      basis:
        fact.mainDays === 0
          ? `${fact.planned} ${plural(fact.planned, PLANNED)}, ни в одном дне нет главного`
          : `в ${fact.mainDone} из ${fact.mainDays} ${plural(fact.mainDays, ['дня', 'дней', 'дней'])}, где главное было выбрано`,
    },
    {
      key: KEYS.estimate,
      label: 'Сделано по оценкам',
      value:
        fact.estimated === 0
          ? { unknown: OWN_UNKNOWN.noEstimates, text: 'Ни у одного пункта нет оценки' }
          : { n: fact.estDone, unit: 'minutes' },
      basis:
        fact.estimated === 0
          ? `${fact.planned} ${plural(fact.planned, PLANNED)}, оценок нет`
          : `из ${formatMinutes(fact.estPlanned)} по оценкам; пунктов с оценкой ${fact.estimated} ${of}`,
    },
  ]
}

// ─── Нормы недели ──────────────────────────────────────────────────────────

function normMetric(row: WeekNorm, running: string | null): Metric {
  const key = KEYS.norm(row.category.id)
  const label = `Норма: ${row.category.name}`
  const rules = normText(row.category.norm ?? {})
  if (running !== null) {
    // Идущая неделя не судится досрочно: предел «уже провален» среди недели —
    // тот же ежедневный упрёк, который Р-45 убирает с экрана учёта.
    return {
      key,
      label,
      value: { verdict: 'open' },
      basis: `${rules}; ${running} — судится по её окончании`,
    }
  }
  // Последняя отметка истории — сама неделя (`weekNorms`).
  const mark = row.history.marks[row.history.marks.length - 1]
  if (!mark?.counted) {
    const since = row.history.since
    if (since !== null && mark !== undefined && mark.week.from < since) {
      return {
        key,
        label,
        value: {
          unknown: OWN_UNKNOWN.normSince,
          text: `Норма с ${formatDateLong(since)}: неделя не полная с её дня и не судится`,
        },
        basis: rules,
      }
    }
    return {
      key,
      label,
      value: { unknown: UNKNOWN.noData, text: 'Учёт начат после этой недели — судить не по чему' },
      basis: rules,
    }
  }
  const facts = row.checks.map(checkText).join('; ')
  const background = row.background > 0 ? `; ещё ${formatMinutes(row.background)} фоном в норму не входят` : ''
  return {
    key,
    label,
    value: { verdict: mark.met ? 'met' : 'failed' },
    basis: `${rules}: ${facts}${background}`,
  }
}

// ─── Отрезок ───────────────────────────────────────────────────────────────

function periodOf(data: SummaryData, period: SummaryPeriod, day: DateStr): PeriodSummary {
  const running = period.from <= day && day <= period.to
  const time = periodSummary(data.time, data.categories, period, day)
  const length = periodDays(period).length
  const metrics = [...timeMetrics(data, time, length), ...planMetrics(planFact(data.notes, period, day))]
  if (period.grain === 'week') {
    const runningText = running ? `неделя идёт: прошло ${days(time.elapsedDays)} из ${length}` : null
    for (const row of weekNorms(data.time, data.categories, period.from, day)) metrics.push(normMetric(row, runningText))
  }
  // Идущий отрезок верен по день расчёта; прошлый — окончательный по форме,
  // хотя ретро-ввод (Р-19) может его поправить: это видно по `lastEdit`.
  return { ...period, through: running ? day : null, metrics }
}

// ─── Требует внимания ──────────────────────────────────────────────────────

/**
 * Обзор закончившейся недели не проведён (Я-18 «FamilyCore»): в тот же день,
 * когда к нему зовёт само приложение, и только если неделя уже кончилась, —
 * метаприложение не громче приложения, долг не копится (Р-41, Р-51).
 */
function reviewAttention(data: SummaryData, day: DateStr): Attention[] {
  const week = reviewCall(data.reviews, day)
  if (week === null) return []
  const period = weekPeriod(week)
  if (period.to >= day) return []
  return [
    {
      key: KEYS.review,
      label: 'Обзор недели не проведён',
      count: null,
      day: period.to,
      link: `/review?week=${week}`,
      basis: `Записи обзора за неделю ${formatPeriod(period)} нет на день расчёта; обзор с другого устройства виден после его синхронизации`,
    },
  ]
}

// ─── Срез ──────────────────────────────────────────────────────────────────

/** Тело среза на день `day`: четыре отрезка ядра и «требует внимания». */
export function summary(data: SummaryData, day: DateStr): SummaryBody {
  return {
    periods: summaryPeriods(day).map((period) => periodOf(data, period, day)),
    attention: reviewAttention(data, day),
  }
}
