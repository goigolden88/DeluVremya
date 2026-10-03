import { useEffect, useState } from 'react'
import { db } from '../../app/core.ts'
import type { SpecialDays } from '../../app/model.ts'

export type Specials = {
  status: 'loading' | 'ready' | 'failed'
  error: string
  /** Живые периоды: с ними сверяется форма, по ним ставится плашка. */
  specials: SpecialDays[]
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/**
 * Особые дни из базы (Р-91). Перечитываются на любую запись в `specials` —
 * своей рукой или приехавшую синхронизацией.
 */
export function useSpecials(): Specials {
  const [state, setState] = useState<Specials>({ status: 'loading', error: '', specials: [] })

  useEffect(() => {
    let alive = true

    async function load() {
      try {
        const specials = await db.getAll('specials')
        if (alive) setState({ status: 'ready', error: '', specials })
      } catch (failure) {
        if (alive) setState((previous) => ({ ...previous, status: 'failed', error: describe(failure) }))
      }
    }

    void load()
    const off = db.onChange((event) => {
      if (event.store === 'specials') void load()
    })
    return () => {
      alive = false
      off()
    }
  }, [])

  return state
}
