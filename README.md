# Plungee

Vertikaler Zeitrennen-Plattformer: Du kannst nur nach links, rechts und fallen. Springen geht nur über Federn.
Vue 3 + TypeScript + Vite, Rendering per Canvas 2D, Physik komplett selbst geschrieben.

## Befehle

```bash
npm install
npm run dev        # Entwicklungsserver
npm test           # Simulations-Tests (Vitest)
npm run typecheck  # vue-tsc
npm run build      # Typecheck + Produktions-Build nach dist/
```

Steuerung: Pfeiltasten oder A/D, auf Touch die linke bzw. rechte Bildschirmhälfte halten, R = Neustart.

## Aufbau

```
src/sim/        Deterministische Simulation, kein DOM, keine Vue-Abhängigkeit
  constants.ts    alle Tuning-Werte (Geschwindigkeit, Schwerkraft, Federn, Hammer, ...)
  mathx.ts        Sinus-Tabelle nur mit + - * /, damit Replays überall bitgleich laufen
  level.ts        LevelData validieren und kompilieren
  hazards.ts      Hammer-Pose und Laser-Takt als reine Funktionen der Zeit
  world.ts        Fixed-Timestep-Schritt: Bewegung, Tile-Kollision, Federn, Gefahren, Checkpoints
  replay.ts       Eingaben kodieren (z. B. "N30R12L5") und mit simulate() nachspielen
  builder.ts      Hilfsklasse zum Bauen von Levels im Code
src/game/       Optik und Eingabe: Renderer, Themes, Partikel, Input, Game-Schleife
src/components/ Vue-Oberfläche (HUD, Countdown, Ergebnis)
src/levels/     Demo-Level
tests/          Simulationstests inkl. Such-Bot, der das Demo-Level automatisch löst
```

## Wichtige Entscheidungen

- **Fester Takt (60 Hz)**, Rendering interpoliert. Die Zeit eines Laufs ist eine ganze Zahl von Ticks.
- **Hammer und Laser sind Funktionen des Ticks**, kein gespeicherter Zustand. Jeder Spieler sieht dieselbe Bewegung.
- **Replay = Eingabe pro Tick.** `simulate(level, inputs)` liefert auf Client und Server dasselbe Ergebnis,
  so lassen sich Bestzeiten später serverseitig prüfen.
- **Level-Format:** 16 Tiles breit, Höhe 40 / 80 / 140 Zeilen (kurz / mittel / lang), Tiles als Textzeilen
  (`#` fest, `.` leer) plus Objektliste. Siehe `src/sim/types.ts`.
- **Themes sind nur Farbtabellen** (`src/game/theme.ts`), die Farbrollen bleiben gleich: Gefahr ist immer rot/orange.

## Nächste Schritte

1. Level-Editor (Raster, Objektpalette, Undo, Pflicht-Selbsttest vor dem Veröffentlichen)
2. Devvit-Anbindung: Level und Bestzeiten in Redis, Post pro Level, Replay-Validierung auf dem Server
3. Ghost der Bestzeit, Daily-Level, Sound per Web Audio

## Editor

Im Menü über **Level bauen** erreichbar. Aufbau:

- `src/editor/doc.ts` – reines Dokument (Regeln, Undo/Redo mit Strich-Gruppierung), ohne UI testbar
- `src/editor/controller.ts` + `overlay.ts` – Canvas, Zeigereingabe (Touch/Maus), Raster, Hammer-Bögen, Minimap
- `src/editor/share.ts` – Export/Import als JSON inklusive Lösungslauf; `storage.ts` – Entwurf im localStorage
- `src/components/EditorView.vue` – Oberfläche (Werkzeugleiste, Parameter-Panel, Menü, Testlauf)

Regeln: Ein Level ist erst teilbar, wenn es gültig ist **und** der Ersteller es selbst bis ins Ziel gespielt hat
(Lauf wird per `verifyRun` geprüft und an den Level-Hash gebunden; jede Änderung macht den Test ungültig).
Kürzel: Strg/Cmd+Z Rückgängig, Umschalt+Strg+Z / Strg+Y Wiederholen, Entf löscht Auswahl, Esc hebt Auswahl auf.
Hinweis: Die Editor-Oberfläche wurde bisher nicht in einem echten Browser getestet.

## Eigene Level

Jede Datei `src/levels/<easy|normal|hard>/*.level.ts` wird automatisch gefunden, validiert und in der Kampagne gelistet.
Der **Ordner** bestimmt den Schwierigkeitsgrad (Leicht, Normal, Schwer), der **Dateiname** die Reihenfolge darin
(Nummern voranstellen, z. B. `easy/03-mein-level.level.ts`). Die Datei exportiert eine Funktion, die ein `LevelData` liefert.
Ein neuer Schwierigkeitsgrad braucht einen Eintrag in `DIFFICULTIES` in `src/levels/index.ts`.
Im lokalen Dev-Modus exportiert der Editor Level direkt als `.level.ts` (Menü → Teilen). Ungültige Dateien werden übersprungen
und in der Konsole gemeldet; die Tests prüfen, dass jedes Level lösbar ist. Fortschritt und Bestzeiten hängen am Schlüssel
`<ordner>/<dateiname>`: Ein Level zu verschieben oder umzubenennen setzt seinen Fortschritt zurück.

## Kampagne und Medaillen

Hauptmenü → **Kampagne** zeigt die Level des gewählten Schwierigkeitsgrads als Raster (oben mit ◀ ▶ umschalten). Geschaffte Level sind grün, mit Medaille und Bestzeit.
Fortschritt liegt im localStorage (`plunge:progress:v1`).

- **Richtzeit (par):** Der Solver berechnet pro Level eine Bestzeit und legt sie in `src/levels/par.json` ab.
  Neue oder geänderte Level werden beim nächsten `npm test` bzw. `npm run par` automatisch nachgezogen (Hash-Vergleich).
  Ohne Richtzeit gibt es nur Gold (ohne Tod) und Bronze.
- **Medaillen** (`src/game/medals.ts`): Gold = ohne Tod und ≤ par × 1,6; Silber = ≤ par × 2,4 (Tode erlaubt); Bronze = Ziel erreicht.
  Beide Faktoren stehen als Konstanten oben in der Datei.

## Block-Typen und Seitenfeder

Das Werkzeug **Block** malt mehrere Typen (Auswahl im Parameter-Panel). In `LevelData.tiles` steht je Zelle ein Zeichen:
`.` leer, `#` Block, `I` Eis, `<` / `>` Förderband, `B` brüchig, `=` Einweg (siehe `src/sim/tiles.ts`).
Im Builder: `b.plat(row, c0, c1, 'I')`. Die Konstanten (Eis-Reibung, Bandtempo, Bruchzeiten, Seitenfeder-Kraft) stehen in `src/sim/constants.ts`.
Federn haben optional `dir` (`'u'` Standard, `'l'`, `'r'`): `b.spring(col, row, power, 'r')`. Seitenfedern sitzen an einer Wand,
die Basis zeigt zur Wand.
