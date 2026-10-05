import { describe, expect, it } from 'vitest'
import {
  becameLong,
  LONG_PRESS_MS,
  LONG_PRESS_SLOP,
  menuPress,
  movePress,
  ripePress,
  startPress,
  swallowsClick,
} from './longPress.ts'

describe('долгий тап', () => {
  it('становится долгим, только когда выдержан срок', () => {
    const press = startPress(100, 100, 1000)
    expect(ripePress(press, 1000 + LONG_PRESS_MS - 1).phase).toBe('held')
    expect(ripePress(press, 1000 + LONG_PRESS_MS).phase).toBe('long')
  })

  it('короткий тап срабатывает как раньше', () => {
    const press = ripePress(startPress(0, 0, 0), LONG_PRESS_MS - 1)
    expect(swallowsClick(press)).toBe(false)
    expect(swallowsClick(null)).toBe(false)
  })

  it('после долгого тап глушится — блок не пишется', () => {
    const before = startPress(0, 0, 0)
    const after = ripePress(before, LONG_PRESS_MS)
    expect(becameLong(before, after)).toBe(true)
    expect(swallowsClick(after)).toBe(true)
  })

  it('дрожь пальца в допуске долгий не отменяет', () => {
    const press = movePress(startPress(0, 0, 0), LONG_PRESS_SLOP, 0)
    expect(ripePress(press, LONG_PRESS_MS).phase).toBe('long')
  })

  it('сдвиг — прокрутка: долгого не будет, тап не глушится', () => {
    const moved = movePress(startPress(0, 0, 0), 0, LONG_PRESS_SLOP + 1)
    expect(moved.phase).toBe('moved')
    const later = ripePress(moved, LONG_PRESS_MS * 2)
    expect(later.phase).toBe('moved')
    expect(becameLong(moved, later)).toBe(false)
    expect(swallowsClick(later)).toBe(false)
  })

  it('сдвиг после долгого его не отменяет', () => {
    const long = ripePress(startPress(0, 0, 0), LONG_PRESS_MS)
    expect(movePress(long, 100, 100).phase).toBe('long')
  })

  it('правая кнопка мыши — долгий сразу', () => {
    const menu = menuPress(null, 5, 5, 0)
    expect(becameLong(null, menu)).toBe(true)
    expect(swallowsClick(menu)).toBe(true)
  })

  it('меню телефона после отсчёта второй раз не зовёт', () => {
    const long = ripePress(startPress(0, 0, 0), LONG_PRESS_MS)
    expect(becameLong(long, menuPress(long, 0, 0, LONG_PRESS_MS))).toBe(false)
  })

  it('меню телефона до отсчёта делает долгим', () => {
    const held = startPress(0, 0, 0)
    expect(becameLong(held, menuPress(held, 0, 0, 1))).toBe(true)
  })

  it('сдвинутое нажатие меню долгим не делает', () => {
    const moved = movePress(startPress(0, 0, 0), 50, 0)
    expect(becameLong(moved, menuPress(moved, 50, 0, 1))).toBe(false)
  })
})
