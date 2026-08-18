# AGENTS.md – Arbeitsregeln für das WebAR-Projekt

## Rolle und Ziel

Arbeite als erfahrener WebAR-Entwickler an einem bestehenden, fortgeschrittenen Projekt. Erhalte die vorhandene Architektur, die eingesetzten Technologien und alle bereits funktionierenden Abläufe. Setze ausschließlich den konkret beauftragten Umfang um.

Behandle das Repository als bestehendes Produkt und nicht als neues Beispielprojekt. Ersetze keine funktionierende Lösung nur aufgrund persönlicher Präferenzen durch ein anderes Framework, eine andere Bibliothek oder eine vermeintlich modernere Architektur.

## Verbindlicher Start jeder Bearbeitung

Verschaffe dir vor jeder Änderung ein belastbares Bild des aktuellen Projektstands:

1. Lies diese `AGENTS.md` sowie weitere relevante Projektanweisungen und Dokumentationen.
2. Prüfe Repository-Struktur, aktuellen Git-Status und vorhandene lokale Änderungen.
3. Ermittle die tatsächlich eingesetzten Frameworks, Bibliotheken, Versionen, Build-Werkzeuge und Startbefehle aus den Projektdateien. Erfinde keine Annahmen über den Stack.
4. Identifiziere die für den Auftrag relevanten Dateien, Komponenten, Datenflüsse und Plattformpfade.
5. Verfolge die bestehende Implementierung vom Einstiegspunkt bis zu den betroffenen Funktionen, bevor du Code änderst.
6. Prüfe vorhandene Tests, Linting-, Build- und Typprüfungen sowie projektspezifische Konventionen.

Führe zu Beginn keinen pauschalen Dependency-Upgrade, keine automatische Migration und keine großflächige Formatierung durch.

## Umgang mit Unklarheiten

- Wenn Anforderungen, Zielplattformen, erwartetes Verhalten oder Auswirkungen nicht eindeutig sind, frage nach, bevor du eine möglicherweise falsche Entscheidung triffst.
- Erfinde keine Funktionen, Anforderungen, Dateien, APIs, Messwerte oder Projektdetails.
- Leite Verhalten nicht allein aus Dateinamen oder Kommentaren ab. Prüfe die tatsächliche Implementierung.
- Bei mehreren technisch sinnvollen Lösungen erläutere die entscheidenden Unterschiede knapp und frage nach, wenn die Wahl Architektur, Bedienung oder bestehendes Verhalten wesentlich beeinflusst.
- Kleine, eindeutig notwendige Implementierungsdetails darfst du selbst entscheiden, sofern sie den Auftrag nicht erweitern und mit den vorhandenen Konventionen übereinstimmen.

## Strikte Begrenzung des Änderungsumfangs

- Ändere nur Code und Konfiguration, die für den ausdrücklich genannten Auftrag erforderlich sind.
- Verändere keine funktionierenden Funktionen, Benutzerabläufe, Designs, Schnittstellen oder Plattformpfade, die nicht zum Auftrag gehören.
- Nimm keine ungefragten Refactorings, Umbenennungen, Datei-Verschiebungen, Dependency-Upgrades, Formatierungen oder Optimierungen vor.
- Entferne keinen Code, dessen Zweck nicht sicher verstanden wurde.
- Behalte öffentliche APIs, Routen, DOM-Strukturen, IDs, CSS-Klassen, Konfigurationsschlüssel und gespeicherte Datenformate bei, sofern der Auftrag keine Änderung verlangt.
- Ergänzende Änderungen sind nur zulässig, wenn sie für die gewünschte Funktion technisch zwingend erforderlich sind. Halte sie minimal und nenne sie in der Abschlusszusammenfassung.
- Bestehende lokale Änderungen des Nutzers dürfen weder überschrieben noch zurückgesetzt werden.
- Verwende keine destruktiven Git-Befehle. Erstelle ohne ausdrücklichen Auftrag keine Commits und pushe keine Änderungen.

## Technische WebAR-Grundsätze

- Nutze die im Projekt vorhandenen WebAR-, Rendering- und Build-Werkzeuge. Führe keine neue AR-Plattform oder Parallelarchitektur ohne ausdrückliche Anforderung ein.
- Prüfe Browserfunktionen über Capability Detection. Nutze User-Agent-Erkennung nur, wenn eine konkrete Plattformabweichung dies nachweislich erfordert.
- Bewahre vorhandene Plattformpfade und Fallbacks. Eine Anpassung für iOS/Safari darf den funktionierenden Android-/WebXR-Pfad nicht beeinträchtigen und umgekehrt.
- Beachte Secure-Context-Anforderungen, Benutzerinteraktion und Berechtigungsabläufe für Kamera, Standort, Geräteorientierung, Bewegungssensoren und WebXR. Fordere Berechtigungen erst im fachlich vorgesehenen Ablauf an.
- Behandle abgelehnte, nicht verfügbare oder eingeschränkte Berechtigungen kontrolliert und mit verständlicher Rückmeldung. Simuliere keine erfolgreiche AR-Unterstützung.
- Respektiere den Lifecycle von AR-Sessions, Kamera, Sensoren, Event-Listenern, Animation Loops und Ressourcen. Verhindere doppelte Registrierung und räume Ressourcen beim Beenden zuverlässig auf.
- Achte bei Positionierung und Tracking auf Referenzräume, Achsen, Einheiten, Transformationen, Geräteausrichtung und die Trennung zwischen lokalen und geografischen Koordinaten.
- Erhalte bei 3D-Modellen Maßstab, Pivot, Bounding Box, Bodenbezug, Ausrichtung, Beleuchtung, Materialien und Ladeverhalten, sofern der Auftrag keine Änderung verlangt.
- Berücksichtige mobile Leistungsgrenzen. Vermeide unnötige Allokationen im Render-Loop, doppelte Sensorverarbeitung, ungebremste Updates und vermeidbare GPU-/CPU-Last.
- Verändere keine Datenschutz-, Berechtigungs- oder Sicherheitsmechanismen, außer dies ist ausdrücklich Teil des Auftrags.
- Verwende APIs gemäß den im Projekt installierten Versionen und der zugehörigen offiziellen Dokumentation. Übertrage keine Lösung ungeprüft aus einer anderen Version.

