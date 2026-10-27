import { LevelBuilder } from '../../sim/builder'
import type { LevelData } from '../../sim/types'

export function createDonTGetCRUSHEDLevel(): LevelData {
  const b = new LevelBuilder('short', "Don't get CRUSHED!")

  // Blöcke
  b.plat(4, 0, 4)
  b.plat(8, 0, 12, '>')
  b.plat(15, 3, 15, '<')
  b.plat(20, 0, 4)
  b.plat(20, 7, 11)
  b.plat(21, 0, 4)
  b.plat(21, 7, 11)
  b.plat(22, 0, 4)
  b.plat(22, 7, 11)
  b.plat(23, 0, 4)
  b.plat(23, 7, 11)
  b.plat(24, 0, 11)
  b.plat(30, 2, 15, '<')
  b.plat(31, 2, 15)
  b.plat(32, 2, 6)
  b.plat(32, 10, 15)
  b.plat(33, 2, 6)
  b.plat(33, 10, 15)
  b.plat(34, 2, 6)
  b.plat(34, 10, 15)
  b.plat(39, 0, 15)

  // Objekte
  b.spawn(1, 3)
  b.goal(8, 38)
  b.checkpoint(9, 19)
  b.spikes(5, 23, 'u')
  b.spikes(6, 23, 'u')
  b.crusher(9, 0, 'd', 6, { size: 2, period: 220, phase: 0 })
  b.crusher(7, 9, 'd', 4, { size: 2, period: 220, phase: 0.5 })
  b.crusher(9, 9, 'd', 4, { size: 2, period: 220, phase: 0 })
  b.crusher(5, 16, 'd', 6, { size: 2, period: 220, phase: 0.5 })
  b.crusher(12, 16, 'd', 12, { size: 2, period: 100, phase: 0.5 })
  b.crusher(14, 16, 'd', 12, { size: 2, period: 100, phase: 0.5 })
  b.crusher(7, 32, 'd', 4, { size: 3, period: 150, phase: 0.5 })

  return b.build()
}
