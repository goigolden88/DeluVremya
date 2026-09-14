/**
 * Тексты учёта времени. Числа в них — из констант кода, а не цифрами
 * (правило в CLAUDE.md).
 */

import { formatDateLong, plural, type DateStr, type Period } from '../../core/dates.ts'
import { MINUTES_PER_DAY, type CategoryKind, type NameProblem, type PresetProblem } from './categories.ts'
import { DAY_WINDOW } from './day.ts'
import {
  MAX_NORM_DAYS,
  MAX_NORM_MINUTES,
  NORM_MIN_WEEKS,
  NORM_RULES,
  type KindTotal,
  type Norm,
  type NormCheck,
  type NormHistory,
  type NormProblem,
  type NormRule,
  type PeriodSummary,
  type WeekMark,
} from './period.ts'
import type { BlockProblem } from './retro.ts'

/**
 * Признак категории. Нужен только обзору недели (Р-05): на экране дня
 * он не красит ничего, и слова «вредное» нет нигде.
 */
export const KIND_LABELS: Record<CategoryKind, string> = {
  useful: 'полезное',
  neutral: 'нейтральное',
  idle: 'праздное',
}

export const NAME_PROBLEMS: Record<NameProblem, string> = {
  empty: 'Название пустое',
  duplicate: 'Такая категория уже есть',
  archived: 'Такая категория лежит в архиве — верните её оттуда',
}

export const PRESET_PROBLEMS: Record<PresetProblem, string> = {
  range: `Минуты — целым числом, от одной до ${MINUTES_PER_DAY}`,
  duplicate: 'Такая кнопка у категории уже есть',
}

/** Удаление пустой категории — после подтверждения (Р-22). */
export function deleteConfirm(name: string): string {
  return `Удалить категорию «${name}»? Её кнопки уйдут вместе с ней.`
}

/** Удаление категории с блоками — только переносом (Р-22). Число — с основанием. */
export function moveLine(name: string, count: number): string {
  return `На «${name}» записано ${count} ${blocksWord(count)}. Удалить можно, только перенеся их в другую категорию:`
}

/** Подпись кнопки: «+30». Категория стоит рядом. */
export function presetLabel(minutes: number): string {
  return `+${minutes}`
}

const MINUTES_PER_HOUR = 60

/** `45` → `45 мин`, `60` → `1 ч`, `90` → `1 ч 30 мин`. */
export function formatMinutes(total: number): string {
  const rounded = Math.max(0, Math.round(total))
  const hours = Math.floor(rounded / MINUTES_PER_HOUR)
  const minutes = rounded % MINUTES_PER_HOUR
  if (hours === 0) return `${minutes} мин`
  return minutes === 0 ? `${hours} ч` : `${hours} ч ${minutes} мин`
}

/** Категория блока, которой нет ни живой, ни в надгробиях. */
export const UNKNOWN_CATEGORY = 'без категории'

export function blocksWord(count: number): string {
  return plural(count, ['блок', 'блока', 'блоков'])
}

/** Главная строка итога: сумма с основанием — по скольким блокам. */
export function summaryLine(total: number, count: number): string {
  return count === 0 ? 'За день ничего не учтено' : `Учтено ${formatMinutes(total)} · ${count} ${blocksWord(count)}`
}

/** Неучтённое — с основанием: от чего оно считается (Р-21). */
export function unaccountedLine(unaccounted: number, elapsed: number): string {
  return `Неучтено ${formatMinutes(unaccounted)} из прошедших ${formatMinutes(elapsed)} окна дня`
}

/** Отклик на тап: что записано и сколько теперь по этой категории за день. */
export function addedLine(name: string, minutes: number, categoryTotal: number): string {
  return `Записано: ${name}, ${formatMinutes(minutes)}. По категории за день — ${formatMinutes(categoryTotal)}`
}

export const BLOCK_PROBLEMS: Record<BlockProblem, string> = {
  category: 'Не выбрана категория',
  minutes: PRESET_PROBLEMS.range,
  date: 'День не разобрался',
  future: 'Учёт — про то, что было: день в будущем не записывается',
  'same-bg': 'Фоном — другая категория: та же самая была бы тем же часом, записанным дважды',
}

/** Идущий таймер: что, сколько и что фоном. */
export function runningLine(name: string, minutes: number, background?: string | null): string {
  const line = `Идёт: ${name} · ${formatMinutes(minutes)}`
  return background ? `${line}, фоном ${background}` : line
}

function clock(moment: Date): string {
  return `${String(moment.getHours()).padStart(2, '0')}:${String(moment.getMinutes()).padStart(2, '0')}`
}

/**
 * С какого времени идёт. Запущен вчера — сказано, что блок ляжет на тот
 * день (Р-19): иначе запись после полуночи пропала бы из сегодняшнего
 * итога молча.
 */
export function startedLine(start: Date, date: DateStr, today: DateStr): string {
  return date === today
    ? `С ${clock(start)}`
    : `С ${clock(start)}, ${formatDateLong(date)} — блок ляжет на тот день`
}

/** Что записано. Не сегодня — с датой: блок не виден в итоге дня, и это сказано. */
export function savedLine(name: string, minutes: number, date: DateStr, today: DateStr): string {
  return date === today
    ? `Записано: ${name}, ${formatMinutes(minutes)}`
    : `Записано на ${formatDateLong(date)}: ${name}, ${formatMinutes(minutes)}`
}

/**
 * Подпись над кнопками прошлого дня (Р-25): тап пишет в показанный день,
 * и без подписи запись во вчера была бы незаметна.
 */
export function writingFor(day: DateStr): string {
  return `Кнопки записывают на ${formatDateLong(day)}`
}

