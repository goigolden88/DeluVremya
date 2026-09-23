/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import { familyVite } from './src/shared/scripts/vite.ts'
import { SHARE_PARAMS, SHORTCUTS, shortcutUrl } from './src/launch.ts'

// GitHub Pages отдаёт сайт проекта не с корня домена, а по /<имя репозитория>/.
// Репозиторий называется DeluVremya → https://goigolden88.github.io/DeluVremya/
// Переименуете репозиторий — правьте эту строку, остальное подтянется. См. Р-06.
const BASE = '/DeluVremya/'

// Сборка, работник и манифест — фабрикой ядра (Р-83); своё здесь — адрес,
// имя, описание, ярлыки и «Поделиться».
export default defineConfig({
  ...familyVite({
    base: BASE,
    name: 'Делу Время',
    description: 'План дня, входящие и учёт времени. Работает без сети.',
    // «Поделиться» и ярлыки — основной путь ввода (Р-09). Оба зашиваются
    // в установленное приложение на Android, поэтому объявлены с первого
    // дня, а старый адрес обязан работать и после любой правки.
    // Приём — GET на корень, разбор при старте в src/launch.ts,
    // без работника (Р-16). Имена и адреса берутся оттуда же, где
    // их разбирают: разойтись они не могут.
    shortcuts: SHORTCUTS.map((shortcut) => ({ name: shortcut.name, url: shortcutUrl(BASE, shortcut.go) })),
    manifest: {
      share_target: {
        action: BASE,
        method: 'GET',
        params: { ...SHARE_PARAMS },
      },
    },
  }),

  // Тесты ядра гоняет CI ядра; здесь — только свои (Р-84).
  test: {
    exclude: [...configDefaults.exclude, 'src/shared/**'],
  },
})
