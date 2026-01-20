# WebAR_Proto

**Live-Demo:**
https://webar.duckdns.org/

## Entwicklung & Selbst-Hosting

### Voraussetzungen
- Installiere Docker und Docker Compose.

### Projekt lokal starten

Oeffne ein Terminal im Projektordner und fuehre aus:

```powershell
# Container bauen und starten/neustarten
docker compose up -d
```

Das Projekt ist dann unter http://localhost:8080 erreichbar.

### Hinweise
- Die statischen Dateien werden ueber einen nginx-Webserver bereitgestellt.
- Aenderungen an den Dateien werden beim naechsten `docker compose up -d` automatisch uebernommen.

## Aktueller Funktionsstand (Kurzfassung)

### Bestehende Funktionen
- Frontend und API getrennt: statische WebAR-UI in `frontend/` (Port 8080), PHP-API in eigenem Container (Port 8081).
- GPS-Debug zeigt Geraete-Lat/Lon, Objekt-Lat/Lon, Distanz, Sichtbarkeit, Modellhoehe; Objekte werden im Umkreis von 10 m sichtbar.
- Objekt-Manipulation zur Laufzeit: Lat/Lon eingeben, Hoehe einstellen, "2 m vor Geraet zuruecksetzen".
- Model-Switch: Button zum Wechsel zwischen tree/fountain (jeweils nur eines sichtbar).
- API `models.php` liefert Model-Metadaten aus Postgres.
- Datenbank via Docker (Postgres 16, Port 5444), Netzwerk fuer php+postgres konfiguriert.
- CityGML-Import: Height-Tiles in Postgres gespeichert; CRS-Fix fuer ETRS89_UTM32*DE_DHHN2016_NH (EPSG:25832).
- Height-API `/api/height.php?lat=..&lon=..` vorhanden (Tile-Lookup + bilinear Interpolation).
- Client ruft Height-API bei GPS-Updates auf, cached per `tile_key`, aktualisiert Ground-Height und wendet diese auf Objekt-Y an.
- CityGML-Konverter (Windows): Batch-Script konvertiert GMLs nach glTF in `frontend/models/generated`.

### Neue/funktionierende Aenderungen
- Debug-UI ist in klappbare Sektionen unterteilt (Device/Object/Height/Scale/Transform/Test).
- AR-Mode-Anzeige + "Enter AR"-Button zeigt WebXR vs. AR.js; Button nur bei WebXR-Verfuegbarkeit.
- WebXR-GPS-Bridge: WebXR liefert stabiles Tracking, GPS liefert reale Position; Platzierung ueber Distanz/Bearing + Heading.
- Height-Berechnung funktioniert: Ground-Height aus `/api/height.php`, Objekt-Y wird korrekt gesetzt; optional Device-Altitude + Offset.
- Sichtbarkeitsgrenze aktuell bei 100 m fuer Debug/Tests.
- Modell-Tools erweitert: Rotation/Offset, individuelle Scale-Werte pro Modell, Model-Switch, "2 m voraus" Reset.
- Modell-Load-Logging: `model-loaded`/`model-error` zur Fehlersuche.

### Aktueller Funktionsstand
- WebXR wird bevorzugt aktiviert, falls unterstuetzt; sonst Fallback auf AR.js mit Kamera-GPS.
- GPS-Debug zeigt Lat/Lon, Heading, Ground-Height, AR-Mode, WebXR Distanz/Bearing.
- Height-Tiles aus CityGML (DHHN2016/NH) werden interpoliert und angewendet.
- Frontend/Backend getrennt: `frontend/` fuer UI, PHP-API fuer Modelle/Height-Lookup, Postgres via Docker.
- CityGML-Daten bleiben lokal (`CityGmls/` ignoriert); nur abgeleitete Daten/Modelle im Projekt.
