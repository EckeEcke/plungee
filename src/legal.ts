/**
 * Angaben für die Datenschutzerklärung (bewusst nur Name und E-Mail, kein Impressum). HIER EINTRAGEN.
 * Alles, was noch in eckigen Klammern steht, gilt als Platzhalter: Im Entwicklungsmodus (npm run dev) zeigt die Seite
 * dann einen gelben Hinweis, im fertigen Build bleibt er aus. Nichts davon ist Rechtsberatung.
 */
export const LEGAL = {
  /** Name des Verantwortlichen */
  name: 'Christian Eckardt',
  /** Eine E-Mail-Adresse, die du wirklich liest (am besten eine eigene für das Spiel) */
  email: 'ceckardt254@gmail.com',
  /** Die für dich zuständige Datenschutz-Aufsichtsbehörde (Landesdatenschutzbeauftragte/r deines Bundeslands) */
  authority: '[Competent data protection authority, with address]',
  /** Region der Upstash-Datenbank (steht in der Upstash-Konsole, z. B. "Frankfurt, Deutschland (eu-central-1)") */
  databaseRegion: '[Upstash database region, e.g. Frankfurt, Germany (eu-central-1)]',
  /** Stand der Texte */
  updated: '28 October 2026',
}

/** Alle Felder, die noch wie Platzhalter aussehen (beginnen mit "[") */
export function legalPlaceholders(l: Record<string, string> = LEGAL): string[] {
  return Object.entries(l)
    .filter(([, v]) => v.trim().startsWith('['))
    .map(([k]) => k)
}

/** Soll beim Start die Datenschutzseite offen sein? /privacy, /datenschutz oder ?privacy */
export function privacyFromUrl(pathname: string, params: URLSearchParams): boolean {
  const p = pathname.replace(/\/+$/, '').toLowerCase()
  return p === '/privacy' || p === '/datenschutz' || params.has('privacy')
}