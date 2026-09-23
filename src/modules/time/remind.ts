/**
 * О чём напоминает учёт времени (Р-24): за сегодня не учтено ни минуты.
 *
 * Сегодня, а не вчера: напоминание о вчерашнем толкало бы к записи
 * задним числом — той, от которой умерла таблица. Ни одного блока, а не
 * «мало»: порог «мало» — оценка, и она давит (Р-05).
 *
 * Чистая функция: зовёт её `notify.ts` — и из service worker, и по кнопке
 * «Проверить сейчас».
 */

import type { DateStr } from '../../shared/core/dates.ts'
import type { TimeBlock } from '../../app/model.ts'
import { quoted } from '../../ui/screenNames.ts'
import { blocksOn } from './day.ts'

export type Notice = { title: string; body: string }

/**
 * Напоминание о незаполненном дне. Null — напоминать не о чем.
 * `screen` — название экрана учёта на этом устройстве (Р-26).
 */
export function unfilledNotice(blocks: readonly TimeBlock[], day: DateStr, screen: string): Notice | null {
  if (blocksOn(blocks, day).length > 0) return null
  return {
    title: 'Сегодня ничего не учтено',
    body: `Одним тапом — кнопкой категории на экране ${quoted(screen)}. Забыл включить таймер — там же «задним числом».`,
  }
}
