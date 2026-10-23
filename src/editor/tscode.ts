import type { EntityData, LevelData } from '../sim'

/** "Mind the Spikes" -> "createMindTheSpikesLevel" */
export function levelFnName(title: string | undefined): string {
  const words = (title ?? '').match(/[A-Za-z0-9]+/g) ?? []
  const base = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('')
  return `create${base || 'Custom'}Level`
}

function entityCall(e: EntityData): string {
  switch (e.t) {
    case 'spawn':
      return `b.spawn(${e.x}, ${e.y})`
    case 'goal':
      return `b.goal(${e.x}, ${e.y})`
    case 'checkpoint':
      return `b.checkpoint(${e.x}, ${e.y})`
    case 'spring':
      return e.dir && e.dir !== 'u'
        ? `b.spring(${e.x}, ${e.y}, ${e.power}, '${e.dir}')`
        : `b.spring(${e.x}, ${e.y}, ${e.power})`
    case 'spikes':
      return `b.spikes(${e.x}, ${e.y}, '${e.dir}')`
    case 'laser':
      return `b.laser(${e.x}, ${e.y}, '${e.dir}', { period: ${e.period}, on: ${e.on}, phase: ${e.phase} })`
    case 'saw':
      return `b.saw(${e.x}, ${e.y}, '${e.axis}', ${e.len}, { period: ${e.period}, phase: ${e.phase} })`
    case 'mover':
      return `b.mover(${e.x}, ${e.y}, '${e.axis}', ${e.len}, { w: ${e.w}, period: ${e.period}, phase: ${e.phase} })`
    case 'hammer':
      return `b.hammer(${e.x}, ${e.y}, { len: ${e.len}, amp: ${e.amp}, period: ${e.period}, phase: ${e.phase} })`
  }
}

/**
 * Erzeugt eine TypeScript-Datei im Stil von src/levels/<schwierigkeit>/*.level.ts (LevelBuilder-Aufrufe),
 * die direkt ins Projekt kopiert werden kann.
 */
export function levelToTs(level: LevelData, fnName = levelFnName(level.title)): string {
  const lines: string[] = []
  lines.push(`import { LevelBuilder } from '../../sim/builder'`)
  lines.push(`import type { LevelData } from '../../sim/types'`)
  lines.push('')
  lines.push(`export function ${fnName}(): LevelData {`)
  lines.push(`  const b = new LevelBuilder('${level.size}', ${JSON.stringify(level.title ?? '')})`)
  lines.push('')

  lines.push('  // Blöcke')
  level.tiles.forEach((row, r) => {
    let c = 0
    while (c < row.length) {
      if (row[c] === '.') {
        c++
        continue
      }
      const ch = row[c]
      let end = c
      while (end + 1 < row.length && row[end + 1] === ch) end++
      lines.push(ch === '#' ? `  b.plat(${r}, ${c}, ${end})` : `  b.plat(${r}, ${c}, ${end}, '${ch}')`)
      c = end + 1
    }
  })

  lines.push('')
  lines.push('  // Objekte')
  const order = ['spawn', 'goal', 'checkpoint', 'spring', 'spikes', 'laser', 'hammer', 'saw', 'mover']
  const sorted = [...level.entities].sort(
    (a, b) => order.indexOf(a.t) - order.indexOf(b.t) || a.y - b.y || a.x - b.x,
  )
  for (const e of sorted) lines.push(`  ${entityCall(e)}`)

  lines.push('')
  lines.push('  return b.build()')
  lines.push('}')
  lines.push('')
  return lines.join('\n')
}
