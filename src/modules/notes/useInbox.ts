import { useEffect, useState } from 'react'
import { db } from '../../core/db.ts'
import type { Note } from '../../core/model.ts'
import { inboxOf } from './inbox.ts'

/**
 * Входящие из базы. Перечитываются на любую запись в `notes` — своей рукой
 * или приехавшую синхронизацией. Null — ещё не прочитано.
 */
export function useInbox(): { notes: Note[] | null; error: string } {
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true

    async function load() {
      try {
        const all = await db.getAll('notes')
        if (alive) setNotes(inboxOf(all))
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
