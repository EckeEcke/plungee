import type { InputDir } from '../sim'

/**
 * Tastatur (Pfeile, A/D) und Touch/Maus (linke oder rechte Bildschirmhälfte halten).
 * Liefert pro Frame die aktuelle Richtung -1 / 0 / +1.
 */
export class InputController {
  private left = false
  private right = false
  private pointers = new Map<number, -1 | 1>()
  private disposers: Array<() => void> = []

  onRestart: (() => void) | null = null

  constructor(private target: HTMLElement) {
    const kd = (e: KeyboardEvent) => this.key(e, true)
    const ku = (e: KeyboardEvent) => this.key(e, false)
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    window.addEventListener('blur', this.reset)
    this.disposers.push(
      () => window.removeEventListener('keydown', kd),
      () => window.removeEventListener('keyup', ku),
      () => window.removeEventListener('blur', this.reset),
    )

    const pd = (e: PointerEvent) => {
      // Klicks auf Buttons (HUD, Overlays) sollen die Figur nicht steuern
      const el = e.target as Element | null
      if (el && el.closest && el.closest('button, [data-noinput]')) return
      const r = this.target.getBoundingClientRect()
      const side: -1 | 1 = e.clientX < r.left + r.width / 2 ? -1 : 1
      this.pointers.set(e.pointerId, side)
      try {
        this.target.setPointerCapture(e.pointerId)
      } catch {
        /* nicht kritisch */
      }
      e.preventDefault()
    }
    const pu = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId)
    }
    this.target.addEventListener('pointerdown', pd)
    this.target.addEventListener('pointerup', pu)
    this.target.addEventListener('pointercancel', pu)
    this.target.addEventListener('lostpointercapture', pu)
    this.disposers.push(
      () => this.target.removeEventListener('pointerdown', pd),
      () => this.target.removeEventListener('pointerup', pu),
      () => this.target.removeEventListener('pointercancel', pu),
      () => this.target.removeEventListener('lostpointercapture', pu),
    )
  }

  private reset = (): void => {
    this.left = false
    this.right = false
    this.pointers.clear()
  }

  private key(e: KeyboardEvent, down: boolean): void {
    if (e.repeat && down) return
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.left = down
        e.preventDefault()
        break
      case 'ArrowRight':
      case 'KeyD':
        this.right = down
        e.preventDefault()
        break
      case 'KeyR':
        if (down && this.onRestart) this.onRestart()
        break
    }
  }

  get dir(): InputDir {
    let l = this.left
    let r = this.right
    for (const side of this.pointers.values()) {
      if (side < 0) l = true
      else r = true
    }
    return l === r ? 0 : l ? -1 : 1
  }

  dispose(): void {
    for (const d of this.disposers) d()
    this.disposers = []
    this.reset()
  }
}
