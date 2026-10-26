import { describe, expect, it } from 'vitest'
import { drawCharacter, NEUTRAL_POSE, type CharacterPose } from '../src/game/character'
import { applyLook, COLORS, DEFAULT_LOOK, EYES, sanitizeLook, type Look } from '../src/game/look'
import { MEMPHIS_DARK, MEMPHIS_LIGHT } from '../src/game/theme'

describe('Aussehen der Figur: Daten', () => {
  it('Standard bleibt Standard, Unbekanntes und Altes wird ersetzt', () => {
    expect(sanitizeLook(null)).toEqual(DEFAULT_LOOK)
    expect(sanitizeLook('quatsch')).toEqual(DEFAULT_LOOK)
    expect(sanitizeLook({ color: 'blue', eyes: 'big' })).toEqual({ color: 'blue', eyes: 'big' })
    expect(sanitizeLook({ color: 'neon', eyes: 7 })).toEqual(DEFAULT_LOOK)
    // Gespeicherte Werte aus früheren Versionen (Weiß, Brauen, Brillen) werden ignoriert
    expect(sanitizeLook({ color: 'white', eyes: 'lashes', brows: 'angry', glasses: 'shades' })).toEqual({
      color: DEFAULT_LOOK.color,
      eyes: 'lashes',
    })
  })

  it('es gibt fünf Augenformen, darunter die mit Wimpern', () => {
    expect(EYES.map((e) => e.id)).toEqual(['round', 'big', 'small', 'sleepy', 'lashes'])
  })

  it('Farben: eindeutige Namen, gültige Hex-Werte, kein Rot und kein Gelb', () => {
    expect(new Set(COLORS.map((c) => c.id)).size).toBe(COLORS.length)
    for (const c of COLORS) {
      if (c.body === null) continue
      expect(c.body, c.id).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(c.shade, c.id).toMatch(/^#[0-9A-Fa-f]{6}$/)
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.body!.slice(i, i + 2), 16))
      expect(r > 200 && g < 110 && b < 110, `${c.id} wirkt rot (Gefahr)`).toBe(false)
      expect(r > 220 && g > 190 && b < 120, `${c.id} wirkt gelb (Ziel)`).toBe(false)
      expect(r > 225 && g > 225 && b > 225, `${c.id} ist (fast) weiß`).toBe(false)
    }
  })

  it('applyLook: Pink ist das Theme selbst, andere Farben ersetzen Körper und Schatten', () => {
    expect(applyLook(MEMPHIS_LIGHT, { color: 'pink' })).toBe(MEMPHIS_LIGHT)
    expect(applyLook(MEMPHIS_LIGHT, { color: 'unbekannt' })).toBe(MEMPHIS_LIGHT)
    const o = applyLook(MEMPHIS_DARK, { color: 'orange' })
    expect(o.player).toBe('#FF8A3D')
    expect(o.playerShade).toBe('#D9601A')
    expect(o.outline).toBe(MEMPHIS_DARK.outline)
    expect(MEMPHIS_DARK.player).not.toBe('#FF8A3D') // Original bleibt unverändert
  })

  it('Pink ist das Pink des Themes, nie die aktuell gewählte Farbe (Farbfelder rechnen mit dem Basis-Theme)', () => {
    const chosen = applyLook(MEMPHIS_LIGHT, { color: 'blue' })
    expect(chosen.player).toBe('#3A86FF')
    // Wer pink wählt, bekommt wieder die Farbe des Original-Themes
    expect(applyLook(MEMPHIS_LIGHT, { color: 'pink' }).player).toBe(MEMPHIS_LIGHT.player)
    expect(MEMPHIS_LIGHT.player).not.toBe(chosen.player)
  })
})

