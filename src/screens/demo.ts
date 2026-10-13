/**
 * Демо-данные «Делу Время» (Я-44, Я-45 «FamilyCore»): выдуманные записи
 * каждого хранилища от дня входа в демо — план вчера и сегодня, входящие,
 * замысел с делами, две недели учёта времени, обзор прошлой недели,
 * особые дни и распорядок. Даты — от `day`, так демо всегда живое.
 *
 * Ядро кладёт эти записи в свою базу `deluvremya-demo` при её создании;
 * синхронизации у неё нет. Репозиторий публичный — ничего настоящего.
 *
 * Живёт в `screens/`, а не в `app/`: знает оба модуля, как срез итогов
 * (Р-10). Полноту проверяет `checkDemo` ядра — `demo.test.ts`: новое
 * хранилище без строки здесь — красный тест.
 */

import { addDays, daysBetween, weekPeriod, weekStart, type DateStr } from '../shared/core/dates.ts'
import { ulid } from '../shared/core/id.ts'
import type { Category, DayTemplate, Note, Review, Sleep, SpecialDays, StoreRecord, TimeBlock } from '../app/model.ts'
import { initialCategories, initialPresets, type SeedCategory } from '../modules/time/categories.ts'
import { STARTER } from '../modules/time/starter.ts'

/** Записи демо по хранилищам — форма `AppConfig.demo`. */
export type DemoData = { [S in keyof StoreRecord]: StoreRecord[S][] }

/** Сколько дней назад тянется учёт времени в демо: хватает на обзор недели и график. */
const TIME_DAYS = 14

/**
 * Категории демо: стартовый набор и два выдуманных занятия перед «Прочим» —
 * в наборе нет бездельного, а без него неделя не похожа на жизнь.
 */
const OTHER = 'Прочее'
const SEED: readonly SeedCategory[] = [
  ...STARTER.filter((each) => each.name !== OTHER),
  { name: 'Гитара', kind: 'neutral', presets: [30, 60], group: 'Развитие' },
  { name: 'Сериалы', kind: 'idle', presets: [30, 60], group: 'Отдых' },
  ...STARTER.filter((each) => each.name === OTHER),
]

/**
 * Неделя учёта по категориям демо: минуты по дням недели, с понедельника.
 * Ноль — блока нет. Похоже на жизнь, а не на таблицу: сериалы растут
 * к выходным, зарядку пропускают.
 */
const WEEK: Readonly<Record<string, readonly number[]>> = {
  Зарядка: [15, 15, 0, 15, 15, 0, 30],
  Чтение: [30, 0, 45, 30, 0, 60, 90],
  Гитара: [0, 30, 0, 0, 60, 0, 0],
  Сериалы: [30, 60, 30, 45, 90, 120, 60],
  Прогулка: [0, 30, 0, 30, 0, 90, 60],
  Прочее: [60, 45, 30, 60, 30, 0, 0],
}

export function demo(day: DateStr): DemoData {
  const at = `${day}T08:00:00.000Z`
  const stamp = Date.parse(at)
  let n = 0
  /** `Base` записи: id по времени входа, по порядку. */
  const base = () => ({ id: ulid(stamp + n++), updatedAt: at })

  const categories: Category[] = initialCategories(SEED).map((category) =>
    category.name === 'Чтение' ? { ...category, norm: { minDays: 4, minMinutes: 180 } } : category,
  )
  const idOf = (name: string): string => categories.find((category) => category.name === name)?.id ?? ''

  const yesterday = addDays(day, -1)
  const goal: Note = {
    ...base(),
    text: 'Пробежать десять километров к весне',
    kind: 'goal',
    capturedOn: addDays(day, -20),
    plannedFor: null,
    status: 'open',
  }
  const task = (text: string, plannedFor: DateStr | null, more: Partial<Note> = {}): Note => ({
    ...base(),
    text,
    kind: 'task',
    capturedOn: addDays(day, -3),
    plannedFor,
    status: 'open',
    ...more,
  })

  const notes: Note[] = [
    goal,
    // Сегодня: главное дело и остальное с оценками — видно, влезает ли день.
    task('Дописать отчёт по проекту', day, { main: true, estMin: 90, order: 0 }),
    task('Пробежка, три километра', day, { estMin: 30, order: 1, refs: [`note:${goal.id}`] }),
    task('Позвонить в сервис насчёт стиральной машины', day, { estMin: 15, order: 2 }),
    task('Разобрать почту', day, { estMin: 30, order: 3 }),
    // Вчера: сделанное и одно несделанное — его предложат перенести.
    task('Купить продукты на неделю', yesterday, { status: 'done', doneOn: yesterday, estMin: 45 }),
    task('Пробежка, два километра', yesterday, { status: 'done', doneOn: yesterday, refs: [`note:${goal.id}`] }),
    task('Записаться к стоматологу', yesterday, { estMin: 10 }),
    // Входящие: записано одной строкой, не разобрано.
    task('Подарок маме на день рождения', null, { capturedOn: yesterday }),
    { ...task('Читать перед сном вместо сериалов — засыпаю быстрее', null), kind: 'thought', capturedOn: day },
    task('Разобрать на гитаре новую песню', null, { status: 'someday', capturedOn: addDays(day, -10) }),
  ]

  const time: TimeBlock[] = []
  for (let back = TIME_DAYS; back >= 0; back--) {
    const date = addDays(day, -back)
    // Понедельник — 0: от понедельника недели этого дня.
    const weekday = daysBetween(weekStart(date), date)
    for (const [name, minutes] of Object.entries(WEEK)) {
      const value = minutes[weekday] ?? 0
      // Сегодня — только утро: день ещё идёт.
      if (value === 0 || (back === 0 && name !== 'Зарядка')) continue
      time.push({ ...base(), date, categoryId: idOf(name), minutes: value })
    }
  }

  const lastWeek = weekPeriod(addDays(day, -7))
  const reviews: Review[] = [
    {
      ...base(),
      weekStart: lastWeek.from,
      doneAt: `${addDays(lastWeek.to, 1)}T19:30:00.000Z`,
      note: 'Сериалов больше, чем хотелось; чтение держится.',
    },
  ]

  const templates: DayTemplate[] = [
    {
      ...base(),
      name: 'Рабочий день',
      order: 0,
      items: [
        { title: 'Главное по работе', estMin: 120, main: true },
        { title: 'Почта и сообщения', estMin: 30 },
        { title: 'Прогулка', estMin: 30 },
      ],
    },
  ]

  const specials: SpecialDays[] = [
    { ...base(), from: addDays(day, -24), to: addDays(day, -22), title: 'Поездка на дачу' },
  ]

  const routineSince = addDays(day, -30)
  const sleep: Sleep[] = [
    { id: `routine:${routineSince}`, updatedAt: at, since: routineSince, wake: '07:00', bed: '23:30' },
    { id: `sleep:${yesterday}`, updatedAt: at, day: yesterday, wake: '07:40', bed: '00:30' },
  ]

  return {
    categories,
    presets: initialPresets(SEED),
    templates,
    notes,
    time,
    reviews,
    specials,
    sleep,
  }
}
