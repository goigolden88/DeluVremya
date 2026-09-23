/**
 * Напоминания: о незаполненном дне (Р-14, Р-24) и об обзоре недели (Р-51).
 *
 * Механика — окно со звуком, тихое вне окна, со звуком не чаще раза в день,
 * журнал пробуждений, разрешение и имя фоновой проверки — ядра
 * (`shared/notify.ts`, Р-83). Своё здесь — о чём напоминать и куда ведёт тап.
 *
 * Тем две, и у каждой свои дни громкого и тихого: громкое одной не глушит
 * другую. Тот же объект зовут работник (`remind`) и «Настройки» (остальное):
 * считают они одинаково, и разойтись это не должно.
 *
 * Живёт на уровне приложения, рядом с `app.tsx`, а не в модуле: оно знает
 * и учёт времени, и обзор недели.
 */

import { db } from './app/core.ts'
import { unfilledNotice } from './modules/time/remind.ts'
import { reviewNotice } from './screens/review.ts'
import { createReminders, DAY_KEYS } from './shared/notify.ts'
import { readScreenNames } from './ui/screenNames.ts'

/**
 * Дни напоминания об обзоре недели (Р-51): свои, прежние ключи дня смысла
 * не меняют. Имена лежат в настройках устройств и не меняются никогда.
 */
export const REVIEW_KEYS = { loud: 'reminderReviewDay', quiet: 'reminderReviewQuietDay' } as const

export const reminders = createReminders(db.settings, {
  async topics(day) {
    // Экран в тексте — своим именем этого устройства (Р-26).
    const [names, blocks, reviews] = await Promise.all([readScreenNames(), db.getAll('time'), db.getAll('reviews')])
    return [
      {
        notice: unfilledNotice(blocks, day, names.time),
        tag: 'day',
        target: '/time',
        loudKey: DAY_KEYS.loud,
        quietKey: DAY_KEYS.quiet,
      },
      {
        notice: reviewNotice(reviews, day),
        tag: 'review',
        target: '/review',
        loudKey: REVIEW_KEYS.loud,
        quietKey: REVIEW_KEYS.quiet,
      },
    ]
  },
  idle: {
    title: 'Напоминать не о чем',
    body: 'За сегодня время уже учтено, обзор недели не ждёт. Уведомление пришло, чтобы было видно: они доходят.',
    tag: 'day',
    target: '/time',
  },
})
