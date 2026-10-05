import { describe, expect, it } from 'vitest'
import { DAY_WINDOW } from './day.ts'
import { MAX_NORM_DAYS, MAX_NORM_MINUTES, NORM_MIN_WEEKS } from './period.ts'
import {
  addedLine,
  blocksWord,
  categoriesLine,
  checkText,
  DAY_LABEL_STEP,
  dayLabel,
  dayTitle,
  historyText,
  historyWaitText,
  keptText,
  marksLine,
  morePresetsLabel,
  NORM_PROBLEMS,
  normText,
  periodLine,
  presetFullLabel,
  presetLabel,
  runningLine,
  savedLine,
  SPECIAL_WEEK,
  specialMarksText,
  specialWeekText,
  startedLine,
  summaryLine,
  unaccountedLine,
  weekCell,
  windowNote,
  writingFor,
} from './labels.ts'

describe('подписи месяца по дням — Р-92', () => {
  it('подписан первый день и каждый пятый', () => {
    const labels = Array.from({ length: 31 }, (_, index) => dayLabel(`2026-08-${String(index + 1).padStart(2, '0')}`))
    expect(labels.filter(Boolean)).toEqual(['1', '5', '10', '15', '20', '25', '30'])
    expect(dayLabel('2026-08-05')).toBe(String(DAY_LABEL_STEP))
  })

  it('подсказка — учтено с основанием; особый и будущий — почему столбца нет', () => {
    const base = { date: '2026-09-07', count: 0, special: null, future: false, muted: true }
    expect(dayTitle({ ...base, value: 90, count: 2, muted: false })).toBe('7 сентября 2026: учтено 1 ч 30 мин · 2 блока')
    expect(dayTitle({ ...base, value: 0 })).toBe('7 сентября 2026: за день ничего не учтено')
    expect(dayTitle({ ...base, value: null, future: true })).toBe('7 сентября 2026: ещё не наступил')
    const special = { id: 't', updatedAt: '2026-09-01T00:00:00.000Z', from: '2026-09-07', to: '2026-09-07', title: 'Поход' }
    expect(dayTitle({ ...base, value: null, special })).toBe(
      '7 сентября 2026: особый день «Поход» — в итог месяца не входит',
    )
  })
})

describe('тексты итога дня', () => {
  it('сумма идёт с основанием, склонение по числу блоков', () => {
    expect(summaryLine(0, 0)).toBe('За день ничего не учтено')
    expect(summaryLine(30, 1)).toBe('Учтено 30 мин · 1 блок')
    expect(summaryLine(90, 3)).toBe('Учтено 1 ч 30 мин · 3 блока')
    expect(summaryLine(300, 11)).toBe('Учтено 5 ч · 11 блоков')
    expect([21, 22, 25].map(blocksWord)).toEqual(['блок', 'блока', 'блоков'])
  })

  it('неучтённое называет, от чего считается', () => {
    expect(unaccountedLine(190, 540)).toBe('Неучтено 3 ч 10 мин из прошедших 9 ч окна дня')
  })

  it('отклик на тап — что записано и итог категории за день', () => {
    expect(addedLine('Чтение', 30, 90)).toBe('Записано: Чтение, 30 мин. По категории за день — 1 ч 30 мин')
  })

  it('кнопка — минутами, название категории только для чтения с экрана', () => {
    expect(presetLabel(30)).toBe('+30')
    expect(presetFullLabel('Чтение', 30)).toBe('Чтение +30')
    expect(morePresetsLabel(2)).toBe('ещё 2')
  })

  it('границы окна в пояснении — из константы', () => {
    expect(windowNote()).toContain(`с ${DAY_WINDOW.from} до ${DAY_WINDOW.to}`)
  })
})

describe('тексты таймера и ретро-ввода', () => {
  const TODAY = '2026-09-13'

  it('идущий таймер — что, сколько и что фоном', () => {
    expect(runningLine('Чтение', 65)).toBe('Идёт: Чтение · 1 ч 5 мин')
    expect(runningLine('Ютуб', 30, 'Покер')).toBe('Идёт: Ютуб · 30 мин, фоном Покер')
  })

  it('запущен вчера — сказано, куда ляжет блок (Р-19)', () => {
    expect(startedLine(new Date(2026, 8, 13, 9, 5), TODAY, TODAY)).toBe('С 09:05')
    expect(startedLine(new Date(2026, 8, 12, 23, 30), '2026-09-12', TODAY)).toBe(
      'С 23:30, 12 сентября 2026 — блок ляжет на тот день',
    )
  })

  it('над кнопками прошлого дня — на какой день они пишут (Р-25)', () => {
    expect(writingFor('2026-09-12')).toBe('Кнопки записывают на 12 сентября 2026')
  })

  it('записано не сегодня — с датой, а не молча', () => {
    expect(savedLine('Чтение', 30, TODAY, TODAY)).toBe('Записано: Чтение, 30 мин')
    expect(savedLine('Чтение', 30, '2026-09-12', TODAY)).toBe('Записано на 12 сентября 2026: Чтение, 30 мин')
  })
})

