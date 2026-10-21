export type ParticleShape = 'circle' | 'square' | 'star'

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  color: string
  gravity: number
  shape: ParticleShape
  spin: number
  rot: number
}

/** Einfaches Partikelsystem, nur für die Optik. Beeinflusst die Simulation nie. */
export class Particles {
  private list: Particle[] = []

  get count(): number {
    return this.list.length
  }

  clear(): void {
    this.list.length = 0
  }

  burst(
    x: number,
    y: number,
    n: number,
    opts: {
      colors: string[]
      speed?: number
      life?: number
      size?: number
      gravity?: number
      shape?: ParticleShape
      angle?: number
      spread?: number
    },
  ): void {
    const speed = opts.speed ?? 80
    const life = opts.life ?? 0.5
    const size = opts.size ?? 2
    const baseAngle = opts.angle ?? 0
    const spread = opts.spread ?? Math.PI * 2
    for (let i = 0; i < n; i++) {
      if (this.list.length > 400) this.list.shift()
      const a = baseAngle + (Math.random() - 0.5) * spread
      const s = speed * (0.35 + Math.random() * 0.65)
      this.list.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: life * (0.6 + Math.random() * 0.4),
        max: life,
        size: size * (0.6 + Math.random() * 0.8),
        color: opts.colors[Math.floor(Math.random() * opts.colors.length)],
        gravity: opts.gravity ?? 220,
        shape: opts.shape ?? 'circle',
        spin: (Math.random() - 0.5) * 12,
        rot: Math.random() * Math.PI * 2,
      })
    }
  }

  update(dt: number): void {
    const l = this.list
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i]
      p.life -= dt
      if (p.life <= 0) {
        l[i] = l[l.length - 1]
        l.pop()
        continue
      }
      p.vy += p.gravity * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rot += p.spin * dt
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.list) {
      const k = Math.max(0, p.life / p.max)
      ctx.globalAlpha = Math.min(1, k * 1.6)
      ctx.fillStyle = p.color
      const s = p.size * (0.4 + 0.6 * k)
      if (p.shape === 'circle') {
        ctx.beginPath()
        ctx.arc(p.x, p.y, s, 0, Math.PI * 2)
        ctx.fill()
      } else if (p.shape === 'square') {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillRect(-s, -s, s * 2, s * 2)
        ctx.restore()
      } else {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.beginPath()
        for (let i = 0; i < 8; i++) {
          const r = i % 2 === 0 ? s * 1.8 : s * 0.6
          const a = (i / 8) * Math.PI * 2
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
        }
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
    }
    ctx.globalAlpha = 1
  }
}