/** Zeichenfläche, die nur die Lage aller gezeichneten Punkte festhält (ohne Schatten und Strichbreite) */
function recorder() {
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  const add = (x: number, y: number, r = 0) => {
    box.minX = Math.min(box.minX, x - r)
    box.maxX = Math.max(box.maxX, x + r)
    box.minY = Math.min(box.minY, y - r)
    box.maxY = Math.max(box.maxY, y + r)
  }
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    fill() {},
    stroke() {},
    clip() {},
    moveTo: (x: number, y: number) => add(x, y),
    lineTo: (x: number, y: number) => add(x, y),
    arcTo: (x1: number, y1: number) => add(x1, y1),
    arc: (x: number, y: number, r: number) => add(x, y, r),
    ellipse: (x: number, y: number, rx: number) => add(x, y, rx),
    fillRect: (x: number, y: number, w: number, h: number) => {
      add(x, y)
      add(x + w, y + h)
    },
  } as unknown as CanvasRenderingContext2D
  return { ctx, box }
}

describe('Aussehen der Figur: Zeichnen', () => {
  const poses: Array<[string, CharacterPose]> = [
    ['ruhig', NEUTRAL_POSE],
    ['schaut rechts', { ...NEUTRAL_POSE, face: 0.7, ox: 1.1 }],
    ['schaut links', { ...NEUTRAL_POSE, face: -0.7, ox: -1.1 }],
    ['fällt', { ...NEUTRAL_POSE, fall: 1, oy: 1 }],
    ['fällt nach rechts', { ...NEUTRAL_POSE, fall: 1, oy: 1, face: 0.7, ox: 1.1 }],
    ['betäubt', { ...NEUTRAL_POSE, stun: true }],
    ['blinzelt', { ...NEUTRAL_POSE, blink: true }],
  ]

  it('jede Augenform bleibt in allen Posen in der Figur, nichts ragt oben oder seitlich heraus', () => {
    let n = 0
    for (const eyes of EYES) {
      const look: Look = { color: 'pink', eyes: eyes.id }
      for (const [name, pose] of poses) {
        const { ctx, box } = recorder()
        drawCharacter(ctx, MEMPHIS_LIGHT, look, pose)
        const what = `${eyes.id} ${name}`
        expect(box.minY, what).toBeGreaterThanOrEqual(-12.001) // Oberkante des Körpers
        expect(box.maxY, what).toBeLessThanOrEqual(0.001)
        expect(box.minX, what).toBeGreaterThanOrEqual(-7.3)
        expect(box.maxX, what).toBeLessThanOrEqual(7.3)
        n++
      }
    }
    expect(n).toBe(EYES.length * poses.length)
  })

  it('Wimpern: sitzen oben außen, bleiben innerhalb der Körperlinie und fehlen bei Treffern', () => {
    const lashes = (pose: CharacterPose) => {
      const r = recorder()
      drawCharacter(r.ctx, MEMPHIS_LIGHT, { color: 'pink', eyes: 'lashes' }, pose)
      return r.box
    }
    const plain = (pose: CharacterPose) => {
      const r = recorder()
      drawCharacter(r.ctx, MEMPHIS_LIGHT, { color: 'pink', eyes: 'round' }, pose)
      return r.box
    }
    // Ohne Wimpern wäre die Zeichnung gleich: die Wimpern müssen also etwas hinzufügen
    expect(lashes(NEUTRAL_POSE)).not.toEqual({ ...plain(NEUTRAL_POSE), minY: 0 })
    // Wimpern und Augen bleiben innerhalb des Körpers (Körperrand ±6; die Prüfung rechnet Bögen als ganze Kreise)
    for (const [name, pose] of poses) {
      const b = lashes(pose)
      expect(b.minX, name).toBeGreaterThanOrEqual(-6.7)
      expect(b.maxX, name).toBeLessThanOrEqual(6.7)
    }
    // Bei Treffern (X-Augen) gibt es keine Wimpern
    expect(lashes({ ...NEUTRAL_POSE, stun: true })).toEqual(plain({ ...NEUTRAL_POSE, stun: true }))
  })
})
