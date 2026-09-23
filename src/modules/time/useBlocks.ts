import { useEffect, useState } from 'react'
import { db } from '../../app/core.ts'
import type { TimeBlock } from '../../app/model.ts'

export type Blocks = {
  status: 'loading' | 'ready' | 'failed'
  error: string
  /** Живые блоки за всё время: итогу нужен день, медиане — история категории. */
  blocks: TimeBlock[]
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/**
 * Блоки времени из базы. Перечитываются на любую запись в `time` — своей
 * рукой или приехавшую синхронизацией.
 *
 * Читаются все, а не день по индексу: год — это несколько тысяч блоков,
 * а `db` отдаёт хранилище целиком и знает про индексы только для
 * синхронизации. Станет медленно — повод для запроса по индексу в `db`.
 */
export function useBlocks(): Blocks {
  const [state, setState] = useState<Blocks>({ status: 'loading', error: '', blocks: [] })

  useEffect(() => {
    let alive = true

    async function load() {
      try {
        const blocks = await db.getAll('time')
        if (alive) setState({ status: 'ready', error: '', blocks })
      } catch (failure) {
        if (alive) setState((previous) => ({ ...previous, status: 'failed', error: describe(failure) }))
      }
    }

    void load()
    const off = db.onChange((event) => {
      if (event.store === 'time') void load()
    })
    return () => {
      alive = false
      off()
    }
  }, [])

  return state
}