/** Пояснение к «неучтено» под итогом дня. */
export function windowNote(): string {
  return `Окно дня — с ${DAY_WINDOW.from} до ${DAY_WINDOW.to}: неучтённое считается от прошедшей его части, а не от суток.`
}

// ─── Нормы недели (Р-45) ───────────────────────────────────────────────────

export const NORM_PROBLEMS: Record<NormProblem, string> = {
  days: `Дней — целым числом, от одного до ${MAX_NORM_DAYS}`,
  hours: `Часы — числом больше нуля и не больше ${MAX_NORM_MINUTES / MINUTES_PER_HOUR}`,
  order: 'Предел «не больше» меньше нормы «не меньше»',
}

/** После «из» и «не меньше»: «из 1 дня», «из 3 дней», «из 21 дня». */
function daysAfter(count: number): string {
  return plural(count, ['дня', 'дней', 'дней'])
}

/** Правило словами: «не меньше 3 дней», «не меньше 5 ч», «не больше 10 ч». */
export function normRuleText(rule: NormRule, target: number): string {
  if (rule === 'minDays') return `не меньше ${target} ${daysAfter(target)}`
  return `${rule === 'minMinutes' ? 'не меньше' : 'не больше'} ${formatMinutes(target)}`
}

/** Норма целиком, правила по порядку. */
export function normText(norm: Norm): string {
  return NORM_RULES.flatMap((rule) => {
    const target = norm[rule]
    return target === undefined ? [] : [normRuleText(rule, target)]
  }).join(' · ')
}

/**
 * Как идёт правило: «2 из 3 дней», «4 ч из 5 ч», «11 ч при пределе 10 ч».
 * Выполненное — галочкой; невыполненное — без цвета и без упрёка (Р-05).
 */
export function checkText(check: NormCheck): string {
  const text =
    check.rule === 'minDays'
      ? `${check.actual} из ${check.target} ${daysAfter(check.target)}`
      : check.rule === 'minMinutes'
        ? `${formatMinutes(check.actual)} из ${formatMinutes(check.target)}`
        : `${formatMinutes(check.actual)} при пределе ${formatMinutes(check.target)}`
  return check.met ? `${text} ✓` : text
}

/** Вместо серии (Р-45): в скольких из последних недель норма выполнена. */
export function keptText(kept: number, weeks: number): string {
  return `выполнена в ${kept} из ${weeks} ${plural(weeks, ['недели', 'недель', 'недель'])}`
}

/** С какого дня норма: «с 14 сентября 2026» (Р-56). */
export function normSinceText(since: DateStr): string {
  return `с ${formatDateLong(since)}`
}

/**
 * Истории ещё нет (Р-53, Р-56): с какого дня норма и сколько полных недель
 * набралось из нужных. Строка есть всегда — история не пропадает молча.
 */
export function historyWaitText(since: DateStr | null, weeks: number): string {
  const need = `история — с ${NORM_MIN_WEEKS} ${plural(NORM_MIN_WEEKS, ['полной недели', 'полных недель', 'полных недель'])}, пока ${weeks}`
  return since === null ? need : `норма ${normSinceText(since)} · ${need}`
}

/** Неделя в отметках нормы — числами дней: «7–13», через месяц «31–6». */
export function weekCell(week: Period): string {
  return `${Number(week.from.slice(8))}–${Number(week.to.slice(8))}`
}

/**
 * Отметки нормы по неделям в счёт (Р-55): «31–6 ✓ · 7–13 —». Недели не
 * в счёт не показываются — число недель в счёт названо в строке истории.
 */
export function marksLine(marks: readonly WeekMark[]): string {
  return marks
    .filter((mark) => mark.counted)
    .map((mark) => `${weekCell(mark.week)} ${mark.met ? '✓' : '—'}`)
    .join(' · ')
}

/** Как читать отметки по неделям месяца (Р-55, Р-56). */
export const MARKS_BASIS =
  'Недели — те, чьё воскресенье в этом месяце. В счёт — закончившиеся и полные с дня нормы; ✓ — норма выполнена, «—» — нет.'

/** Как считаются нормы за год. */
export const YEAR_NORMS_BASIS = 'Недели — те, чьё воскресенье в этом году. В счёт — закончившиеся и полные с дня нормы.'

/** История нормы словами: «выполнена в N из M недель» или когда появится. */
export function historyText(history: NormHistory): string {
  return history.enough ? keptText(history.kept, history.weeks) : historyWaitText(history.since, history.weeks)
}

// ─── Итог промежутка (Р-43) ────────────────────────────────────────────────

/** Строка итога после подписи с двоеточием: «Август: учтено …». */
export function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

/** Итог промежутка — с основанием: сколько блоков и в скольких днях из наступивших. */
export function periodLine(summary: PeriodSummary): string {
  if (summary.count === 0) return 'Ничего не учтено'
  const days = `учёт был в ${summary.days} ${plural(summary.days, ['дне', 'днях', 'днях'])} из ${summary.elapsedDays}`
  return `Учтено ${formatMinutes(summary.total)} · ${summary.count} ${blocksWord(summary.count)} · ${days}`
}

/** По признаку категории — только в обзоре (Р-05). */
export function kindLine(byKind: readonly KindTotal[]): string {
  return byKind
    .map((each) => `${each.kind === null ? 'без признака' : KIND_LABELS[each.kind]} ${formatMinutes(each.minutes)}`)
    .join(' · ')
}

/** Фоновое у категории — отдельно и не в сумме (Р-43). */
export function backgroundText(minutes: number): string {
  return `ещё ${formatMinutes(minutes)} фоном`
}

/** Пояснение к блоку «Неделя» на экране учёта. */
export function progressLead(from: DateStr): string {
  return `С понедельника, ${formatDateLong(from)}. Здесь нормы «не меньше»; пределы «не больше» — только в обзоре недели.`
}
