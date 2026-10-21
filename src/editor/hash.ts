import type { LevelData } from '../sim'

/** FNV-1a (32 Bit) über den Inhalt eines Levels. Der Titel zählt nicht mit. */
export function levelHash(data: LevelData): string {
  const content = JSON.stringify({ v: data.v, size: data.size, tiles: data.tiles, entities: data.entities })
  let h = 0x811c9dc5
  for (let i = 0; i < content.length; i++) {
    h ^= content.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
