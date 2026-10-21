import { LevelBuilder } from '../../sim/builder'
import type { LevelData } from '../../sim/types'

export function createSpringsLevel(): LevelData {
  const b = new LevelBuilder('short', "Springs")

  // Blöcke
  b.plat(4, 0, 6)
  b.plat(4, 9, 15)
  b.plat(8, 2, 5)
  b.plat(8, 10, 13)
  b.plat(9, 2, 5)
  b.plat(9, 10, 13)
  b.plat(10, 2, 5)
  b.plat(10, 10, 13)
  b.plat(11, 2, 5)
  b.plat(11, 10, 13)
  b.plat(12, 2, 13)
  b.plat(13, 2, 13)
  b.plat(20, 0, 0)
  b.plat(20, 15, 15)
  b.plat(21, 0, 1)
  b.plat(21, 14, 15)
  b.plat(22, 0, 2)
  b.plat(22, 13, 15)
  b.plat(23, 0, 3)
  b.plat(23, 12, 15)
  b.plat(24, 0, 2)
  b.plat(24, 13, 15)
  b.plat(25, 0, 1)
  b.plat(25, 14, 15)
  b.plat(26, 0, 0)
  b.plat(26, 15, 15)
  b.plat(39, 0, 15)

  // Objekte
  b.spawn(1, 3)
  b.goal(8, 38)
  b.spring(6, 11, 1)
  b.spring(7, 11, 1)
  b.spring(8, 11, 1)
  b.spring(9, 11, 1)
  b.spring(0, 19, 2)
  b.spring(15, 19, 2)
  b.spring(1, 20, 2)
  b.spring(14, 20, 2)
  b.spring(2, 21, 2)
  b.spring(13, 21, 2)
  b.spring(3, 22, 2)
  b.spring(12, 22, 2)

  return b.build()
}
