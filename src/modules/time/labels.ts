/**
 * Тексты учёта времени. Числа в них — из констант кода, а не цифрами
 * (правило в CLAUDE.md).
 */

import { formatDateLong, MONTHS_SHORT, plural, type DateStr, type Period } from '../../shared/core/dates.ts'
import { MINUTES_PER_DAY, type CategoryKind, type NameProblem, type PresetProblem } from './categories.ts'
import { DAY_WINDOW, type DayWindow } from './day.ts'
import {
  MAX_NORM_DAYS,
  MAX_NORM_MINUTES,
  NORM_MIN_WEEKS,
  NORM_RULES,
  type KindTotal,
  type MonthDay,
  type Norm,
  type NormCheck,
  type NormHistory,
  type NormProblem,
  type NormRule,
  type PeriodSummary,
  type WeekMark,
} from './period.ts'
import type { BlockProblem } from './retro.ts'
import { DEFAULT_TIMES, type RoutineProblem, type SleepTimes } from './sleep.ts'
import { datesText, specialTitle } from './specials.ts'
import type { Sleep, SpecialDays } from '../../app/model.ts'

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

/** Кнопка целиком, для чтения с экрана: «Чтение +30» — на ней самой только минуты. */
export function presetFullLabel(name: string, minutes: number): string {
  return `${name} ${presetLabel(minutes)}`
}

/** Раскрыть спрятанные кнопки строки: «ещё 2». */
export function morePresetsLabel(count: number): string {
  return `ещё ${count}`
}

/** Свернуть раскрытую строку кнопок. */
export const FEWER_PRESETS = 'свернуть'

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

/** Категории без группы — последней группой (Р-81). */
export const NO_GROUP = 'Без группы'
export const GROUP_EMPTY = 'Название группы — хотя бы одно слово'

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

/** Кнопка под «Блоками дня»: снять все блоки показанного дня. */
export const CLEAR_DAY = 'Очистить день'

/** Подтверждение «Очистить день»: сколько блоков и за какой день — с основанием. */
export function clearDayConfirm(count: number, day: DateStr): string {
  return `Убрать ${count} ${blocksWord(count)} за ${formatDateLong(day)}? Блоки других дней, таймер и особые дни не тронутся.`
}

/**
 * Граница окна дня словами: целый час — числом, «8», «24»; с минутами —
 * «7:30». После полуночи — по часам: 24,5 — «0:30»; ровно полночь в конце
 * окна — «24», как писалось до распорядка (Р-21, Р-94).
 */
export function windowBound(hours: number): string {
  const total = Math.round(hours * MINUTES_PER_HOUR)
  const inDay = total === MINUTES_PER_DAY ? total : total % MINUTES_PER_DAY
  const minutes = inDay % MINUTES_PER_HOUR
  const whole = Math.floor(inDay / MINUTES_PER_HOUR)
  return minutes === 0 ? String(whole) : `${whole}:${String(minutes).padStart(2, '0')}`
}

/** Окно дня словами: «с 8 до 24», «с 7:30 до 0:30». */
export function windowSpan(window: DayWindow): string {
  return `с ${windowBound(window.from)} до ${windowBound(window.to)}`
}

/** Пояснение к «неучтено» под итогом дня — окно показанного дня (Р-94). */
export function windowNote(window: DayWindow = DAY_WINDOW): string {
  return `Окно дня — ${windowSpan(window)}: неучтённое считается от прошедшей его части, а не от суток. Подъём и отбой — «Настройки» → «${ROUTINE_TITLE}».`
}

// ─── Распорядок (Р-94) ─────────────────────────────────────────────────────

/** Заголовок блока в «Настройках». */
export const ROUTINE_TITLE = 'Распорядок'

/** «07:30» → «7:30»: подъём и отбой словами. */
export function clockText(clock: string): string {
  return clock.replace(/^0(\d)/, '$1')
}

/** Подъём и отбой строкой: «подъём 7:30, отбой 0:30». */
export function timesText(times: SleepTimes): string {
  return `подъём ${clockText(times.wake)}, отбой ${clockText(times.bed)}`
}

/** Итог у свёрнутого «Распорядка»: действующий сегодня или по умолчанию. */
export function routineSummary(routine: Sleep | null): string {
  return routine ? timesText(routine) : `по умолчанию: ${timesText(DEFAULT_TIMES)}`
}

/** С какого дня действует распорядок; нет его — что окно по умолчанию. */
export function routineSinceLine(routine: Sleep | null): string {
  return routine?.since
    ? `Действует с ${formatDateLong(routine.since)}.`
    : `Распорядка ещё нет — окно дня по умолчанию, ${windowSpan(DAY_WINDOW)}.`
}

/** Как работает распорядок — под полями формы. */
export const ROUTINE_NOTE =
  'Окно дня — от подъёма до отбоя: от него считаются неучтённое время и реализм плана. Отбой раньше подъёма по часам — это после полуночи. ' +
  'Новый распорядок действует с сегодняшнего дня; прошлые дни считаются по тому, что действовал тогда. ' +
  'Распорядок общий для всех устройств — уезжает с синхронизацией.'

export const ROUTINE_PROBLEMS: Record<RoutineProblem, string> = {
  clock: 'Подъём и отбой — время: часы и минуты',
  same: 'Подъём и отбой совпадают — выберите разное время',
}

/** После «Сохранить»: окно с сегодняшнего дня. */
export function routineSavedLine(window: DayWindow): string {
  return `Сохранено: с сегодняшнего дня окно дня — ${windowSpan(window)}.`
}

/** «Сохранить» без изменений. */
export const ROUTINE_SAME = 'Распорядок тот же — сохранять нечего.'

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
 * Неделя не судится (`judged` ложно) — одни числа, без галочки (Р-91).
 */
