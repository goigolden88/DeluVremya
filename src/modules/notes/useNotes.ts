import { useEffect, useState } from 'react'
import { db } from '../../core/db.ts'
import type { Note } from '../../core/model.ts'

/**
 * Все живые заметки. Перечитываются на любую запись в `notes` — своей рукой
 * или приехавшую синхронизацией. Null — ещё не прочитано.
 *
 * Все, а не только неразобранное: у замысла считаются его дела, в том
 * числе сделанные (Р-31).
 */
export function useNotes(): { notes: Note[] | null; error: string } {
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true

    async function load() {
      try {
        const all = await db.getAll('notes')
        if (alive) setNotes(all)
      } catch (failure) {
        if (alive) setError(failure instanceof Error ? failure.message : 'Неизвестная ошибка')
      }
    }

    void load()
    const off = db.onChange((event) => {
      if (event.store === 'notes') void load()
    })
    return () => {
      alive = false
      off()
    }
  }, [])

  return { notes, error }
}
