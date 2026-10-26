import type { Look } from './look'
import type { Theme } from './theme'

/** Zeichnet die Spielfigur. Gemeinsam genutzt vom Spiel (renderer.ts) und von der Vorschau (CharacterCanvas.vue). */

export type CharacterColors = Pick<Theme, 'player' | 'playerShade' | 'outline' | 'eyeWhite' | 'pupil'>

export interface CharacterPose {
  /** Versatz der Augen in px (Blickrichtung, etwa ±0,7) */
  face: number
  /** Versatz der Pupillen in px */
  ox: number
  oy: number
  /** 0..1, beim Fallen größere Augen und gehobene Brauen */
  fall: number
  /** Betäubt: X-Augen */
  stun: boolean
  /** Blinzeln: Striche statt Augen */
  blink: boolean
}

export const NEUTRAL_POSE: Readonly<CharacterPose> = { face: 0, ox: 0, oy: 0, fall: 0, stun: false, blink: false }

const TAU = Math.PI * 2
const EYE_Y = -7
const EYE_X = 3.1
/** Weiteste Lage der Wimpernspitzen zur Seite (Körperrand ist 6) */
const LASH_MAX_X = 5.7
/** Höchste Lage der Wimpernspitzen (Körper beginnt bei -12, Linie innen bei etwa -11,3) */
const LASH_MIN_Y = -10.9

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  tl: number,
  tr: number,
  br: number,
  bl: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + tl, y)
  ctx.lineTo(x + w - tr, y)
  ctx.arcTo(x + w, y, x + w, y + tr, tr)
  ctx.lineTo(x + w, y + h - br)
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br)
  ctx.lineTo(x + bl, y + h)
  ctx.arcTo(x, y + h, x, y + h - bl, bl)
  ctx.lineTo(x, y + tl)
  ctx.arcTo(x, y, x + tl, y, tl)
  ctx.closePath()
}

/** Abstand der Augenmitten von der Mittellinie; große Augen rücken näher zusammen, damit sie im Körper bleiben */
function eyeX(style: Look['eyes']): number {
  return style === 'big' ? 2.9 : style === 'lashes' ? 2.8 : EYE_X
}

/** Augengröße (Weiß, Pupille) je nach Stil; beim Fallen wachsen sie */
function eyeSize(style: Look['eyes'], fall: number): { er: number; pr: number } {
  switch (style) {
    case 'big':
      return { er: 2.75 + fall * 0.5, pr: 1.5 + fall * 0.2 }
    case 'small':
      return { er: 1.8 + fall * 0.6, pr: 1 + fall * 0.15 }
    case 'lashes':
      // etwas kleiner und enger, damit die Wimpern außen noch im Körper Platz haben
      return { er: 2.3 + fall * 0.7, pr: 1.2 + fall * 0.2 }
    default:
      return { er: 2.5 + fall * 0.8, pr: 1.25 + fall * 0.2 }
  }
}

/**
 * Ursprung ist die Mitte der Fußlinie, die Figur ist 12 × 12 Einheiten groß (x −6…6, y −12…0).
 * Skalierung (Quetschen/Strecken) und Position setzt der Aufrufer.
 */
