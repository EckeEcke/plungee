import { World, simulate, type CompiledLevel, type InputDir } from '../../src/sim'

export interface SolveOptions {
  /** Maximale Anzahl Zustände pro Zeitschicht */
  width?: number
  /** Ticks, die eine Eingabe pro Suchschritt gehalten wird */
  hold?: number
  maxTicks?: number
}

export interface Solution {
  inputs: Int8Array
  ticks: number
}

interface Node {
  world: World
  parent: Node | null
  action: InputDir
}

const ACTIONS: InputDir[] = [0, -1, 1]

/**
 * Breitensuche mit Schichten gleicher Zeit und Beam-Begrenzung.
 * Nur für Tests gedacht: findet eine tote-freie Lösung oder gibt null zurück.
 */
export function solve(level: CompiledLevel, opts: SolveOptions = {}): Solution | null {
  return search(level, opts, false) ?? search(level, opts, true)
}

/**
 * waypoints = true: Zwischenziele sind die Checkpoints von oben nach unten (nötig bei Umwegen,
 * z. B. wenn man mit einer Feder erst nach oben muss). Sonst zählt nur der Abstand zum Ziel.
 */
function search(level: CompiledLevel, opts: SolveOptions, waypoints: boolean): Solution | null {
  const width = opts.width ?? 2500
  const hold = opts.hold ?? 4
  const maxTicks = opts.maxTicks ?? 60 * 90

  const gx = level.goal.x + level.goal.w / 2
  const gy = level.goal.y + level.goal.h / 2

  let layer: Node[] = [{ world: new World(level), parent: null, action: 0 }]

  for (let t = 0; t < maxTicks; t += hold) {
    const seen = new Set<string>()
    const next: Node[] = []

    for (const node of layer) {
      for (const a of ACTIONS) {
        const w = node.world.clone()
        for (let k = 0; k < hold && !w.finished; k++) {
          w.step(a)
          if (w.p.dead) break
        }
        if (w.deaths > 0) continue
        const child: Node = { world: w, parent: node, action: a }
        if (w.finished) return reconstruct(level, child, hold)

        const p = w.p
        const key = [
          Math.round(p.x / 3),
          Math.round(p.y / 3),
          Math.round(p.vx / 40),
          Math.round(p.vy / 60),
          w.checkpointIndex,
          p.stun > 0 ? 1 : 0,
        ].join(',')
        if (seen.has(key)) continue
        seen.add(key)
        next.push(child)
      }
    }
    if (next.length === 0) return null

    const cps = [...level.checkpoints].sort((a, b) => a.row - b.row)
    const score = (n: Node) => {
      let tx = gx
      let ty = gy
      let stage = 0
      if (waypoints) {
        const active = n.world.checkpointIndex >= 0 ? level.checkpoints[n.world.checkpointIndex].row : -1
        stage = -active
        const nextCp = cps.find((c) => c.row > active)
        if (nextCp) {
          tx = nextCp.rect.x + nextCp.rect.w / 2
          ty = nextCp.rect.y + nextCp.rect.h / 2
        }
      }
      const dx = n.world.p.x - tx
      const dy = n.world.p.y - ty
      return stage * 1e7 + dx * dx + dy * dy
    }
    next.sort((a, b) => score(a) - score(b))
    layer = next.length > width ? next.slice(0, width) : next
  }
  return null
}

function reconstruct(level: CompiledLevel, last: Node, hold: number): Solution {
  const actions: InputDir[] = []
  for (let n: Node | null = last; n && n.parent; n = n.parent) actions.push(n.action)
  actions.reverse()
  const inputs = new Int8Array(actions.length * hold)
  actions.forEach((a, i) => inputs.fill(a, i * hold, (i + 1) * hold))
  // Das Ziel wird meist mitten in einem Halteschritt erreicht: auf die echte Zielzeit kürzen
  const ticks = simulate(level, inputs).ticks
  return { inputs: inputs.slice(0, ticks), ticks }
}
