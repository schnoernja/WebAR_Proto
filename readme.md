# WebAR_Proto

**Live-Demo:**
https://webar.duckdns.org/

## Entwicklung & Selbst-Hosting

### Voraussetzungen
- Node.js 20 oder neuer für lokale Entwicklung und Produktions-Build.
- Docker und Docker Compose für den WebAR-Produktionscontainer.

### Frontend lokal entwickeln

```powershell
cd frontend
npm run dev
```

Das Frontend ist anschließend unter http://127.0.0.1:5173 erreichbar. Dieser schnelle
Entwicklungsweg benötigt keinen Docker-Image-Rebuild.

### Produktions-Build

```powershell
cd frontend
npm run build
npm run check:dist
npm run preview
```

`npm run build` erzeugt `dist/` bei jedem Lauf vollständig neu. Der Build übernimmt nur
die explizit freigegebenen Laufzeitdateien und die von den Site-Konfigurationen referenzierten
Assets. `dist/` ist ein nicht versioniertes Build-Artefakt und darf nicht manuell bearbeitet
werden. `npm run preview` stellt den Build unter http://127.0.0.1:4173 bereit.

Three.js wird in der bereits verwendeten Version `0.172.0` über `npm ci` installiert.
`npm run dev`, `npm test` und `npm run build` erzeugen die benötigten lokalen Browsermodule
unter `frontend/vendor/three/` automatisch; dieser generierte Ordner darf nicht manuell bearbeitet werden.

Bearbeitbare Modell-, Design- und Referenzquellen sowie nicht veröffentlichte
Zwischenstände liegen unter `source-assets/`. Aktive Browser-Assets verbleiben unter
`frontend/assets/` und `frontend/models/`.

Die GitHub-Pages-Pipeline führt dieselben Installations-, Test-, Build- und Prüfbefehle aus
und veröffentlicht ausschließlich `dist/` als Pages-Artefakt. Dieses Build-Artefakt kann
später auch von einem separaten Deployment-Job für einen externen Server verwendet werden.

### Docker-Produktion

```powershell
docker compose up -d --build webar_proto
```

Das Produktionsimage wird in einer separaten Build-Stage aus dem Lockfile erzeugt. Die
Runtime-Stage enthält ausschließlich Nginx, dessen Konfiguration und den geprüften
`dist/`-Inhalt. Das Frontend ist anschließend unter http://localhost:8080 erreichbar.

Das erzeugte Image kann ohne projektspezifische Serveradresse auch direkt gestartet werden:

```powershell
docker run --rm -p 8080:80 epartwin-webar:production
```

### Hinweise
- Für die schnelle lokale Frontend-Entwicklung weiterhin `npm run dev` verwenden. Änderungen
  werden dort ohne Docker-Image-Rebuild sichtbar.
- Nginx liefert im Container HTTP auf Port 80 aus. Für Kamera, Standort und WebAR muss ein
  externer Server HTTPS terminieren; lokale Browser akzeptieren dafür weiterhin `localhost`.
- Lokale `cert.pem`- und `key.pem`-Dateien sind nicht in die bestehende Konfiguration eingebunden,
  werden ignoriert und weder in den Docker-Build-Kontext noch in das Image übernommen.

## Aktueller Funktionsstand (Kurzfassung)

### Bestehende Funktionen
- Markerlose WebXR-AR mit `immersive-ar`, `local-floor` und Hit-Test.
- Freie Platzierung eines 3D-Objekts auf einer stabilisierten Boden- oder Tischflaeche.
- Koordinatenmodus mit Eingabe von Latitude und Longitude fuer eine lokale Geo-Platzierung.
- Fallback-3D-Ansicht ausserhalb einer AR-Session.
- DOM-Overlay fuer Bedienung waehrend laufender AR-Session.
- Geolocation-Anbindung fuer Geraetestandort und Geo-Ursprung.
- Geo-Debug-Ausgabe fuer Ursprung, Ziel, Deltas, Distanz und Placement-Zustand.

