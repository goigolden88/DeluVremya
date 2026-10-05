/**
 * Долгий тап — чистыми шагами, без React: отсчёт, отмена сдвигом
 * и глушение тапа, который пришёл после долгого. Хук — `useLongPress.ts`.
 */

/** Сколько держать палец, чтобы тап стал долгим, мс. */
export const LONG_PRESS_MS = 500

/** Сдвиг пальца дальше этого, px, — прокрутка, а не долгий тап. */
export const LONG_PRESS_SLOP = 10

/**
 * Нажатие: где и когда началось и чем стало. `held` — держат, `long` —
 * дождались (или пришло контекстное меню), `moved` — палец ушёл, долгого
 * уже не будет.
 */
export type Press = {
  x: number
  y: number
  at: number
  phase: 'held' | 'long' | 'moved'
}

export function startPress(x: number, y: number, at: number): Press {
  return { x, y, at, phase: 'held' }
}

/** Сдвиг дальше допуска отменяет долгий тап; уже случившийся — не отменяет. */
export function movePress(press: Press, x: number, y: number): Press {
  if (press.phase !== 'held') return press
  return Math.hypot(x - press.x, y - press.y) > LONG_PRESS_SLOP ? { ...press, phase: 'moved' } : press
}

/** Держат не меньше `LONG_PRESS_MS` — долгий. */
export function ripePress(press: Press, now: number): Press {
  return press.phase === 'held' && now - press.at >= LONG_PRESS_MS ? { ...press, phase: 'long' } : press
}

/**
 * Контекстное меню: правая кнопка мыши или долгий тап, о котором сказал
 * сам телефон. Долгий — если ещё не был; сдвинутое меню не превращает.
 */
export function menuPress(press: Press | null, x: number, y: number, now: number): Press {
  if (press === null) return { x, y, at: now, phase: 'long' }
  return press.phase === 'held' ? { ...press, phase: 'long' } : press
}

/** Шаг сделал нажатие долгим — пора звать обработчик, один раз. */
export function becameLong(before: Press | null, after: Press | null): boolean {
  return before?.phase !== 'long' && after?.phase === 'long'
}

/** Тап после долгого не срабатывает: кнопка минут блок не пишет. */
export function swallowsClick(press: Press | null): boolean {
  return press?.phase === 'long'
}
