import { PLAYER_H, PLAYER_W } from '../sim/constants'

/** Visual-only hanging pose. The body grows downwards from its fixed head. */
export function beltPose(time: number): { sx: number; sy: number; anchorY: number } {
  const sy = 1.13 + Math.sin(time * 7) * 0.012
  return { sx: 1 / Math.sqrt(sy), sy, anchorY: PLAYER_H * sy }
}

/** Slight compression against the wall; its contact edge and vertical centre stay fixed. */
export function climberPose(time: number, direction: -1 | 1): { sx: number; sy: number; anchorX: number; anchorY: number } {
  const pulse = Math.sin(time * 9)
  const sx = 0.9 + pulse * 0.012
  const sy = 1.04 - pulse * 0.008
  return {
    sx, sy,
    anchorX: direction * PLAYER_W / 2 * (1 - sx),
    anchorY: PLAYER_H / 2 * (1 + sy),
  }
}
