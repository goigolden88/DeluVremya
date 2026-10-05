import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react'
import { becameLong, LONG_PRESS_MS, menuPress, movePress, ripePress, startPress, swallowsClick, type Press } from './longPress.ts'

/** Обработчики, которые вешаются на элемент: `<div {...longPress(onLong)}>`. */
export type LongPressHandlers = {
  onPointerDown: (event: PointerEvent) => void
  onPointerMove: (event: PointerEvent) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  onContextMenu: (event: MouseEvent) => void
  onClickCapture: (event: MouseEvent) => void
}

/**
 * Долгий тап по элементу — и правая кнопка мыши на компьютере. Короткий
 * тап проходит к кнопкам внутри как раньше; тап, пришедший после долгого,
 * глушится. Палец одновременно один, поэтому одно нажатие на весь экран:
 * хук один, обработчики — на каждый элемент со своим `onLong`.
 */
export function useLongPress(): (onLong: () => void) => LongPressHandlers {
  const press = useRef<Press | null>(null)
  const pointer = useRef<number | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const stop = () => {
    window.clearTimeout(timer.current)
    timer.current = undefined
  }
  useEffect(() => stop, [])

  /** Шаг нажатия; стал долгим — отсчёт больше не нужен, `onLong` зовётся раз. */
  const step = (next: Press | null, onLong: () => void) => {
    const before = press.current
    press.current = next
    if (!becameLong(before, next)) return
    stop()
    onLong()
  }

  return (onLong) => ({
    onPointerDown: (event) => {
      stop()
      // Правая кнопка — через контекстное меню; средняя — ничего.
      if (event.button !== 0) {
        press.current = null
        pointer.current = null
        return
      }
      press.current = startPress(event.clientX, event.clientY, performance.now())
      pointer.current = event.pointerId
      timer.current = window.setTimeout(() => {
        if (press.current) step(ripePress(press.current, performance.now()), onLong)
      }, LONG_PRESS_MS)
    },
    onPointerMove: (event) => {
      if (press.current === null || event.pointerId !== pointer.current) return
      press.current = movePress(press.current, event.clientX, event.clientY)
      if (press.current.phase === 'moved') stop()
    },
    onPointerUp: stop,
    // Браузер забрал палец под прокрутку — отсчёт не нужен. Нажатие не
    // гасится: долгий тап, о котором телефон скажет меню, ещё в силе.
    onPointerCancel: stop,
    onContextMenu: (event) => {
      event.preventDefault()
      step(menuPress(press.current, event.clientX, event.clientY, performance.now()), onLong)
    },
    onClickCapture: (event) => {
      if (swallowsClick(press.current)) {
        event.preventDefault()
        event.stopPropagation()
      }
      press.current = null
    },
  })
}
