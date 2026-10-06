import { useEffect, useState } from 'react'
import { db } from '../../app/core.ts'
import type { Sleep } from '../../app/model.ts'

export type SleepRecords = {
  status: 'loading' | 'ready' | 'failed'
  error: string
  /** Живые распорядки и отметки: по ним выбирается окно дня. */
  records: Sleep[]
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/**
 * Распорядок и сон из базы (Р-94). Перечитываются на любую запись в `sleep` —
 * своей рукой или приехавшую синхронизацией. Пока читаются, записей нет —
 * окно дня по умолчанию.
 */
export function useSleep(): SleepRecords {
  const [state, setState] = useState<SleepRecords>({ status: 'loading', error: '', records: [] })

  useEffect(() => {
    let alive = true

    async function load() {
      try {
        const records = await db.getAll('sleep')
        if (alive) setState({ status: 'ready', error: '', records })
      } catch (failure) {
        if (alive) setState((previous) => ({ ...previous, status: 'failed', error: describe(failure) }))
      }
    }

    void load()
    const off = db.onChange((event) => {
      if (event.store === 'sleep') void load()
    })
    return () => {
      alive = false
      off()
    }
  }, [])

  return state
}
