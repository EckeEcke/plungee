import { LevelBuilder } from '../../sim/builder'
import type { LevelData } from '../../sim/types'

export function createFromTheBottomLevel(): LevelData {
  const b = new LevelBuilder('short', "From the bottom 2")

  // Blöcke
  b.plat(4, 5, 10)
  b.plat(5, 5, 5)
  b.plat(5, 10, 10)
  b.plat(6, 5, 5)
  b.plat(6, 10, 10)
  b.plat(7, 5, 5)
  b.plat(7, 10, 10)
  b.plat(8, 5, 5)
  b.plat(8, 10, 10)
  b.plat(9, 5, 5)
  b.plat(9, 10, 10)
  b.plat(16, 7, 8)
  b.plat(17, 7, 8)
  b.plat(18, 6, 9)
  b.plat(19, 0, 1)
  b.plat(19, 14, 15)

  // Objekte
  b.spawn(7, 3)
  b.goal(7, 6)
  b.spring(7, 15, 2)
  b.spring(8, 15, 2)
  b.spring(6, 17, 1)
  b.spring(9, 17, 1)
  b.spring(0, 18, 2)
  b.spring(1, 18, 2)
  b.spring(14, 18, 2)
  b.spring(15, 18, 2)
  b.hammer(5, 10, { len: 3, amp: 80, period: 130, phase: 0 })
  b.hammer(10, 10, { len: 3, amp: 80, period: 130, phase: 0.5 })

  return b.build()
}