### Neue/funktionierende Aenderungen
- Die UI ist in einzelne Kacheln mit eigenem Auf-/Zuklappzustand unterteilt.
- Jede Kachel besitzt einen eigenen `+/-`-Schalter im Header.
- Ein Floating-Menue oben rechts steuert sichtbare Bereiche fuer Platzierung, Entwickler und Hilfe.
- Die Hilfskachel wird beim Laden automatisch angezeigt und kann spaeter ueber das Menue erneut geoeffnet werden.
- `Geo Debug` ist standardmaessig verborgen und nur ueber den Entwickler-Bereich sichtbar.
- Die Overlay-UI bleibt auch im AR-Modus bedienbar.

### Aktueller Funktionsstand
- WebXR wird direkt im Frontend ueber `frontend/webxr.js` und die Module in `frontend/ar/` gestartet.
- Die freie Platzierung nutzt Hit-Test + Pose-Stabilisierung + Placement-Lock.
- Der Koordinatenmodus rechnet Zielkoordinaten lokal in ein X/Z-Offset im aktuellen AR-Raum um.
- Die Y-Hoehe des Geo-Objekts kommt weiterhin von der stabilen Hit-Test-Flaeche.
- Ein lokaler Heading-Wert aus der Device Orientation API kann fuer die Geo-Ausrichtung verwendet werden.

## Benutzeroberflaeche (UI)

### Kachel-System
- Die Bedienoberflaeche besteht aus einzelnen Kacheln statt aus einem einzigen langen Panel.
- Jede Kachel kann separat ein- und ausgeklappt werden.
- Der Zustand wird pro Kachel im `UIController` gehalten.
- Das Auf- und Zuklappen erfolgt nur ueber den `+/-`-Schalter oben rechts im Kachel-Header.

### Menue oben rechts
- Ein Floating-Menue oben rechts ist dauerhaft sichtbar.
- Das Menue hat drei Bereiche:
  - `Platzierung`
  - `Entwickler`
  - `Hilfe`
- Im Bereich `Platzierung` lassen sich Hauptkacheln ein- und ausblenden.
- Im Bereich `Entwickler` kann `Geo Debug` eingeblendet werden.
- Im Bereich `Hilfe` kann die Hilfskachel erneut geoeffnet werden.

### Sichtbarkeit im AR-Modus
- Das Menue bleibt auch waehrend einer laufenden AR-Session sichtbar.
- Die UI wird ueber WebXR DOM Overlay ueber dem AR-Canvas gehalten.
- Die Event-Isolation im `UIController` verhindert, dass Touch-Interaktionen ungewollt an den Canvas durchgereicht werden.

### Hilfskachel
- Beim ersten Laden der App sind `Objektplatzierung`, `Geolocation` und `Hilfe` sichtbar.
- Die Hilfskachel enthaelt eine kurze Einfuehrung fuer Start, Flaechenerkennung und die beiden Platzierungsmodi.
- Sie kann ueber den `X`-Button geschlossen und spaeter ueber das Menue wieder angezeigt werden.

### Scrollbarkeit
- Das HUD ist auf mobilen Geraeten scrollbar.
- Die maximale Hoehe ist auf `80vh` begrenzt.
- Die UI bleibt damit auch bei kleinen Displays und geoeffneter Tastatur bedienbar.

## Bedienung

### Start
1. App im Browser oeffnen.
2. Die sichtbare Hilfskachel lesen oder ueber `X` schliessen.
3. Optional ueber `Standort aktivieren` die Geolocation freigeben.

### Freier Modus
1. `AR starten` druecken.
2. Das Geraet langsam ueber Boden oder Tisch bewegen.
3. Sobald eine stabile Flaeche erkannt wurde, erscheint das Reticle stabil auf der Flaeche.
4. Objekt per `Objekt setzen` oder per XR-Select platzieren.
5. Nach der Platzierung bleibt das Objekt fixiert, bis `Neu platzieren` verwendet wird.

