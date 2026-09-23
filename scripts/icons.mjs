/**
 * Иконки PWA «Делу Время» из геометрии public/favicon.svg.
 *
 * Растеризатор и PNG — ядра (`shared/scripts/icons.mjs`, Р-83); здесь — свои
 * цвет и рисунок. Запускается руками (`npm run icons`), результат
 * коммитится. В сборку не входит: иконка меняется раз в год.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BACKGROUND, INK, writeIcons } from '../src/shared/scripts/icons.mjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

/**
 * Акцент «Делу Время» — тёплый. Фон общий с «Дневниками», акцент нет:
 * две иконки на одном телефоне не должны путаться.
 */
const ACCENT = [0xf2, 0xb3, 0x5b]

/**
 * Те же фигуры, что в favicon.svg. Расходиться им нельзя.
 *
 * Круг — скруглённый прямоугольник с радиусом в половину стороны, кольцо —
 * круг цвета фона поверх круга акцента. Всё внутри безопасной зоны maskable:
 * круга в 80% стороны, который система не обрежет никогда.
 */
const SHAPES = [
  // Циферблат: кольцо
  { x: 106, y: 106, w: 300, h: 300, r: 150, color: ACCENT, alpha: 1 },
  { x: 130, y: 130, w: 252, h: 252, r: 126, color: BACKGROUND, alpha: 1 },
  // Стрелки: минутная вверх, часовая вправо
  { x: 244, y: 158, w: 24, h: 110, r: 12, color: INK, alpha: 1 },
  { x: 244, y: 244, w: 88, h: 24, r: 12, color: INK, alpha: 1 },
  // Ось
  { x: 238, y: 238, w: 36, h: 36, r: 18, color: ACCENT, alpha: 1 },
]

writeIcons({ out: OUT, shapes: SHAPES })
