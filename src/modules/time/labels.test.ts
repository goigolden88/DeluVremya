import { describe, expect, it } from 'vitest'
import { DAY_WINDOW } from './day.ts'
import {
  addedLine,
  blocksWord,
  runningLine,
  savedLine,
  startedLine,
  summaryLine,
  unaccountedLine,
  windowNote,
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

  it('записано не сегодня — с датой, а не молча', () => {
    expect(savedLine('Чтение', 30, TODAY, TODAY)).toBe('Записано: Чтение, 30 мин')
    expect(savedLine('Чтение', 30, '2026-09-12', TODAY)).toBe('Записано на 12 сентября 2026: Чтение, 30 мин')
  })
})