### Koordinatenmodus
1. Ueber `Modus und Geo-Ziel` auf `Koordinaten` wechseln.
2. Latitude und Longitude eingeben oder aktuelle Geraetekoordinaten uebernehmen.
3. `Koordinaten uebernehmen` druecken.
4. AR starten oder bei laufender Session auf stabile Flaeche warten.
5. Wenn Geraetestandort, Heading und stabile Flaeche verfuegbar sind, wird das Objekt lokal berechnet und gesetzt.
6. Die Platzierung erfolgt nur, wenn die Geo-Berechnung gueltig ist und das Ziel innerhalb des erlaubten Umkreises liegt.

### Menue
1. Menue oben rechts oeffnen.
2. Unter `Platzierung` einzelne Kacheln ein- oder ausblenden.
3. Unter `Entwickler` `Geo Debug` anzeigen oder verbergen.
4. Unter `Hilfe` die Hilfskachel erneut oeffnen.

## Technologien

### Frontend
- JavaScript (ES Modules)
- HTML
- CSS
- Three.js
- WebXR `immersive-ar`
- WebXR Hit-Test
- WebXR DOM Overlay
- Geolocation API
- Device Orientation API fuer Heading-Erfassung

### Rendering / 3D
- `THREE.WebGLRenderer`
- `GLTFLoader`
- `OrbitControls` fuer die Fallback-Ansicht

### Infrastruktur
- Docker
- Docker Compose
- nginx fuer das statische Frontend

## Architektur

### Einstieg
- `frontend/webxr.js`
- Erstellt `ARApp`, initialisiert die Anwendung und gibt Ressourcen beim Unload frei.

### Zentrale Module
- `SceneManager`
  - Erstellt Three.js-Szene, Kamera, Renderer und Fallback-Buehne.
  - Laedt das GLB-Modell oder ein Fallback-Modell.
- `ARSessionManager`
  - Prueft WebXR-Support.
  - Startet und beendet die `immersive-ar`-Session.
  - Bindet optional das DOM Overlay an `#hud`.
- `HitTestManager`
  - Holt pro Frame eine Rohpose fuer erkannte Flaechen.
- `PoseStabilizer`
  - Glattet Rohposen und gibt erst nach mehreren stabilen Frames eine belastbare Pose frei.
- `PlacementController`
  - Verwaltet freien Modus, Koordinatenmodus, Reticle, Geo-Ursprung, Geo-Ziel und Placement-Lock.
- `GeoLocationService`
  - Verwaltet Permission-Status, Initialabfrage und `watchPosition`.
  - Liefert Latitude, Longitude und Accuracy fuer die UI und den Geo-Ursprung.
- `HeadingService`
  - Liest `deviceorientationabsolute` bzw. `deviceorientation`.
  - Stellt einen Heading-Wert fuer die lokale Geo-Ausrichtung bereit.
- `UIController`
  - Bindet die DOM-Elemente.
  - Verwaltet Kachel-Sichtbarkeit, Kachel-Kollaps, Menue-Tabs, Hilfskachel und Debug-Ansichten.
  - Spiegelt Status, Hinweise und Geo-Daten in die UI.

### Kachel-System und Entwickler-Panel
- Jede UI-Kachel besitzt einen eigenen Sichtbarkeits- und Kollapszustand.
- `Geo Debug` ist kein permanenter Hauptbereich mehr, sondern ein optionales Entwickler-Panel.
- Die Sichtbarkeit wird rein zustandsbasiert im DOM gesteuert, ohne Re-Rendering pro Frame.

## AR-Funktionsweise

### Session Start
- `ARApp` startet ueber `ARSessionManager` eine `immersive-ar`-Session.
- Angefordert werden `local-floor` und `hit-test`.
- Falls verfuegbar, wird `dom-overlay` mit dem HUD als Root verwendet.

### Hit-Test und Stabilisierung
- `HitTestManager` liefert pro Frame eine potenzielle Flaechenpose.
- `PoseStabilizer` glattet diese Rohdaten ueber mehrere Frames.
- Erst wenn die Flaeche stabil ist, wird freie oder Geo-Platzierung zugelassen.

