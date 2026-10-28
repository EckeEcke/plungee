/**
 * Einfacher Filter für öffentliche Namen (Anzeigename, Autor, Leveltitel). Gleicher Code im Browser (Hinweis beim
 * Tippen) und auf dem Server (Durchsetzung, der Browser lässt sich umgehen).
 *
 * Er fängt die offensichtlichen Fälle, auch mit Zahlen statt Buchstaben (sch31sse), Wiederholungen (fuuuck) und
 * Trennzeichen (f.u.c.k). Er ist keine Garantie: Was durchrutscht, löscht man im Admin (Zeiten und Level).
 * Eigene Wörter ergänzt der Server über die Umgebungsvariable BLOCKED_WORDS (kommagetrennt).
 *
 * Kurze oder mehrdeutige Wörter ("arsch", "cock", "nazi") zählen nur als ganzes Wort, damit Namen wie
 * "Marschall", "Peacock" oder "Nazir" durchgehen (Scunthorpe-Problem).
 */

/** Wenn ein Wort dieses Stück enthält, ist der Name gesperrt */
const CONTAINS = [
  // Englisch
  'fuck', 'shit', 'cunt', 'bitch', 'whore', 'slut', 'nigger', 'nigga', 'faggot', 'retard', 'pussy', 'wanker',
  'bastard', 'asshole', 'dickhead', 'blowjob', 'handjob', 'cumshot', 'rapist', 'pedoph', 'paedoph', 'porn', 'dildo', 'motherfuck', 'cocksuck',
  // Deutsch
  'scheiss', 'fotze', 'votze', 'hurensohn', 'wichs', 'arschloch', 'schlampe', 'ficken', 'ficker', 'schwuchtel',
  'kanake', 'sperma', 'titten', 'neger', 'zigeuner', 'vergewaltig', 'drecksau', 'missgeburt', 'pisser', 'spasti',
  // Rechtsextrem
  'hitler', 'nsdap', 'hakenkreuz', 'auschwitz', 'judensau', 'neonazi',
]

/** Nur als ganzes Wort gesperrt */
const EXACT = [
  'ass', 'arse', 'arsch', 'dick', 'cock', 'cum', 'tit', 'tits', 'rape', 'nazi', 'nazis', 'hure', 'wixer', 'mongo',
  'fick', 'kacke', 'sex', 'pedo', 'paedo', 'nutte', 'nutten', 'twat', 'fag', 'pimmel', 'schwanz', 'piss', 'kack',
]

/** Auch über Wortgrenzen hinweg gesperrt ("Sieg Heil") */
const JOINED = ['siegheil', 'heilhitler', 'whitepower', 'nigger']

/** Bekannte Fehlalarme: diese Wörter dürfen trotz eines gesperrten Wortteils vorkommen */
const ALLOWED = new Set(['scunthorpe', 'shiitake', 'shitake', 'nutter', 'torpedo'])

/** Namen, die nach Betreiber oder Offiziellem aussehen */
const RESERVED = ['admin', 'administrator', 'moderator', 'mod', 'plungee', 'official', 'support', 'system', 'staff']

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i', '+': 't', '|': 'i' }

const collapse = (s: string): string => s.replace(/(.)\1+/g, '$1')

/** Wörter für den Vergleich: klein, ohne Akzente, Zahlen als Buchstaben, Wiederholungen zusammengezogen */
function words(text: string): string[] {
  const t = text
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[013457@$!+|]/g, (c) => LEET[c] ?? c)
  const out: string[] = []
  let run = ''
  for (const tok of t.split(/[^a-z]+/).filter(Boolean)) {
    // "f u c k" und "f.u.c.k": einzelne Buchstaben in Folge gehören zusammen
    if (tok.length === 1) run += tok
    else {
      if (run) out.push(run)
      run = ''
      out.push(tok)
    }
  }
  if (run) out.push(run)
  return out.map(collapse)
}

const prep = (list: string[]): string[] => list.map((w) => collapse(words(w).join('')))

const CONTAINS_C = prep(CONTAINS)
const EXACT_C = new Set(prep(EXACT))
const JOINED_C = prep(JOINED)
const RESERVED_C = new Set(prep(RESERVED))
const ALLOWED_C = new Set(prep([...ALLOWED]))

/** Darf dieser Text öffentlich als Name oder Titel erscheinen? `extra` sind zusätzliche gesperrte Wörter. */
export function isNameAllowed(text: string, extra: readonly string[] = []): boolean {
  const toks = words(text)
  const joined = toks.join('')
  if (joined === '') return true
  if (RESERVED_C.has(joined)) return false
  // "kkk" würde beim Zusammenfassen von Doppelbuchstaben zu "k", deshalb vorher prüfen
  if (/k\s*k\s*k/i.test(text)) return false
  if (JOINED_C.some((w) => joined.includes(w))) return false
  const more = prep([...extra])
  for (const t of toks) {
    if (EXACT_C.has(t)) return false
    if (ALLOWED_C.has(t)) continue
    if (CONTAINS_C.some((w) => t.includes(w))) return false
    if (more.some((w) => w !== '' && t.includes(w))) return false
  }
  return true
}

/** Hinweistext für die Oberfläche, oder null, wenn der Name in Ordnung ist */
export function nameProblem(text: string): string | null {
  return isNameAllowed(text) ? null : 'This name is not allowed.'
}
