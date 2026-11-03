import { HAMMER_HEAD_R, LASER_BEAM_W, MOVER_H, TILE, CRUMBLE_DELAY } from './constants'
import { crusherState, hammerState, sawPos } from './hazards'
import type { CompiledLaser, CompiledLevel } from './level'
import { blinkSolid, isBlinkKind, K_BRITTLE, K_ONEWAY, K_GATE_D, K_GATE_L, K_GATE_R } from './tiles'
import type { Rect } from './types'
import { fallingSpikeBottom } from './fallingSpike'

/** Current beam, shared by rendering and simulation. Never mutate the compiled level. */
export function laserBeam(level: CompiledLevel, laser: CompiledLaser, tick: number, crumble: Int32Array, movementTick = tick, fallingSpikes: ReadonlyArray<{ x: number; y: number }> = []): Rect | null {
  const vertical = laser.dir === 'u' || laser.dir === 'd'
  const positive = laser.dir === 'd' || laser.dir === 'r'
  const dc = vertical ? 0 : positive ? 1 : -1
  const dr = vertical ? positive ? 1 : -1 : 0
  const center = ((vertical ? laser.col : laser.row) + 0.5) * TILE
  const origin = ((vertical ? laser.row : laser.col) + (positive ? 1 : 0)) * TILE
  let length = positive ? (vertical ? level.height : level.width) - origin : origin
  const half = LASER_BEAM_W / 2

  function blockRect(rect: Rect): void {
    const cross = vertical ? rect.x : rect.y
    const crossSize = vertical ? rect.w : rect.h
    if (cross >= center + half || cross + crossSize <= center - half) return
    const along = vertical ? rect.y : rect.x
    const size = vertical ? rect.h : rect.w
    const near = positive ? along - origin : origin - along - size
    const far = positive ? along + size - origin : origin - along
    if (far > 0) length = Math.min(length, Math.max(0, near))
  }

  for (let row = laser.row + dr, col = laser.col + dc;
    row >= 0 && row < level.rows && col >= 0 && col < level.cols; row += dr, col += dc) {
    const i = row * level.cols + col
    const kind = level.kind[i]
    let solid = level.solid[i] === 1
    if (isBlinkKind(kind)) solid = blinkSolid(kind, tick)
    else if (kind === K_BRITTLE) solid = !(crumble[i] >= 0 && tick - crumble[i] >= CRUMBLE_DELAY)
    else if (kind === K_ONEWAY) solid = laser.dir === 'd'
    else if (kind === K_GATE_D) solid = laser.dir === 'u'
    else if (kind === K_GATE_L) solid = laser.dir === 'r'
    else if (kind === K_GATE_R) solid = laser.dir === 'l'
    if (solid) { blockRect({ x: col * TILE, y: row * TILE, w: TILE, h: TILE }); break }
  }
  for (const mover of level.movers) {
    const pos = sawPos(mover, movementTick)
    blockRect({ ...pos, w: mover.w * TILE, h: MOVER_H })
  }
  for (const crusher of level.crushers) {
    const f = crusherState(crusher, movementTick).f
    blockRect({ x: crusher.x0 + crusher.dx * f, y: crusher.y0 + crusher.dy * f, w: crusher.size * TILE, h: crusher.size * TILE })
  }
  for (const spike of fallingSpikes) {
    if (vertical) {
      const bottom = fallingSpikeBottom(spike, center - half, center + half)
      if (bottom !== null) blockRect({ x: spike.x, y: spike.y, w: TILE, h: bottom - spike.y })
    } else {
      const depth = Math.max(0, center - half - spike.y)
      if (depth >= TILE) continue
      const halfWidth = TILE / 2 * (1 - depth / TILE)
      blockRect({ x: spike.x + TILE / 2 - halfWidth, y: spike.y, w: 2 * halfWidth, h: TILE })
    }
  }
  for (const hammer of level.hammers) {
    const pos = hammerState(hammer, tick)
    const offset = Math.max(0, Math.abs((vertical ? pos.x : pos.y) - center) - half)
    if (offset >= HAMMER_HEAD_R) continue
    const extent = Math.sqrt(HAMMER_HEAD_R * HAMMER_HEAD_R - offset * offset)
    const along = vertical ? pos.y : pos.x
    const distance = positive ? along - origin : origin - along
    if (distance + extent > 0) length = Math.min(length, Math.max(0, distance - extent))
  }
  if (length <= 0) return null
  return vertical
    ? { x: center - half, y: positive ? origin : origin - length, w: LASER_BEAM_W, h: length }
    : { x: positive ? origin : origin - length, y: center - half, w: length, h: LASER_BEAM_W }
}
