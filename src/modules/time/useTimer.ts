import { useCallback, useEffect, useState } from 'react'
import { db } from '../../core/db.ts'
import { parseTimer, startTimer, TIMER_KEY, type RunningTimer } from './timer.ts'

export type Timer = {
  /** Прочитано ли из настроек. До этого не показывается ничего. */
  known: boolean
  timer: RunningTimer | null
  error: string
  start: (categoryId: string, bgCategoryId?: string) => Promise<void>
  clear: () => Promise<void>
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/**
 * Идущий таймер этого устройства (Р-18). Лежит в `settings`, поэтому
 * переживает закрытие приложения, а на другое устройство не уезжает.
 *
 * Настройки не объявляют о записи, как хранилища записей. Запускают таймер
 * на «Времени», а видят и на «Сегодня», поэтому при возврате из фона он
 * перечитывается.
 */
export function useTimer(): Timer {
  const [timer, setTimer] = useState<RunningTimer | null>(null)
  const [known, setKnown] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true

    async function read() {
      try {
        const value = parseTimer(await db.settings.get<unknown>(TIMER_KEY))
        if (alive) setTimer(value)
      } catch (failure) {
        if (alive) setError(describe(failure))
      } finally {
        if (alive) setKnown(true)
      }
    }

    function onVisible() {
      if (document.visibilityState === 'visible') void read()
    }

    void read()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const start = useCallback(async (categoryId: string, bgCategoryId?: string) => {
    const next = startTimer(categoryId, new Date(), bgCategoryId)
    await db.settings.set(TIMER_KEY, next)
    setTimer(next)
  }, [])

  const clear = useCallback(async () => {
    await db.settings.remove(TIMER_KEY)
    setTimer(null)
  }, [])

  return { known, timer, error, start, clear }
}
