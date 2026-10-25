// Schreibt die Kampagnen-Level nach netlify/generated/campaign.json, damit die Netlify Function
// (die kein import.meta.glob kennt) für die Weekly Challenge darauf zugreifen kann.
// Läuft automatisch vor "npm run build" (prebuild) und von Hand mit "npm run campaign".
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'vite'

const server = await createServer({ appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' })
try {
  const { LEVELS } = await server.ssrLoadModule('/src/levels/index.ts')
  const out = LEVELS.map((l) => ({ key: l.key, difficulty: l.difficulty, title: l.title, data: l.data }))
  const dir = new URL('../netlify/generated/', import.meta.url)
  mkdirSync(dir, { recursive: true })
  writeFileSync(new URL('campaign.json', dir), JSON.stringify(out))
  console.log(`campaign.json: ${out.length} Level`)
} finally {
  await server.close()
}
