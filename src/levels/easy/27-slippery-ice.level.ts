import { LevelBuilder } from '../../sim/builder'
import type { LevelData } from '../../sim/types'

export function createSlipperyIceLevel(): LevelData {
  const b = new LevelBuilder('short', "Slippery Ice")

  // Blöcke
  b.plat(4, 5, 10, 'I')
  b.plat(9, 0, 5, 'I')
  b.plat(9, 10, 15, 'I')
  b.plat(12, 7, 8, 'I')
  b.plat(13, 7, 8, 'I')
  b.plat(14, 2, 13, 'I')
  b.plat(19, 0, 0, 'I')
  b.plat(19, 15, 15, 'I')
  b.plat(20, 0, 0, 'I')
  b.plat(20, 15, 15, 'I')
  b.plat(21, 0, 6, 'I')
  b.plat(21, 9, 15, 'I')
  b.plat(22, 9, 15, 'I')
  b.plat(23, 9, 15, 'I')
  b.plat(24, 9, 15, 'I')
  b.plat(25, 3, 15, 'I')
  b.plat(30, 0, 13, 'I')
  b.plat(31, 0, 13, 'I')
  b.plat(36, 10, 15, 'I')
  b.plat(37, 10, 15, 'I')
  b.plat(38, 10, 15, 'I')
  b.plat(39, 0, 5, 'I')
  b.plat(39, 6, 9, '>')
  b.plat(39, 10, 15, 'I')

  // Objekte
  b.spawn(7, 3)
  b.goal(1, 38)
  b.spring(6, 13, 1, 'l')
  b.spring(9, 13, 2, 'r')
  b.spring(1, 20, 1, 'r')
  b.spring(14, 20, 2, 'l')
  b.spring(15, 35, 2, 'l')
  b.hammer(1, 5, { len: 3, amp: 80, period: 180, phase: 0.5 })
  b.hammer(13, 5, { len: 3, amp: 80, period: 180, phase: 0 })
  b.hammer(5, 26, { len: 3, amp: 80, period: 180, phase: 0 })
  b.hammer(10, 26, { len: 3, amp: 80, period: 180, phase: 0 })

  return b.build()
}
