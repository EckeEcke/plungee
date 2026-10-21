import { LevelBuilder } from '../../sim/builder'
import type { LevelData } from '../../sim/types'

export function createFriendOrEnemyLevel(): LevelData {
  const b = new LevelBuilder('short', "Friend or Enemy?")

  // Blöcke
  b.plat(0, 0, 4)
  b.plat(1, 0, 4)
  b.plat(2, 0, 4)
  b.plat(3, 0, 4)
  b.plat(4, 0, 11)
  b.plat(5, 0, 11)
  b.plat(12, 4, 8)
  b.plat(12, 11, 15)
  b.plat(13, 4, 8)
  b.plat(13, 11, 15)
  b.plat(14, 4, 15)
  b.plat(21, 0, 6)
  b.plat(21, 12, 13)
  b.plat(22, 0, 13)
  b.plat(23, 0, 1)
  b.plat(24, 0, 1)
  b.plat(25, 0, 1)
  b.plat(26, 0, 1)
  b.plat(27, 0, 1)
  b.plat(28, 0, 1)
  b.plat(29, 0, 1)
  b.plat(30, 0, 5)
  b.plat(31, 0, 5)
  b.plat(33, 10, 15)
  b.plat(34, 10, 15)

  // Objekte
  b.spawn(7, 3)
  b.goal(3, 29)
  b.checkpoint(5, 11)
  b.checkpoint(13, 20)
  b.spring(5, 20, 1)
  b.spring(10, 32, 2)
  b.spikes(9, 13, 'u')
  b.spikes(10, 13, 'u')
  b.spikes(7, 21, 'u')
  b.spikes(8, 21, 'u')
  b.spikes(9, 21, 'u')
  b.spikes(10, 21, 'u')
  b.spikes(11, 21, 'u')
  b.hammer(12, 6, { len: 5, amp: 60, period: 90, phase: 0 })
  b.hammer(4, 15, { len: 5, amp: 80, period: 90, phase: 0 })
  b.hammer(10, 23, { len: 5, amp: 80, period: 90, phase: 0 })

  return b.build()
}
