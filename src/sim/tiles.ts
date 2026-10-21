/**
 * Block-Typen. In LevelData.tiles steht je Zelle ein Zeichen:
 *  '.' leer   '#' Block   'I' Eis   '<' Band links   '>' Band rechts   'B' brüchig   '=' Einweg
 */
export const TILE_CHARS = ['#', 'I', '<', '>', 'B', '='] as const
export type TileChar = (typeof TILE_CHARS)[number]

/** Gültige Zeichen in einer Tile-Zeile */
export const TILE_LINE_RE = /[^.#I<>B=]/

// Numerische Codes im kompilierten Raster
export const K_EMPTY = 0
export const K_SOLID = 1
export const K_ICE = 2
export const K_BELT_L = 3
export const K_BELT_R = 4
export const K_BRITTLE = 5
export const K_ONEWAY = 6

export function kindOfChar(ch: string): number {
  switch (ch) {
    case '#':
      return K_SOLID
    case 'I':
      return K_ICE
    case '<':
      return K_BELT_L
    case '>':
      return K_BELT_R
    case 'B':
      return K_BRITTLE
    case '=':
      return K_ONEWAY
    default:
      return K_EMPTY
  }
}
