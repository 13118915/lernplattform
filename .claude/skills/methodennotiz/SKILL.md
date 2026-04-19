---
name: methodennotiz
description: Bei jedem neuen Fach oder inhaltlichen Update eines Fachs auf der Lernplattform eine fachspezifische didaktische Methoden-Notiz erzeugen und als methode-Feld ins Subject-JSON schreiben. Triggert automatisch, wenn an subjects/*.json oder neuem Material gearbeitet wird.
paths: subjects/*.json, subjects/_manifest.json, material/**/*
when_to_use: Sobald der User neues Lernmaterial liefert, ein neues Fach anlegt, ein bestehendes Fach inhaltlich ändert, oder explizit nach „Methoden-Notiz" / „Fachnote" fragt.
---

# Methoden-Notiz für Fächer der Lernplattform

Jedes Fach-JSON unter `subjects/` muss ein `methode`-Feld haben. Dieses Feld dokumentiert **fachspezifisch und nachvollziehbar**, warum das Material genau so aufbereitet wurde — es ist die „Fachnote" hinter dem `?`-Button im Home-View der App.

## Wann du aktiv werden musst

- Ein neues Fach wird angelegt → **Pflicht**, `methode` gleich mitschreiben.
- Ein bestehendes Fach bekommt neues Material oder wird inhaltlich signifikant geändert → `methode` prüfen und ggf. aktualisieren, `version` hochzählen.
- User fragt explizit nach Methodenbegründung → erzeugen oder aktualisieren.

## Was in die Methoden-Notiz gehört

Die Notiz ist HTML (wird direkt ins Modal eingefügt). Länge: ca. 4–8 kurze Absätze. Inhalt **immer**:

1. **„Warum so und nicht anders?"** — 1 Absatz, der die fachspezifische Kernentscheidung nennt (z. B. Kontextsätze vs. Paar-Assoziation, MC vs. Fill-Gewichtung, Regel-Erklärung vs. Beispielinduktion).
2. **Richtung / Abfragemodus** — falls relevant (Sprachen: LA→DE only? Richtungs-Toggle?).
3. **Distraktoren-Strategie** — handkuratiert / semantisch nah / random? Warum?
4. **Besondere Struktur-Entscheidungen** — Grammatik-Hinweise, Worked Examples, Schritt-für-Schritt-Aufgaben, je nachdem was das Fach braucht.
5. **Nutzungs-Tipp für den Lernenden** — kurz, praktisch, evidenzbasiert.
6. **`<div class="source">` mit 2–4 fachlichen Quellen** (Autor, Jahr, Titel). Domäne soll zum Fach passen: L2-Vokabel-Forschung für Sprachen, Cognitive Load / Worked Examples für Mathe, Retrieval Practice + Elaboration für Fakten-Fächer, Dual Coding für Anatomie/Bilder, usw.

## Ablauf bei neuem Material

1. **Recherche** (mit WebSearch / WebFetch): was sind die aktuellen (möglichst 2024–2026) Best Practices und Known Issues für Spaced Repetition + Active Recall **speziell in diesem Fach**? Stichworte nach Fachtyp variieren — z. B. „L2 vocabulary context sentences", „mathematics worked examples spaced retrieval", „medical anatomy mnemonic retrieval practice".
2. **Schema-Check**: Reicht das Standard-Format (MC + optional fill) oder müssen `engine.js` / `ui.js` erweitert werden? Falls Erweiterung: **erst Vorschlag an den User, dann bauen** — nicht einseitig Content produzieren, der die Renderer überfordert.
3. **Plan kurz mit dem User abstimmen** (2–3 Sätze), **dann** Material verarbeiten und gleichzeitig die Methoden-Notiz erzeugen.
4. Nach Änderung: `version` des Subjects hochzählen (sonst übernimmt der Client die Änderung nicht, siehe `loadSubjectData` in `js/db.js`).
5. Direkt committen und pushen — der User prüft online (iPhone / Browser, GitHub Pages).

## Form-Anforderungen an das methode-Feld

- Ein einziger JSON-String, **HTML erlaubt**.
- Innerhalb: `<p>`, `<b>`, `<em>`, `<i>`, `<br>`, und am Ende ein `<div class="source">…</div>` für die Quellen.
- Keine externen `<script>` / `<iframe>` / `<img>`. Nur semantisches Markup.
- Deutsch.
- Keine Emojis (User-Vorgabe für Code/Files, sofern nicht explizit gewünscht).
- JSON-Quoting beachten: Anführungszeichen innerhalb des Strings als `\"` escapen; für typografische deutsche Anführungszeichen „…“ keine Escape nötig, aber mischen vermeiden.

## Was **nicht** in die Notiz gehört

- Generische Binsen über Spacing / FSRS / Active Recall — das steht schon im allgemeinen Teil des Modals. Die Fach-Notiz ergänzt **nur** das, was an diesem Fach spezifisch ist.
- Entschuldigungen („dies ist nur ein erster Wurf", „könnte noch besser sein"). Stattdessen klar sagen, warum die Entscheidung so getroffen wurde.
- Roadmap-Ankündigungen („in Zukunft wollen wir…"). Nur den aktuellen Stand beschreiben.

## Referenz: bestehende Notizen als Stil-Vorlage

- `subjects/latein.json` → methode-Feld zu Latein Lektion 12 (Kontextsätze, Distraktoren, Richtung)
- `subjects/deutsch.json` → methode-Feld zu Deutsch (Regelanwendung, Advance Organizer, Cognitive Load)

Neue Notizen sollen vom Stil her zu diesen beiden passen.
