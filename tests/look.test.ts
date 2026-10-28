import { describe, expect, it } from 'vitest'
import { drawCharacter, NEUTRAL_POSE, type CharacterPose } from '../src/game/character'
import { applyLook, COLORS, DEFAULT_LOOK, EYES, PATTERN_COLORS, PATTERNS, randomLook, sanitizeLook, type Look } from '../src/game/look'
import { MEMPHIS_DARK, MEMPHIS_LIGHT } from '../src/game/theme'

describe('Aussehen der Figur: Daten', () => {
  it('Standard bleibt Standard, Unbekanntes und Altes wird ersetzt', () => {
    expect(sanitizeLook(null)).toEqual(DEFAULT_LOOK)
    expect(sanitizeLook('quatsch')).toEqual(DEFAULT_LOOK)
    expect(sanitizeLook({ color: 'blue', eyes: 'big' })).toEqual({ ...DEFAULT_LOOK, color: 'blue', eyes: 'big' })
    expect(sanitizeLook({ pattern: 'hearts', patternColor: 'yellow' })).toEqual({
      ...DEFAULT_LOOK,
      pattern: 'hearts',
      patternColor: 'yellow',
    })
    // Alte Spielstände ohne Muster bekommen "kein Muster"
    expect(sanitizeLook({ color: 'blue', eyes: 'big' }).pattern).toBe('none')
    expect(sanitizeLook({ pattern: 'zebra', patternColor: 'red' })).toEqual(DEFAULT_LOOK)
    expect(sanitizeLook({ color: 'neon', eyes: 7 })).toEqual(DEFAULT_LOOK)
    // Gespeicherte Werte aus früheren Versionen (Weiß, Brauen, Brillen) werden ignoriert
    expect(sanitizeLook({ color: 'white', eyes: 'lashes', brows: 'angry', glasses: 'shades' })).toEqual({
      ...DEFAULT_LOOK,
      eyes: 'lashes',
    })
  })

  it('es gibt fünf Augenformen, darunter die mit Wimpern', () => {
    expect(EYES.map((e) => e.id)).toEqual(['round', 'big', 'small', 'sleepy', 'lashes'])
  })

  it('es gibt fünf Muster plus "kein Muster", die Musterfarben sind eindeutig und ohne Rot', () => {
    expect(PATTERNS.map((p) => p.id)).toEqual(['none', 'stripes', 'dots', 'checks', 'stars', 'hearts'])
    expect(new Set(PATTERN_COLORS.map((c) => c.id)).size).toBe(PATTERN_COLORS.length)
    for (const c of PATTERN_COLORS) {
      if (c.hex === null) continue
      expect(c.hex, c.id).toMatch(/^#[0-9A-Fa-f]{6}$/)
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.hex!.slice(i, i + 2), 16))
      expect(r > 200 && g < 110 && b < 110, `${c.id} wirkt rot (Gefahr)`).toBe(false)
    }
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
    rect: () => {},
    bezierCurveTo: () => {},
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
      const look: Look = { ...DEFAULT_LOOK, eyes: eyes.id }
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
      drawCharacter(r.ctx, MEMPHIS_LIGHT, { ...DEFAULT_LOOK, eyes: 'lashes' }, pose)
      return r.box
    }
    const plain = (pose: CharacterPose) => {
      const r = recorder()
      drawCharacter(r.ctx, MEMPHIS_LIGHT, { ...DEFAULT_LOOK, eyes: 'round' }, pose)
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

describe('Aussehen der Figur: Muster', () => {
  it('jedes Muster in jeder Farbe und jeder Pose zeichnet ohne Fehler', () => {
    for (const pattern of PATTERNS) {
      for (const pc of PATTERN_COLORS) {
        for (const eyes of EYES) {
          const { ctx } = recorder()
          expect(() =>
            drawCharacter(ctx, MEMPHIS_DARK, { color: 'blue', eyes: eyes.id, pattern: pattern.id, patternColor: pc.id }, NEUTRAL_POSE),
          ).not.toThrow()
        }
      }
    }
  })

  it('ein Muster wird auf den Körper beschnitten und benutzt die gewählte Farbe (Dark = Konturfarbe des Themes)', () => {
    const fills: string[] = []
    let clips = 0
    const { ctx } = recorder()
    const spy = new Proxy(ctx as unknown as Record<string, unknown>, {
      set(t, k, v) {
        if (k === 'fillStyle') fills.push(String(v))
        t[k as string] = v
        return true
      },
      get(t, k) {
        if (k === 'clip') return () => void clips++
        return t[k as string]
      },
    }) as unknown as CanvasRenderingContext2D
    drawCharacter(spy, MEMPHIS_LIGHT, { ...DEFAULT_LOOK, pattern: 'stripes', patternColor: 'ink' }, NEUTRAL_POSE)
    expect(clips).toBe(1)
    expect(fills).toContain(MEMPHIS_LIGHT.outline)
    clips = 0
    drawCharacter(spy, MEMPHIS_LIGHT, { ...DEFAULT_LOOK, pattern: 'none' }, NEUTRAL_POSE)
    expect(clips).toBe(0)
  })
})

describe('Aussehen der Figur: Zufall', () => {
  it('liefert immer gültige Werte, auch an den Rändern des Zufalls', () => {
    for (const r of [0, 0.5, 0.999999, 1]) {
      const l = randomLook(() => r)
      expect(sanitizeLook(l)).toEqual(l)
    }
    for (let i = 0; i < 200; i++) {
      const l = randomLook()
      expect(sanitizeLook(l)).toEqual(l)
    }
  })

  it('trifft über viele Würfe alle Werte jeder Option', () => {
    const seen = { color: new Set<string>(), eyes: new Set<string>(), pattern: new Set<string>(), patternColor: new Set<string>() }
    for (let i = 0; i < 600; i++) {
      const l = randomLook()
      seen.color.add(l.color)
      seen.eyes.add(l.eyes)
      seen.pattern.add(l.pattern)
      seen.patternColor.add(l.patternColor)
    }
    expect(seen.color.size).toBe(COLORS.length)
    expect(seen.eyes.size).toBe(EYES.length)
    expect(seen.pattern.size).toBe(PATTERNS.length)
    expect(seen.patternColor.size).toBe(PATTERN_COLORS.length)
  })

  it('ergibt nie dasselbe Aussehen wie das aktuelle', () => {
    const now: Look = { color: 'blue', eyes: 'big', pattern: 'stars', patternColor: 'yellow' }
    for (let i = 0; i < 300; i++) expect(randomLook(Math.random, now)).not.toEqual(now)
    // Selbst ein Zufall, der immer dasselbe würfelt, liefert etwas anderes als das Aktuelle
    expect(randomLook(() => 0, { ...DEFAULT_LOOK, color: COLORS[0].id, eyes: EYES[0].id, pattern: 'none' })).not.toEqual({
      ...DEFAULT_LOOK,
      color: COLORS[0].id,
      eyes: EYES[0].id,
      pattern: 'none',
    })
  })
})