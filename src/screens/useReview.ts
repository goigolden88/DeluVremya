import { useEffect, useState } from 'react'
import { db } from '../app/core.ts'
import type { Review } from '../app/model.ts'
import { DEFAULT_THRESHOLDS, GOAL_KEY, parseThresholds, STALE_KEY, type Thresholds } from './review.ts'

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}

/**
 * Проведённые обзоры. Перечитываются на любую запись в `reviews` — своей
 * рукой или приехавшую синхронизацией. Null — ещё не прочитано.
 */
export function useReviews(): { reviews: Review[] | null; error: string } {
  const [reviews, setReviews] = useState<Review[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true

    async function load() {
      try {
        const all = await db.getAll('reviews')
        if (alive) setReviews(all)
      } catch (failure) {
        if (alive) setError(describe(failure))
      }
    }

    void load()
    const off = db.onChange((event) => {
      if (event.store === 'reviews') void load()
    })
    return () => {
      alive = false
      off()
    }
  }, [])

  return { reviews, error }
}

/** Пороги обзора из настроек устройства (Р-48). */
export async function readThresholds(): Promise<Thresholds> {
  const [stale, goal] = await Promise.all([db.settings.get<unknown>(STALE_KEY), db.settings.get<unknown>(GOAL_KEY)])
  return parseThresholds(stale, goal)
}

export async function saveThresholds(thresholds: Thresholds): Promise<void> {
  await db.settings.set(STALE_KEY, thresholds.stale)
  await db.settings.set(GOAL_KEY, thresholds.goal)
}

/** Пороги для экрана. Null — ещё не прочитаны; не прочитались — умолчание. */
export function useThresholds(): Thresholds | null {
  const [value, setValue] = useState<Thresholds | null>(null)

  useEffect(() => {
    let alive = true
    readThresholds()
      .then((read) => {
        if (alive) setValue(read)
      })
      .catch(() => {
        if (alive) setValue(DEFAULT_THRESHOLDS)
      })
    return () => {
      alive = false
    }
  }, [])

  return value
}
