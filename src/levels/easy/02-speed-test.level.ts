import { LevelBuilder } from '../../sim/builder'
import type { LevelData } from '../../sim/types'

export function createSpeedTestLevel(): LevelData {
  const b = new LevelBuilder('short', "Speed Test")

  // Blöcke
  b.plat(4, 5, 9)
  b.plat(6, 0, 2)
  b.plat(8, 2, 4)
  b.plat(9, 10, 14)
  b.plat(12, 10, 15)
  b.plat(13, 3, 6)
  b.plat(17, 8, 11)
  b.plat(21, 4, 7)
  b.plat(23, 10, 15)
  b.plat(24, 15, 15)
  b.plat(25, 15, 15)
  b.plat(26, 15, 15)
  b.plat(27, 0, 11)
  b.plat(27, 15, 15)
  b.plat(28, 15, 15)
  b.plat(33, 0, 15)
  b.plat(34, 0, 15)
  b.plat(35, 0, 15)
  b.plat(36, 0, 15)
  b.plat(37, 0, 15)
  b.plat(38, 0, 15)
  b.plat(39, 0, 15)

  // Objekte
  b.spawn(7, 3)
  b.goal(1, 32)
  b.spikes(0, 5, 'u')
  b.spikes(10, 8, 'u')
  b.spikes(3, 12, 'u')
  b.spikes(4, 12, 'u')
  b.spikes(11, 16, 'u')
  b.spikes(14, 24, 'l')
  b.spikes(14, 25, 'l')
  b.spikes(0, 26, 'u')
  b.spikes(1, 26, 'u')
  b.spikes(2, 26, 'u')
  b.spikes(3, 26, 'u')
  b.spikes(14, 26, 'l')
  b.spikes(14, 27, 'l')
  b.spikes(14, 28, 'l')

  return b.build()
}