export function checkText(check: NormCheck, judged = true): string {
  const text =
    check.rule === 'minDays'
      ? `${check.actual} из ${check.target} ${daysAfter(check.target)}`
      : check.rule === 'minMinutes'
        ? `${formatMinutes(check.actual)} из ${formatMinutes(check.target)}`
        : `${formatMinutes(check.actual)} при пределе ${formatMinutes(check.target)}`
  return judged && check.met ? `${text} ✓` : text
}

/** Подпись недели, задевшей особые дни (Р-91). */
export const SPECIAL_WEEK = 'особая неделя — не судится'

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** «Особая неделя — не судится: «Поездка», 7–9 октября 2026, 3 дня» — почему она не судится. */
export function specialWeekText(specials: readonly SpecialDays[]): string {
  const list = specials.map((special) => `«${specialTitle(special)}», ${datesText(special)}`).join('; ')
  return `${upperFirst(SPECIAL_WEEK)}: ${list}`
}

/**
 * Особые недели среди недель промежутка (Р-91): месяц — числами дней,
 * «Особая неделя 7–13 — не судится»; год — числом, «3 особые недели —
 * не судятся». Нет — null.
 */
export function specialMarksText(marks: readonly WeekMark[], cells: boolean): string | null {
  const special = marks.filter((mark) => mark.special)
  const count = special.length
  if (count === 0) return null
  const verb = plural(count, ['не судится', 'не судятся', 'не судятся'])
  if (!cells) return `${count} ${plural(count, ['особая неделя', 'особые недели', 'особых недель'])} — ${verb}`
  const list = special.map((mark) => weekCell(mark.week)).join(', ')
  return `${count === 1 ? 'Особая неделя' : 'Особые недели'} ${list} — ${verb}`
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

/** Как читать отметки по неделям месяца (Р-55, Р-56, Р-91). */
export const MARKS_BASIS =
  'Недели — те, чьё воскресенье в этом месяце. В счёт — закончившиеся, полные с дня нормы и без особых дней; ✓ — норма выполнена, «—» — нет.'

/** Как считаются нормы за год. */
export const YEAR_NORMS_BASIS =
  'Недели — те, чьё воскресенье в этом году. В счёт — закончившиеся, полные с дня нормы и без особых дней.'

/** История нормы словами: «выполнена в N из M недель» или когда появится. */
export function historyText(history: NormHistory): string {
  return history.enough ? keptText(history.kept, history.weeks) : historyWaitText(history.since, history.weeks)
}

// ─── Итог промежутка (Р-43) ────────────────────────────────────────────────

/** Строка итога после подписи с двоеточием: «Август: учтено …». */
export function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

/**
 * Итог промежутка — с основанием: сколько блоков и в скольких днях из
 * наступивших. Были особые дни — итог по обычным, и особые названы (Р-91):
 * «учёт был в 5 днях из 5 обычных; особых — 2».
 */
export function periodLine(summary: PeriodSummary): string {
  const special = `особых — ${summary.specialDays}`
  if (summary.count === 0) return summary.specialDays === 0 ? 'Ничего не учтено' : `Ничего не учтено в обычные дни · ${special}`
  let days = `учёт был в ${summary.days} ${plural(summary.days, ['дне', 'днях', 'днях'])} из ${summary.elapsedDays}`
  if (summary.specialDays > 0) days += ` ${plural(summary.elapsedDays, ['обычного', 'обычных', 'обычных'])}; ${special}`
  return `Учтено ${formatMinutes(summary.total)} · ${summary.count} ${blocksWord(summary.count)} · ${days}`
}

// ─── Месяц по дням (Р-92) ──────────────────────────────────────────────────

/**
 * Подписан первый день и каждый `DAY_LABEL_STEP`-й: столбцов до тридцати
 * одного, и на телефоне подпись каждого налезла бы на соседнюю.
 */
export const DAY_LABEL_STEP = 5

/** Подпись под столбцом дня — число дня или пусто. */
export function dayLabel(date: DateStr): string {
  const day = Number(date.slice(8, 10))
  return day === 1 || day % DAY_LABEL_STEP === 0 ? String(day) : ''
}

/** Подсказка столбца дня: учтено с основанием; особый и будущий — словами, почему столбца нет. */
export function dayTitle(day: MonthDay): string {
  const date = formatDateLong(day.date)
  if (day.special) return `${date}: особый день «${specialTitle(day.special)}» — в итог месяца не входит`
  if (day.future) return `${date}: ещё не наступил`
  return `${date}: ${lowerFirst(summaryLine(day.value ?? 0, day.count))}`
}

/**
 * Подсказка малого столбика недели месяца (Р-93): «6–12 окт: 3 ч 20 мин».
 * Неделя внутри одного месяца — он назван один раз; неделя из одного дня — «1 окт».
 */
export function weekBarTitle(week: Period, minutes: number): string {
  const day = (date: DateStr) => Number(date.slice(8, 10))
  const month = MONTHS_SHORT[Number(week.from.slice(5, 7)) - 1] ?? ''
  const days = week.from === week.to ? `${day(week.from)}` : `${day(week.from)}–${day(week.to)}`
  return `${days} ${month}: ${formatMinutes(minutes)}`
}

/** Категории строкой — «Чтение 1 ч · Ходьба 3 ч»: для особого периода, где таблица была бы лишней. */
export function categoriesLine(byCategory: readonly { name: string | null; minutes: number }[]): string {
  return byCategory
    .filter((row) => row.minutes > 0)
    .map((row) => `${row.name ?? UNKNOWN_CATEGORY} ${formatMinutes(row.minutes)}`)
    .join(' · ')
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