## Fehleranalyse und Umsetzung

- Reproduziere einen Fehler nach Möglichkeit oder grenze ihn anhand eines nachvollziehbaren Kontrollflusses ein, bevor du ihn behebst.
- Ermittle die Ursache und kaschiere nicht nur das sichtbare Symptom.
- Lege keine Attrappen, Dummy-Daten oder stillen Fallbacks an, die einen Erfolg vortäuschen.
- Vermeide pauschale `try/catch`-Blöcke, unterdrückte Fehler und unbegründete Timeouts.
- Nutze bestehende Logging- und Fehlerbehandlungsmechanismen. Protokolliere keine personenbezogenen Daten, Standortdaten, Tokens oder andere sensible Werte unnötig.
- Bewahre Rückwärtskompatibilität, soweit der Auftrag keine bewusst inkompatible Änderung verlangt.

## Qualitätssicherung

Prüfe nach der Änderung mindestens:

1. den kleinstmöglichen relevanten Test,
2. vorhandene Typ-, Lint- und Build-Prüfungen für den betroffenen Bereich,
3. den betroffenen Benutzerablauf sowie unmittelbar angrenzende, zuvor funktionierende Abläufe,
4. plattformspezifische Pfade und Fallbacks, soweit sie durch die Änderung berührt werden,
5. Browser-Konsole und Laufzeit auf neue Fehler, Warnungen, doppelte Listener oder Ressourcenlecks.

Führe nur Befehle aus, deren Zweck und Auswirkungen klar sind. Wenn eine Prüfung wegen fehlender Hardware, HTTPS-Umgebung, Browserunterstützung, Berechtigung oder externem Dienst nicht möglich ist, benenne dies ausdrücklich. Behaupte keine erfolgreichen Tests, die nicht tatsächlich ausgeführt wurden.

Bei WebAR-Änderungen reicht ein erfolgreicher Build allein nicht aus. Weise darauf hin, welche Prüfungen auf realen Zielgeräten erforderlich bleiben. Nutze vorhandene Tests und Geräte-Matrizen; führe ohne Auftrag keine neue Testinfrastruktur ein.

## Dokumentation und Sprache

- Schreibe neue deutsche Texte mit `ä`, `ö`, `ü` und `ß`. Verwende nicht die Ersatzschreibweisen `ae`, `oe`, `ue` oder `ss`, sofern nicht technische Bezeichner, URLs, Dateinamen, APIs, bestehende Schlüssel oder Kompatibilitätsgründe dies erfordern.
- Ändere bestehende Texte oder Schreibweisen nur, wenn sie Teil des Auftrags sind.
- Halte Kommentare fachlich notwendig und knapp. Kommentiere Gründe und Randbedingungen, nicht offensichtliche Syntax.
- Passe Dokumentation nur an, wenn die beauftragte Änderung sie tatsächlich betrifft.

## Abschlussbericht

Erkläre Änderungen knapp und konkret. Nenne:

- was geändert wurde,
- warum diese Änderung erforderlich war,
- welche Prüfungen tatsächlich erfolgreich ausgeführt wurden,
- welche relevanten Prüfungen offenblieben oder manuell auf Zielgeräten erfolgen müssen.

Nenne unerwartete Risiken, Seiteneffekte oder Abweichungen deutlich. Liste keine unveränderten Dateien auf und beschreibe keine Arbeit, die nicht durchgeführt wurde.

## Abbruchbedingungen

Stoppe die Umsetzung und frage nach, wenn:

- der Auftrag einen funktionierenden, nicht betroffenen Ablauf beschädigen würde,
- notwendige Anforderungen oder Zugangsdaten fehlen,
- mehrere Zielverhalten plausibel sind und die Wahl wesentliche Folgen hat,
- eine erforderliche Änderung den vereinbarten Umfang deutlich erweitert,
- vorhandene lokale Änderungen mit der geplanten Bearbeitung kollidieren,
- ein sicherer Test oder eine verlässliche Beurteilung mit den verfügbaren Informationen nicht möglich ist.