export function drawCharacter(ctx: CanvasRenderingContext2D, th: CharacterColors, look: Look, pose: CharacterPose): void {
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // Körper
  ctx.fillStyle = th.player
  roundRect(ctx, -6, -12, 12, 12, 4, 4, 4, 4)
  ctx.fill()
  ctx.fillStyle = th.playerShade
  roundRect(ctx, -6, -4, 12, 4, 0, 0, 4, 4)
  ctx.fill()
  ctx.strokeStyle = th.outline
  ctx.lineWidth = 1.4
  roundRect(ctx, -6, -12, 12, 12, 4, 4, 4, 4)
  ctx.stroke()

  ctx.globalAlpha = 0.55
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.ellipse(-3.3, -9.6, 1.7, 1, -0.5, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = 1

  const { face, fall } = pose
  const { er, pr } = eyeSize(look.eyes, fall)
  const ex0 = eyeX(look.eyes)

  // Augen: Striche beim Blinzeln, X bei Betäubung, sonst Weiß mit Pupille
  if (pose.stun) {
    ctx.strokeStyle = th.outline
    ctx.lineWidth = 1.4
    ctx.beginPath()
    for (const s of [-1, 1]) {
      ctx.moveTo(s * 4.8 + face, EYE_Y - 1.4)
      ctx.lineTo(s * 1.6 + face, EYE_Y + 1.2)
    }
    ctx.stroke()
  } else if (pose.blink) {
    ctx.strokeStyle = th.outline
    ctx.lineWidth = 1.3
    ctx.beginPath()
    for (const s of [-1, 1]) {
      ctx.moveTo(s * 4.6 + face, EYE_Y)
      ctx.lineTo(s * 1.4 + face, EYE_Y)
    }
    ctx.stroke()
  } else {
    for (const ex of [-ex0, ex0]) {
      const cx = ex + face
      ctx.fillStyle = th.eyeWhite
      ctx.beginPath()
      ctx.arc(cx, EYE_Y, er, 0, TAU)
      ctx.fill()
      ctx.fillStyle = th.pupil
      ctx.beginPath()
      ctx.arc(cx + pose.ox, EYE_Y + pose.oy, pr, 0, TAU)
      ctx.fill()
      if (look.eyes === 'sleepy') {
        // Oberlid: deckt die obere Hälfte ab, öffnet sich beim Fallen
        const cover = er * 2 * 0.5 * (1 - fall * 0.8)
        ctx.save()
        ctx.beginPath()
        ctx.arc(cx, EYE_Y, er + 0.15, 0, TAU)
        ctx.clip()
        ctx.fillStyle = th.player
        ctx.fillRect(cx - er - 0.2, EYE_Y - er - 0.2, er * 2 + 0.4, cover + 0.2)
        ctx.strokeStyle = th.outline
        ctx.lineWidth = 1.1
        ctx.beginPath()
        ctx.moveTo(cx - er, EYE_Y - er + cover)
        ctx.lineTo(cx + er, EYE_Y - er + cover)
        ctx.stroke()
        ctx.restore()
      }
    }
  }

  if (look.eyes === 'lashes' && !pose.stun) drawLashes(ctx, th, pose, pose.blink ? 1.6 : er, ex0)
  ctx.restore()
}

/**
 * Wimpern: drei kurze Striche über jedem Auge, mittig und symmetrisch nach oben aufgefächert. Beim Blinzeln sitzen sie über dem Lidstrich.
 */
function drawLashes(ctx: CanvasRenderingContext2D, th: CharacterColors, pose: CharacterPose, er: number, ex0: number): void {
  ctx.strokeStyle = th.outline
  ctx.lineCap = 'round'
  const clampX = (x: number): number => Math.max(-LASH_MAX_X, Math.min(LASH_MAX_X, x))
  for (const side of [-1, 1]) {
    const cx = side * ex0 + pose.face
    // Wimpern: Winkel von senkrecht nach oben; der mittlere Strich steht genau über der Augenmitte, die anderen fächern symmetrisch auf
    ctx.lineWidth = 0.7
    ctx.beginPath()
    for (const deg of [-26, 0, 26]) {
      const a = (deg * Math.PI) / 180
      const dx = side * Math.sin(a)
      const dy = -Math.cos(a)
      const gap = 0.4
      const len = 0.6
      // Die Striche schließen außen an den Augenrand an (ragen nicht ins Weiß); die Spitzen bleiben unter der Körperlinie
      ctx.moveTo(clampX(cx + dx * (er + gap)), EYE_Y + dy * (er + gap))
      ctx.lineTo(clampX(cx + dx * (er + gap + len)), Math.max(LASH_MIN_Y, EYE_Y + dy * (er + gap + len)))
    }
    ctx.stroke()
  }
}