### Freie Platzierung
- Im freien Modus wird die stabile Pose direkt fuer das Objekt verwendet.
- Danach wird das Objekt gelockt und nur ueber `Neu platzieren` wieder freigegeben.

## Koordinatenmodus

### Grundprinzip
- Der Koordinatenmodus ist eine lokale Geo-Approximation und kein echter Geo-Anchor.
- Ausgangspunkt ist die aktuelle Geraeteposition (`geoOrigin`).
- Ziel ist die vom Nutzer eingegebene Zielkoordinate (`geoTarget`).

### Lokale Umrechnung
- Die Differenz zwischen Ursprung und Ziel wird in Meter umgerechnet.
- `Latitude` wird auf eine lokale Nord-/Sued-Komponente gemappt.
- `Longitude` wird auf eine lokale Ost-/West-Komponente gemappt.
- Das Ergebnis wird als lokales X/Z-Offset im aktuellen AR-Raum verwendet.

### Heading
- Fuer die Geo-Ausrichtung wird ein Heading ueber die Device Orientation API gelesen.
- Die Geo-Referenzrichtung wird nicht dauerhaft frameweise nachgefuehrt.
- Sobald eine nutzbare Referenzrichtung gesetzt ist, bleibt sie fuer die laufende Platzierungsberechnung stabil.

### Sichtbarkeitslogik
- Der `PlacementController` erzwingt aktuell eine effektive Sichtbarkeitsgrenze von mindestens `150 m`.
- Liegt das Ziel weiter entfernt, wird keine Geo-Platzierung freigegeben.
- In einzelnen UI-Texten steht noch `100 m`; die eigentliche Berechnungslogik liegt jedoch im Controller.

### Platzierung
- Das Geo-Objekt wird nur gesetzt, wenn:
  - eine stabile Flaeche verfuegbar ist,
  - ein Geo-Ursprung vorliegt,
  - eine Referenzrichtung vorliegt,
  - die Distanz innerhalb des erlaubten Bereichs liegt.
- Die Hoehe (`Y`) kommt weiterhin von der stabilen Hit-Test-Flaeche.
- Nach erfolgreicher Geo-Platzierung greift derselbe Placement-Lock wie im freien Modus.

### Einzelobjekt-Transformationen in Site-JSON

Zusätzlich zu `placement.transform` für das gesamte Modell akzeptiert die Site-JSON eine Liste
`placement.objectTransforms`. Jeder Eintrag bezieht sich auf genau einen im GLB benannten
Knoten. Die Anwendung füllt `nodePath` beim Auswählen automatisch; dieser Pfad bleibt auch bei
gleichnamigen Knoten eindeutig. `position` ist ein lokaler Versatz im Koordinatensystem des
jeweiligen Modellknotens.

```json
"objectTransforms": [
  {
    "nodePath": "0/4",
    "node": "Fountain",
    "position": { "x": 0, "y": 0.2, "z": -0.5 },
    "scaleFactor": 1.15,
    "rotationDeg": 15
  }
]
```

Die Entwickleransicht bietet dafür unter „Geo Test-Anpassung“ eine Auswahl aller benannten
Knoten. Die dort getesteten Werte wirken sofort auf die Vorschau und Geo-Instanzen. Der
Übernehmen-Button hält sie in der zur Laufzeit geladenen Site-Konfiguration; für einen
Neustart müssen dieselben Werte in die zugehörige `frontend/public/sites/*.json` übernommen
werden.

## Einschraenkungen

- Kein echter Geo-Anchor.
- Keine globale Weltverankerung ueber mehrere Sessions hinweg.
- Der Geo-Modus arbeitet nur relativ zum aktuellen lokalen AR-Raum.
- Die Genauigkeit haengt direkt von GPS, Sensoren, Heading und WebXR-Tracking ab.
- Der Heading-Wert wird fuer die Platzierungsreferenz nur einmalig sinnvoll uebernommen, nicht kontinuierlich nachgeregelt.
- Die Hoehe stammt von der lokal erkannten Flaeche, nicht von einer echten Zielhoehe.
