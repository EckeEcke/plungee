import { LevelBuilder } from '../../sim/builder'
import type { LevelData } from '../../sim/types'

export function createLasersLevel(): LevelData {
  const b = new LevelBuilder('short', "Lasers!")

  // Blöcke
  b.plat(4, 5, 10)
  b.plat(9, 8, 15)
  b.plat(14, 0, 7)
  b.plat(19, 8, 15)
  b.plat(24, 0, 7)
  b.plat(32, 0, 6)
  b.plat(32, 9, 15)
  b.plat(33, 0, 5)
  b.plat(33, 10, 15)
  b.plat(34, 0, 5)
  b.plat(34, 10, 15)
  b.plat(35, 0, 5)
  b.plat(35, 10, 15)
  b.plat(36, 0, 5)
  b.plat(36, 10, 15)
  b.plat(37, 0, 5)
  b.plat(37, 10, 15)
  b.plat(38, 0, 5)
  b.plat(38, 10, 15)
  b.plat(39, 0, 15)

  // Objekte
  b.spawn(7, 3)
  b.goal(8, 38)
  b.laser(0, 9, 'r', { period: 150, on: 54, phase: 0 })
  b.laser(15, 14, 'l', { period: 240, on: 90, phase: 0 })
  b.laser(0, 19, 'r', { period: 240, on: 90, phase: 0 })
  b.laser(15, 24, 'l', { period: 240, on: 90, phase: 0 })
  b.laser(6, 33, 'r', { period: 240, on: 90, phase: 0 })
  b.laser(9, 34, 'l', { period: 240, on: 90, phase: 0 })

  return b.build()
}
