import { LevelBuilder } from '../../sim/builder'
import type { LevelData } from '../../sim/types'

export function createAreWeGolfingNowLevel(): LevelData {
  const b = new LevelBuilder('short', "Are We Golfing Now?!")

  // Blöcke
  b.plat(4, 0, 10)
  b.plat(10, 2, 2)
  b.plat(11, 2, 3)
  b.plat(11, 4, 5, 'I')
  b.plat(11, 6, 15)
  b.plat(17, 13, 13)
  b.plat(18, 0, 9)
  b.plat(18, 10, 11, 'I')
  b.plat(18, 12, 13)
  b.plat(24, 2, 2, 'B')
  b.plat(25, 2, 2, 'B')
  b.plat(25, 3, 5, 'I')
  b.plat(25, 6, 12, 'B')
  b.plat(25, 13, 15)
  b.plat(27, 2, 12)
  b.plat(31, 12, 15)
  b.plat(32, 0, 15)
  b.plat(33, 0, 15)
  b.plat(34, 0, 15)
  b.plat(35, 0, 15)
  b.plat(36, 0, 15)
  b.plat(37, 0, 15)
  b.plat(38, 0, 15)
  b.plat(39, 0, 15)

  // Objekte
  b.spawn(7, 3)
  b.goal(15, 27)
  b.checkpoint(15, 24)
  b.spikes(2, 26, 'u')
  b.spikes(3, 26, 'u')
  b.spikes(4, 26, 'u')
  b.spikes(5, 26, 'u')
  b.spikes(6, 26, 'u')
  b.spikes(7, 26, 'u')
  b.spikes(8, 26, 'u')
  b.spikes(9, 26, 'u')
  b.spikes(10, 26, 'u')
  b.spikes(11, 26, 'u')
  b.spikes(12, 26, 'u')
  b.hammer(7, 6, { len: 5, amp: 80, period: 90, phase: 0 })
  b.hammer(8, 13, { len: 5, amp: 80, period: 90, phase: 0.5 })
  b.hammer(7, 19, { len: 5, amp: 80, period: 90, phase: 0 })
  b.hammer(6, 28, { len: 5, amp: 80, period: 90, phase: 0.5 })

  return b.build()
}
