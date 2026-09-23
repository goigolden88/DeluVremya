import { useEffect, useState } from 'react'
import { db } from '../../app/core.ts'
import type { DayTemplate } from '../../app/model.ts'

/**
 * Шаблоны дня. Перечитываются на любую запись в `templates` — своей рукой
 * или приехавшую синхронизацией. Null — ещё не прочитано.
 */
export function useTemplates(): { templates: DayTemplate[] | null; error: string } {
  const [templates, setTemplates] = useState<DayTemplate[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true

    async function load() {
      try {
        const all = await db.getAll('templates')
        if (alive) setTemplates(all)
      } catch (failure) {
        if (alive) setError(failure instanceof Error ? failure.message : 'Неизвестная ошибка')
      }
    }

    void load()
    const off = db.onChange((event) => {
      if (event.store === 'templates') void load()
    })
    return () => {
      alive = false
      off()
    }
  }, [])

  return { templates, error }
}
