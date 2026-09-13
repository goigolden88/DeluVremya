import { useEffect, useState } from 'react'
import {
  DEFAULT_SCREEN_NAMES,
  readScreenNames,
  writeScreenNames,
  type ScreenKey,
  type ScreenNames,
} from './screenNames.ts'

/**
 * Названия вкладок для экранов (Р-26). Прочитанные держатся здесь, и правка
 * в «Настройках» сразу меняет вкладки и заголовки — без перезапуска.
 */
let known: ScreenNames | null = null
const listeners = new Set<(names: ScreenNames) => void>()

function publish(names: ScreenNames): void {
  known = names
  for (const listener of listeners) listener(names)
}

/** Прочитать до первого экрана — иначе вкладки мигнут названиями по умолчанию. */
export async function loadScreenNames(): Promise<void> {
  publish(await readScreenNames())
}

export function useScreenNames(): ScreenNames {
  const [names, setNames] = useState<ScreenNames>(known ?? DEFAULT_SCREEN_NAMES)

  useEffect(() => {
    listeners.add(setNames)
    if (known === null) void loadScreenNames()
    else setNames(known)
    return () => {
      listeners.delete(setNames)
    }
  }, [])

  return names
}

export async function saveScreenNames(input: Partial<Record<ScreenKey, string>>): Promise<ScreenNames> {
  const names = await writeScreenNames(input)
  publish(names)
  return names
}
