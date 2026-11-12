import { LevelBuilder } from '../../sim/builder'
import type { LevelData } from '../../sim/types'

export function createGrabTheKeyLevel(): LevelData {
  const b = new LevelBuilder('short', "Grab the Key")

  // Blöcke
  b.plat(4, 5, 10)
  b.plat(11, 0, 5)
  b.plat(11, 10, 15)
  b.plat(16, 4, 7, '<')
  b.plat(16, 8, 11, '>')
  b.plat(22, 0, 5, '>')
  b.plat(22, 11, 15, '<')
  b.plat(27, 6, 10, '=')
  b.plat(35, 6, 10)
  b.plat(36, 6, 6)
  b.plat(36, 10, 10)
  b.plat(37, 6, 6)
  b.plat(37, 10, 10)
  b.plat(38, 6, 6)
  b.plat(39, 0, 15)

  // Objekte
  b.spawn(7, 3)
  b.goal(8, 38)
  b.key(8, 28)
  b.door(10, 38)
  b.spring(8, 34, 2)
  b.spring(3, 38, 2)
  b.spring(13, 38, 2)
  b.fallingSpike(7, 5)
  b.fallingSpike(8, 5)
  b.hammer(2, 6, { len: 2, amp: 80, period: 180, phase: 0.5 })
  b.hammer(13, 6, { len: 2, amp: 80, period: 180, phase: 0.5 })
  b.hammer(1, 14, { len: 2, amp: 80, period: 180, phase: 0 })
  b.hammer(14, 14, { len: 2, amp: 80, period: 180, phase: 0 })
  b.hammer(4, 29, { len: 2, amp: 80, period: 180, phase: 0.5 })
  b.hammer(12, 29, { len: 2, amp: 80, period: 180, phase: 0.5 })

  return b.build()
}
