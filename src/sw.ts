/**
 * Service worker «Делу Время» — точка входа `injectManifest`. Кеш, работа без
 * сети, автообновление, фоновая проверка и тап по уведомлению — ядра
 * (`shared/sw.ts`, Р-83); своё — о чём напоминать (`notify.ts`).
 */

import { startWorker } from './shared/sw.ts'
import { reminders } from './notify.ts'

startWorker({ remind: (registration) => reminders.remind(registration) })
