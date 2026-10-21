import { LASER_WARN_TICKS, TICK_RATE } from './constants'
import { cosRad, cosTurns, sinRad, sinTurns, TAU } from './mathx'

export interface HammerParams {
  /** Aufhängepunkt in Weltkoordinaten */
  ax: number
  ay: number
  /** Armlänge in Einheiten */
  len: number
  /** Amplitude in Radiant */
  amp: number
  /** Periode in Ticks */
  period: number
  /** Phase als Anteil einer Periode (0..1) */
  phase: number
}

export interface HammerState {
  /** Mittelpunkt des Kopfs */
  x: number
  y: number
  /** Geschwindigkeit des Kopfs in Einheiten pro Sekunde */
  vx: number
  vy: number
  /** Winkel in Radiant, 0 = senkrecht nach unten, positiv = nach rechts */
  angle: number
}

/**
 * Pose des Hammers zu einem beliebigen (auch gebrochenen) Tick.
 * Reine Funktion der Zeit: kein akkumulierter Zustand, daher deterministisch.
 */
export function hammerState(h: HammerParams, tick: number): HammerState {
  const u = tick / h.period + h.phase
  const angle = h.amp * sinTurns(u)
  const angularVel = h.amp * (TAU / h.period) * TICK_RATE * cosTurns(u)
  const sa = sinRad(angle)
  const ca = cosRad(angle)
  return {
    x: h.ax + sa * h.len,
    y: h.ay + ca * h.len,
    vx: ca * h.len * angularVel,
    vy: -sa * h.len * angularVel,
    angle,
  }
}

export interface LaserTiming {
  period: number
  on: number
  phase: number
}

export type LaserPhase = 'on' | 'warn' | 'off'

export function laserPhase(l: LaserTiming, tick: number): LaserPhase {
  const t = (Math.floor(tick) + l.phase) % l.period
  if (t < l.on) return 'on'
  if (t >= Math.max(l.on, l.period - LASER_WARN_TICKS)) return 'warn'
  return 'off'
}

export interface SawParams {
  /** Bahn-Enden in Weltkoordinaten (Mittelpunkt der Säge) */
  x0: number
  y0: number
  x1: number
  y1: number
  /** Ticks für Hin- und Rückweg */
  period: number
  phase: number
}

/** Mittelpunkt der Säge zu einem Tick. Weich an den Enden (Kosinus), reine Funktion der Zeit. */
export function sawPos(s: SawParams, tick: number): { x: number; y: number } {
  const f = 0.5 - 0.5 * cosTurns(tick / s.period + s.phase)
  return { x: s.x0 + (s.x1 - s.x0) * f, y: s.y0 + (s.y1 - s.y0) * f }
}
