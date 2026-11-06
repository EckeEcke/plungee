import { LevelBuilder } from '../../sim/builder'
import type { LevelData } from '../../sim/types'

export function createSpringsLevel(): LevelData {
  const b = new LevelBuilder('short', "Springs")

  // Blöcke
  b.plat(6, 0, 6)
  b.plat(6, 10, 13)
  b.plat(7, 0, 13)
  b.plat(14, 2, 3)
  b.plat(14, 7, 8)
  b.plat(14, 12, 15)
  b.plat(15, 2, 15)
  b.plat(20, 10, 12)
  b.plat(21, 10, 12)
  b.plat(22, 0, 1)
  b.plat(22, 7, 7)
  b.plat(22, 10, 12)
  b.plat(23, 0, 2)
  b.plat(23, 10, 12)
  b.plat(24, 0, 3)
  b.plat(24, 10, 12)
  b.plat(25, 0, 4)
  b.plat(25, 10, 12)
  b.plat(26, 0, 12)
  b.plat(27, 0, 12)
  b.plat(39, 0, 15)

  // Objekte
  b.spawn(2, 5)
  b.goal(7, 31)
  b.spring(6, 5, 1)
  b.spring(7, 13, 1)
  b.spring(12, 13, 1)
  b.spring(7, 21, 1)
  b.spring(9, 25, 1)
  b.spring(7, 38, 2)
  b.spikes(7, 6, 'u')
  b.spikes(8, 6, 'u')
  b.spikes(9, 6, 'u')
  b.spikes(4, 14, 'u')
  b.spikes(5, 14, 'u')
  b.spikes(6, 14, 'u')
  b.spikes(9, 14, 'u')
  b.spikes(10, 14, 'u')
  b.spikes(11, 14, 'u')

  return b.build()
}
