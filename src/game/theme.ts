/**
 * Ein Theme ist nur eine Farbtabelle. Die Farbrollen bleiben in jedem Theme gleich:
 * solide = ruhig, Gefahr = immer rot/orange, Hilfe = kühl/gelb, Spieler = hell und auffällig.
 */
export interface Theme {
  id: string
  name: string
  bgTop: string
  bgBottom: string
  /** Fläche neben dem Spielfeld (breite Bildschirme) und deren Rahmenlinie */
  surround: string
  frame: string
  decor: string[]
  decorAlpha: number
  solid: string
  solidTop: string
  solidShade: string
  /** Eis, brüchige Plattform */
  ice: string
  iceTop: string
  iceShade: string
  brittle: string
  brittleTop: string
  brittleShade: string
  danger: string
  dangerDark: string
  help: string
  help2: string
  goal: string
  player: string
  playerShade: string
  outline: string
  eyeWhite: string
  pupil: string
  /** line: Rahmen auf Panels und Hintergründen. Im dunklen Theme ist --outline fast so dunkel wie das Panel, dort braucht es eine helle Linie. */
  ui: { panel: string; text: string; accent: string; muted: string; line: string }
}

/** Memphis, hell: Creme-Hintergrund, Primärfarben-Konfetti (80er) */
export const MEMPHIS_LIGHT: Theme = {
  id: 'memphis-light',
  name: 'Memphis hell',
  bgTop: '#FFF4E0',
  bgBottom: '#FFE4F0',
  surround: '#1E1647',
  frame: '#FFD23F',
  decor: ['#3A86FF', '#FFD23F', '#FF5FA2', '#1FD1C5'],
  decorAlpha: 0.32,
  solid: '#3A2E7A',
  solidTop: '#6C5CE7',
  solidShade: '#2A2060',
  ice: '#5BC8EC',
  iceTop: '#D8F6FF',
  iceShade: '#2E96BD',
  brittle: '#B8693A',
  brittleTop: '#E8A46A',
  brittleShade: '#7C4222',
  danger: '#FF3B30',
  dangerDark: '#B3160F',
  help: '#1FD1C5',
  help2: '#FFC400',
  goal: '#FFB800',
  player: '#FF5FA2',
  playerShade: '#D93A82',
  outline: '#1E1647',
  eyeWhite: '#FFFFFF',
  pupil: '#1E1647',
  ui: { panel: 'rgba(58, 46, 122, 0.92)', text: '#FFF4E0', accent: '#FFD23F', muted: '#C9BFF5', line: '#1E1647' },
}

/** Memphis, dunkel: Türkis, Magenta, Gelb auf Nachtblau (90er) */
export const MEMPHIS_DARK: Theme = {
  id: 'memphis-dark',
  name: 'Memphis dunkel',
  bgTop: '#140B2E',
  bgBottom: '#2B1056',
  surround: '#05030F',
  frame: '#FF3EC8',
  decor: ['#00E5FF', '#FF3EC8', '#FFE14D', '#7B5CFF'],
  decorAlpha: 0.34,
  solid: '#4A2C8A',
  solidTop: '#8A6BFF',
  solidShade: '#341C66',
  ice: '#3F9FD0',
  iceTop: '#BDEBFF',
  iceShade: '#276F99',
  brittle: '#A8623A',
  brittleTop: '#E6A06E',
  brittleShade: '#6E3D22',
  danger: '#FF5A36',
  dangerDark: '#B8310F',
  help: '#00F0FF',
  help2: '#FFE14D',
  goal: '#FFE14D',
  player: '#FF4FD8',
  playerShade: '#C128A0',
  outline: '#0B0620',
  eyeWhite: '#FFFFFF',
  pupil: '#0B0620',
  ui: { panel: 'rgba(8, 4, 28, 0.82)', text: '#FFFFFF', accent: '#FFE14D', muted: '#B9A8F0', line: 'rgba(185, 168, 240, 0.55)' },
}

export const THEMES: Theme[] = [MEMPHIS_LIGHT, MEMPHIS_DARK]

export function themeById(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? MEMPHIS_LIGHT
}