describe('тексты норм недели — Р-45', () => {
  it('норма словами, правила по порядку, склонение дней после «не меньше»', () => {
    expect(normText({ maxMinutes: 600, minDays: 3, minMinutes: 90 })).toBe('не меньше 3 дней · не меньше 1 ч 30 мин · не больше 10 ч')
    expect(normText({ minDays: 1 })).toBe('не меньше 1 дня')
  })

  it('как идёт правило — с основанием; выполненное — галочкой, без упрёка', () => {
    expect(checkText({ rule: 'minDays', target: 3, actual: 2, met: false })).toBe('2 из 3 дней')
    expect(checkText({ rule: 'minMinutes', target: 300, actual: 330, met: true })).toBe('5 ч 30 мин из 5 ч ✓')
    expect(checkText({ rule: 'maxMinutes', target: 600, actual: 660, met: false })).toBe('11 ч при пределе 10 ч')
  })

  it('вместо серии — из скольких недель', () => {
    expect(keptText(3, 4)).toBe('выполнена в 3 из 4 недель')
    expect(keptText(1, 1)).toBe('выполнена в 1 из 1 недели')
  })

  it('истории ещё нет — с какого дня норма и сколько недель набралось, порог из константы (Р-56)', () => {
    expect(historyWaitText('2026-09-14', 1)).toBe(
      `норма с 14 сентября 2026 · история — с ${NORM_MIN_WEEKS} полных недель, пока 1`,
    )
    expect(historyWaitText(null, 0)).toBe(`история — с ${NORM_MIN_WEEKS} полных недель, пока 0`)
    const history = { since: '2026-08-03', marks: [], kept: 2, weeks: NORM_MIN_WEEKS }
    expect(historyText({ ...history, enough: true })).toBe(`выполнена в 2 из ${NORM_MIN_WEEKS} недель`)
    expect(historyText({ ...history, enough: false })).toContain('норма с 3 августа 2026')
  })

  it('отметки по неделям — числа дней, через месяц тоже; не в счёт не показаны (Р-55)', () => {
    const marks = [
      { week: { from: '2026-08-31', to: '2026-09-06' }, counted: true, met: true, special: false },
      { week: { from: '2026-09-07', to: '2026-09-13' }, counted: true, met: false, special: false },
      { week: { from: '2026-09-14', to: '2026-09-20' }, counted: false, met: false, special: false },
    ]
    expect(weekCell(marks[0]!.week)).toBe('31–6')
    expect(marksLine(marks)).toBe('31–6 ✓ · 7–13 —')
    expect(specialMarksText(marks, true)).toBeNull()
  })

  it('особая неделя — не судится: без галочки, подпись с периодом (Р-91)', () => {
    expect(checkText({ rule: 'minMinutes', target: 300, actual: 330, met: true }, false)).toBe('5 ч 30 мин из 5 ч')
    expect(SPECIAL_WEEK).toBe('особая неделя — не судится')
    const trip = { id: 's1', updatedAt: '2026-09-13T10:00:00.000Z', from: '2026-09-11', to: '2026-09-13', title: 'Поездка' }
    expect(specialWeekText([trip])).toBe('Особая неделя — не судится: «Поездка», 11–13 сентября 2026, 3 дня')
  })

  it('особые недели месяца — числами дней, года — числом; в отметки не входят (Р-91)', () => {
    const week = (from: string, to: string, special: boolean) => ({ week: { from, to }, counted: !special, met: true, special })
    const one = [week('2026-08-31', '2026-09-06', false), week('2026-09-07', '2026-09-13', true)]
    expect(marksLine(one)).toBe('31–6 ✓')
    expect(specialMarksText(one, true)).toBe('Особая неделя 7–13 — не судится')
    expect(specialMarksText(one, false)).toBe('1 особая неделя — не судится')
    const two = [...one, week('2026-09-14', '2026-09-20', true)]
    expect(specialMarksText(two, true)).toBe('Особые недели 7–13, 14–20 — не судятся')
    expect(specialMarksText(two, false)).toBe('2 особые недели — не судятся')
  })

  it('итог промежутка с особыми днями — по обычным, особые названы (Р-91)', () => {
    const base = { total: 300, count: 5, days: 5, elapsedDays: 5, byCategory: [], byGroup: [], byKind: [] }
    expect(periodLine({ ...base, specialDays: 0 })).toBe('Учтено 5 ч · 5 блоков · учёт был в 5 днях из 5')
    expect(periodLine({ ...base, specialDays: 2 })).toBe(
      'Учтено 5 ч · 5 блоков · учёт был в 5 днях из 5 обычных; особых — 2',
    )
    expect(periodLine({ ...base, days: 1, elapsedDays: 1, specialDays: 6 })).toContain('из 1 обычного; особых — 6')
    expect(periodLine({ ...base, total: 0, count: 0, days: 0, elapsedDays: 0, specialDays: 7 })).toBe(
      'Ничего не учтено в обычные дни · особых — 7',
    )
    expect(periodLine({ ...base, total: 0, count: 0, days: 0, specialDays: 0 })).toBe('Ничего не учтено')
  })

  it('категории особого периода — строкой, без нулей', () => {
    expect(
      categoriesLine([
        { name: 'Чтение', minutes: 60 },
        { name: 'Покер', minutes: 0 },
        { name: null, minutes: 15 },
      ]),
    ).toBe('Чтение 1 ч · без категории 15 мин')
  })

  it('пределы в причинах — из констант', () => {
    expect(NORM_PROBLEMS.days).toContain(String(MAX_NORM_DAYS))
    expect(NORM_PROBLEMS.hours).toContain(String(MAX_NORM_MINUTES / 60))
  })
})
