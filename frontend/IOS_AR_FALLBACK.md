# iOS-AR-Fallback

## Startarchitektur

`ArCapabilityDetector` prueft beim Initialisieren zuerst echten WebXR-Support mit
`navigator.xr.isSessionSupported("immersive-ar")`. WebXR hat immer Prioritaet.
Nur wenn WebXR nicht verfuegbar ist, wird auf iPhone/iPad einschliesslich des
iPadOS-Desktop-User-Agents geprueft, ob der Browser `rel="ar"` fuer Apple AR
Quick Look anbietet.

`ArLauncher` verwendet das gecachte Ergebnis beim Klick auf `AR starten`:

- WebXR: Der bestehende `ARApp`-/`ARSessionManager`-Flow wird aufgerufen.
- iOS Quick Look: `IOSQuickLookLauncher` klickt unmittelbar aus der
  Nutzeraktion einen temporaeren `<a rel="ar">`-Link.
- Kein bekannter Modus: Die bestehende Statusanzeige zeigt eine Fehlermeldung.

Die Capability- und USDZ-Pruefung erfolgt vor dem Klick. Dadurch bleibt die fuer
`requestSession()` beziehungsweise Quick Look erforderliche transiente
Nutzeraktivierung erhalten.

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

## Technische Grenzen gegenueber WebXR

- Quick Look fuehrt keinen eigenen WebXR-Hit-Test- oder Render-Loop aus.
- Three.js-Szenensteuerung, DOM-Debug-Overlay und PlacementController laufen
  nicht innerhalb von Quick Look.
- Freie, Geo-Local- und Geo-Global-Platzierung koennen nicht 1:1 uebernommen
  werden; Quick Look steuert Platzierung und Interaktion selbst.
- Standort, IMU, Kompass, Reticle-Stabilisierung und Placement-Lock bleiben
  Funktionen des WebXR-Pfads.
- Pro GLB-Modell ist ein separates, vorab erzeugtes USDZ-Asset erforderlich.
- Quick Look meldet seinen spaeteren Lebenszyklus nicht als WebXR-Session an die
  Webseite zurueck.

## Referenzen

- [Apple: Previewing a Model with AR Quick Look](https://developer.apple.com/documentation/ARKit/previewing-a-model-with-ar-quick-look)
- [Apple WWDC25: What's new for the spatial web](https://developer.apple.com/videos/play/wwdc2025/237/)
- [Apple WWDC21: AR Quick Look, meet Object Capture](https://developer.apple.com/videos/play/wwdc2021/10078/)
- [IANA: Media Types](https://www.iana.org/assignments/media-types/media-types.xhtml)
