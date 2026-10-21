import { LevelBuilder } from '../../src/sim/builder'
import type { LevelData } from '../../src/sim/types'

/** Eigene Test-Level, unabhängig von den Dateien in src/levels (die ändert der Spieleentwickler frei). */

export function createDemoLevel(): LevelData {
  const b = new LevelBuilder('short', 'Fixture Demo')
  b.spawn(8, 2)
  b.plat(4, 0, 9)
  b.plat(8, 6, 15, 'I')
  b.checkpoint(10, 7)
  b.plat(12, 0, 10, '<')
  b.plat(16, 5, 15, '=')
  b.spikes(14, 15, 'u')
  b.plat(20, 0, 8, 'B')
  b.hammer(11, 17, { len: 2, amp: 50, period: 130, phase: 0 })
  b.plat(25, 3, 15)
  b.spring(4, 24, 1)
  b.plat(30, 0, 12)
  b.saw(8, 28, 'h', 4, { period: 200, phase: 0 })
  b.plat(35, 0, 15)
  b.goal(8, 34)
  return b.build()
}

export function createTestLevel(): LevelData {
  const b = new LevelBuilder('long', 'Mind the Spikes')
  b.spawn(2, 2)
  b.plat(3, 0, 14)
  b.plat(5, 1, 15).hammer(5, 3, { len: 2, amp: 90, period: 130, phase: 0 })
  b.plat(10, 9, 15)
  b.spikesRow(9, 9, 11)
  b.plat(15, 4, 11).checkpoint(7, 14)
  b.spikes(4, 14, 'u')
  b.spikes(11, 14, 'u')
  b.plat(20, 0, 5)
  b.spikesRow(19, 0, 2)
  b.plat(25, 10, 15)
  b.spikesRow(24, 13, 15)
  b.plat(30, 3, 12).checkpoint(6, 29)
  b.spikes(9, 29, 'u')
  b.plat(35, 5, 10)
  b.goal(7, 34)
  b.laser(15, 34, 'l', { period: 150, on: 54, phase: 0 })
  b.plat(44, 0, 15).spring(6, 43, 2)
  return b.build()
}
