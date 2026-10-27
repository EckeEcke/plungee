import {
  CRUSHER_HOLD,
  CRUSHER_REST,
  CRUSHER_SLAM,
  CRUSHER_WARN_TICKS,
  LASER_WARN_TICKS,
  TICK_RATE,
} from './constants'
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

export interface CrusherTiming {
  period: number
  phase: number
}

export interface CrusherState {
  /** 0 = Ruhelage, 1 = Endlage (ganz unten, wenn er nach unten schlägt) */
  f: number
  /** Kurz vor dem Schlag: wackelt (nur Darstellung) */
  warn: boolean
  /** Wird gerade zugeschlagen */
  slamming: boolean
}

/**
 * Zustand eines Quetschers zu einem (auch gebrochenen) Tick. Ruhe, schneller Schlag (quadratisch beschleunigt),
 * kurzes Halten, langsamer Rückweg. Reine Funktion der Zeit, daher deterministisch.
 */
export function crusherState(c: CrusherTiming, tick: number): CrusherState {
  const u = (((tick / c.period + c.phase) % 1) + 1) % 1
  const slamEnd = CRUSHER_REST + CRUSHER_SLAM
  const holdEnd = slamEnd + CRUSHER_HOLD
  const warn = u < CRUSHER_REST && u >= CRUSHER_REST - CRUSHER_WARN_TICKS / c.period
  if (u < CRUSHER_REST) return { f: 0, warn, slamming: false }
  if (u < slamEnd) {
    const k = (u - CRUSHER_REST) / CRUSHER_SLAM
    return { f: k * k, warn: false, slamming: true }
  }
  if (u < holdEnd) return { f: 1, warn: false, slamming: false }
  const k = (u - holdEnd) / (1 - holdEnd)
  // Sanft zurück: Kosinus-Ausgleich, damit er in der Ruhelage nicht ruckt
  return { f: 0.5 + 0.5 * cosTurns(k * 0.5), warn: false, slamming: false }
}