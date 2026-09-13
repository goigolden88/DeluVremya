import { describe, expect, it } from 'vitest'
import { DAY_WINDOW } from './day.ts'
import { MAX_NORM_DAYS, MAX_NORM_MINUTES } from './period.ts'
import {
  addedLine,
  blocksWord,
  checkText,
  keptText,
  NORM_PROBLEMS,
  normText,
  runningLine,
  savedLine,
  startedLine,
  summaryLine,
  unaccountedLine,
  windowNote,
  writingFor,
} from './labels.ts'

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

  it('пределы в причинах — из констант', () => {
    expect(NORM_PROBLEMS.days).toContain(String(MAX_NORM_DAYS))
    expect(NORM_PROBLEMS.hours).toContain(String(MAX_NORM_MINUTES / 60))
  })
})
