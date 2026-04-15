# Lernplattform — Projektkontext

## Was ist das?
Multi-Fach Lernplattform mit Spaced Repetition (FSRS-4.5), Active Recall und Interleaving. Aktuell ein Fach (Deutsch, Klasse 10, 132 Fragen). Beliebig erweiterbar.

## Architektur
- **Rein clientseitig** — statische Dateien, kein Backend
- **SQLite im Browser** via sql.js (CDN) + IndexedDB-Persistenz
- **ES Modules** — kein Build-Step, kein npm

### Dateistruktur
```
index.html              → App-Shell (minimal, lädt Module)
css/style.css           → Alle Styles
js/db.js                → SQLite-Wrapper, Schema, IndexedDB-Persistenz, Migration
js/fsrs.js              → FSRS-4.5 Algorithmus (Spacing)
js/engine.js            → Kern-Logik: Grading, Gewichtung, Interleaving, Queries
js/ui.js                → Alle Views + State-Objekt
js/app.js               → Entry-Point, window.APP API, Boot-Sequenz
subjects/_manifest.json → Liste aller Fächer
subjects/deutsch.json   → Fragen + Merkwissen
```

### Neues Fach hinzufuegen
1. `subjects/neuesfach.json` erstellen (Format wie deutsch.json)
2. In `subjects/_manifest.json` eintragen
3. Fertig — App laedt es automatisch

### Content-Format (subjects/*.json)
```json
{
  "id": "fachname",
  "name": "Anzeigename",
  "description": "Untertitel",
  "color": "#hexcode",
  "colorSoft": "#hexcode",
  "icon": "emoji",
  "version": 1,
  "topics": [{
    "id": "thema_id",
    "name": "Themenname",
    "desc": "Beschreibung",
    "color": "#hexcode",
    "colorSoft": "#hexcode",
    "merkwissen": [
      { "h": "Ueberschrift", "items": ["Punkt 1", "Punkt 2"] },
      { "tip": "Tipp-Text" }
    ],
    "questions": [{
      "q": "Fragetext (HTML erlaubt)",
      "opts": ["A", "B", "C", "D"],
      "correct": 0,
      "exp": "Erklaerung",
      "fill": {
        "prompt": "Lueckentext-Aufgabe",
        "answer": "richtige Antwort",
        "hint": "Hinweis",
        "accept": ["alternative1", "alternative2"],
        "caseSensitive": false
      }
    }]
  }]
}
```

## Lernwissenschaftliche Grundlagen
- **FSRS-4.5** (Ye 2024) statt SM-2 — Power-Vergessenskurve, ~30% effizienter
- **Active Recall** — MC-Fragen zeigen erst nur die Frage, Optionen nach Klick
- **Interleaving** — Themen mischen fuer bessere Unterscheidung (Rohrer 2015)
- **Dual-Process** — Sprint (System 1) + Lernen (System 2) nach Kahneman

## Workflow
- User gibt Material (PDF, Notizen, Fotos), Claude erstellt daraus das JSON
- Immer `git pull` vor dem Arbeiten, `git push` danach
- Lokaler Dev-Server zum Testen: `python3 -m http.server 8765` (oder `python -m http.server 8765` auf Windows)
- App oeffnen: http://localhost:8765

## User-Praeferenzen
- Sprache: Deutsch
- User gibt Material, Claude baut es ein
- Architektur soll sauber und erweiterbar sein
- Keine ueberfluessige Komplexitaet
- Wissenschaftliche Quellen dokumentieren
