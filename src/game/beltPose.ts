import { PLAYER_H } from '../sim/constants'

/** Visual-only hanging pose. The body grows downwards from its fixed head. */
export function beltPose(time: number): { sx: number; sy: number; anchorY: number } {
  const sy = 1.13 + Math.sin(time * 7) * 0.012
  return { sx: 1 / Math.sqrt(sy), sy, anchorY: PLAYER_H * sy }
}
