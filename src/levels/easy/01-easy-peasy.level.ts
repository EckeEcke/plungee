import { LevelBuilder } from '../../sim/builder'
import type { LevelData } from '../../sim/types'

export function createEasyPeasyLevel(): LevelData {
  const b = new LevelBuilder('short', "Easy Peasy")

  // Blöcke
  b.plat(4, 5, 10)
  b.plat(9, 11, 14)
  b.plat(11, 2, 6)
  b.plat(17, 9, 14)
  b.plat(21, 2, 5)
  b.plat(26, 9, 15)
  b.plat(30, 5, 12)
  b.plat(39, 0, 15)

  // Objekte
  b.spawn(7, 3)
  b.goal(8, 38)
  b.spikes(13, 16, 'u')
  b.spikes(14, 16, 'u')
  b.spikes(2, 20, 'u')
  b.spikes(3, 20, 'u')
  b.spikes(4, 20, 'u')
  b.spikes(5, 20, 'u')
  b.spikes(5, 29, 'u')
  b.spikes(6, 29, 'u')
  b.spikes(0, 38, 'u')
  b.spikes(1, 38, 'u')
  b.spikes(2, 38, 'u')
  b.spikes(3, 38, 'u')
  b.spikes(4, 38, 'u')

  return b.build()
}
