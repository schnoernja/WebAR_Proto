# iOS-AR-Fallback

## Startarchitektur

`ArCapabilityDetector` prüft beim Initialisieren zuerst echten WebXR-Support mit
`navigator.xr.isSessionSupported("immersive-ar")`. WebXR hat immer Prioritaet.
Für iPhone/iPad wird zusätzlich der iPadOS-Desktop-User-Agent erkannt. Öffnet
ein Nutzer eine gültige QR-Site (`?site=...`), startet `AR starten` den
Browser-Sensorpfad anstelle von Quick Look.

Die Startwege sind:

- WebXR: Der bestehende `ARApp`-/`ARSessionManager`-Flow wird aufgerufen.
- iPhone/iPad mit QR-Site: Der Browser fordert unmittelbar aus dem Klick Kamera,
  Standort sowie Bewegungs-/Kompasszugriff an. `SensorFusion` berechnet die
  Kamerapose relativ zum Site-Ursprung, während `GeoSceneManager` die aktive
  Szenendatei rendert.
- iOS ohne QR-Site: `IOSQuickLookLauncher` kann weiterhin unmittelbar aus der
  Nutzeraktion einen temporären `<a rel="ar">`-Link öffnen.
- Kein bekannter Modus: Die bestehende Statusanzeige zeigt eine Fehlermeldung.

Die Anfragen für Kamera, Standort und Orientierung werden im selben Klick
gestartet, damit die auf iOS erforderliche Nutzeraktivierung erhalten bleibt.

## Asset-Zuordnung

Site-Modelle verwenden `usdzAsset` direkt neben `asset` in der jeweiligen
Site-JSON. Die Standardmodelle werden in `ar/config.js` ueber
`primaryQuickLookUrl` und `fallbackQuickLookUrl` zugeordnet. Auf iOS wird die
Erreichbarkeit der relevanten USDZ-Dateien per `HEAD` vorab geprueft. Eine
fehlende Datei fuehrt beim Start zu einer klaren UI-Meldung und beeinflusst
WebXR nicht.

Vorhanden und als USDZ-Archiv validiert:

- `frontend/assets/fountain_benches_trees.usdz` (ca. 169,2 MiB)
- `frontend/assets/flowerpots_benches_gras.usdz` (ca. 40,5 MiB)
- `frontend/assets/EFH.usdz` (ca. 3,0 MiB)

Noch fehlende, weiterhin referenzierte Dateien:

- `frontend/models/tree.usdz`
- `frontend/models/fountain.usdz`
- `frontend/assets/platz-a/scene.usdz`

Die USDZ-Dateien muessen in Massstab, Ausrichtung und sichtbarem Inhalt ihren
jeweiligen GLB-Dateien entsprechen. Der nginx-Container liefert `.usdz` als
`model/vnd.usdz+zip` aus.

`fountain_benches_trees.usdz` sollte wegen seiner Groesse auf mehreren
iPhone-/iPad-Generationen getestet und nach Moeglichkeit durch Mesh- und
Texturoptimierung verkleinert werden. Die Archivstruktur selbst ist gueltig.

## Technische Grenzen gegenüber WebXR

- Der Browser-Sensorpfad liefert keine ARKit-/WebXR-Flächenerkennung, keinen
  Hit-Test und keine Bodenverankerung. Die Szene folgt nur GPS und
  Geräteorientierung; ihre Lage kann daher driften.
- Szenariowechsel, Three.js-Szenensteuerung, Kameraansicht sowie das bestehende
  UI bleiben im Browser verfügbar.
- Die Sensorfreigaben benötigen HTTPS und können vom Nutzer abgelehnt werden.
- Quick Look bleibt für Seiten ohne QR-Site separat bestehen; dabei gelten
  weiterhin dessen Einschränkungen für UI und Szenensteuerung.

## Referenzen

- [Apple: Previewing a Model with AR Quick Look](https://developer.apple.com/documentation/ARKit/previewing-a-model-with-ar-quick-look)
- [Apple WWDC25: What's new for the spatial web](https://developer.apple.com/videos/play/wwdc2025/237/)
- [Apple WWDC21: AR Quick Look, meet Object Capture](https://developer.apple.com/videos/play/wwdc2021/10078/)
- [IANA: Media Types](https://www.iana.org/assignments/media-types/media-types.xhtml)
