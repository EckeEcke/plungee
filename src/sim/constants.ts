// Alle Werte in logischen Einheiten (1 Tile = 16 Einheiten) und Sekunden.
// Die Simulation ist vollständig von Rendering und Browser entkoppelt,
// damit sie später identisch auf dem Devvit-Server zur Replay-Validierung laufen kann.

export const TICK_RATE = 60
export const DT = 1 / TICK_RATE

export const TILE = 16
export const LEVEL_COLS = 16
export const LEVEL_WIDTH = LEVEL_COLS * TILE

export const LEVEL_ROWS = { short: 40, medium: 80, long: 140 } as const
export type LevelSize = keyof typeof LEVEL_ROWS

// Spieler
export const PLAYER_W = 12
export const PLAYER_H = 12
export const MOVE_SPEED = 110
export const ACCEL_GROUND = 1800
export const ACCEL_AIR = 1100
export const GRAVITY = 900
export const TERMINAL_VY = 340

// Federn: Startgeschwindigkeit nach oben (Index = power - 1).
// 380 -> ca. 5 Tiles Höhe, 520 -> ca. 9 Tiles Höhe
export const SPRING_POWER = [380, 520] as const

// Tod / Respawn
export const RESPAWN_TICKS = 18
export const VOID_MARGIN = 48

// Laser
export const LASER_WARN_TICKS = 24
export const LASER_BEAM_W = 4

// Hammer
export const HAMMER_HEAD_R = 10
export const HAMMER_KNOCKBACK = 1.6
export const HAMMER_MIN_PUSH = 140
export const HAMMER_LIFT = 60
export const HAMMER_MAX_KB = 420
export const HAMMER_STUN_TICKS = 14
export const HAMMER_HIT_COOLDOWN = 20
// Block-Typen
export const ICE_ACCEL = 240
export const BELT_SPEED = 60
/** Ticks vom ersten Betreten bis die brüchige Plattform verschwindet */
export const CRUMBLE_DELAY = 30
/** Ticks, die sie danach weg bleibt */
export const CRUMBLE_REGROW = 150

// Blinkblöcke: globaler Takt, 'X' ist in der ersten Hälfte fest, 'O' in der zweiten
export const BLINK_PERIOD = 180
export const BLINK_HALF = BLINK_PERIOD / 2
/** Ticks vor dem Verschwinden, in denen der Block flackert (nur Darstellung) */
export const BLINK_WARN = 24

// Bewegliche Plattform: Einwegplatte, trägt den Spieler
export const MOVER_H = 8
export const MAX_MOVER_LEN = 12
export const MAX_MOVER_W = 4

// Quetscher: Block gleitet entlang einer Bahn und tötet bei Berührung
export const MAX_CRUSHER_LEN = 12
export const MAX_CRUSHER_SIZE = 3
/** Anteile einer Periode: Ruhe, Schlag, Halten, Rückweg (Summe 1) */
export const CRUSHER_REST = 0.5
export const CRUSHER_SLAM = 0.08
export const CRUSHER_HOLD = 0.12
/** Ticks vor dem Schlag, in denen der Quetscher wackelt (nur Darstellung) */
export const CRUSHER_WARN_TICKS = 24
/** Hitbox schrumpft um so viele Einheiten je Seite (faire Kollision) */
export const CRUSHER_HIT_INSET = 1

// Seitenfeder
export const SPRING_SIDE_POWER = [300, 460] as const
export const SPRING_SIDE_LIFT = 110
export const SPRING_SIDE_STUN = 12

// Säge
export const SAW_R = 7
export const SAW_HIT_R = 6
export const MAX_SAW_LEN = 14

export const STUN_DAMP = 0.97

// Kollisions-Details
export const MAX_STEP = 6
export const EPS = 1e-4
/** Mindestüberdeckung mit der Platte (px), damit die Kante die Figur auf sie schieben darf */
export const SHOVE_MIN_OVERLAP = 2
export const LAND_EVENT_VY = 120

// Replays
/** Bei jeder Änderung an der Physik/Sim-Logik erhöhen: gespeicherte Replays und Bestzeiten gehören zu einer Version (Server speichert sie je Level) */
export const SIM_VERSION = 1
export const MAX_REPLAY_TICKS = TICK_RATE * 60 * 10