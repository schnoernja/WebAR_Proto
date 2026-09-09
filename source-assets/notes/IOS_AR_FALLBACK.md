# Browserbasierter AR-Pfad für iPhone und iPad

## Auswahl und Nutzerablauf

`ArCapabilityDetector` prüft zuerst
`navigator.xr.isSessionSupported("immersive-ar")`. Wird diese Fähigkeit angeboten,
bleibt der bestehende Android-/WebXR-Pfad unverändert aktiv. Nur wenn sie fehlt,
prüft die Anwendung ergänzend iOS/iPadOS, HTTPS, Geräteorientierung, WebAssembly
SIMD, WebGL und Kamerazugriff. Auf einem passenden Gerät wird automatisch
`IOSWebSLAMPlacementBackend` gewählt.

Beide Pfade verwenden dieselbe URL, denselben Startbutton, dieselben
Statuskomponenten, dasselbe Reticle, dieselbe Platzierungsaktion sowie dieselben
Reset- und Ende-Funktionen. Technische Backend-Namen erscheinen nicht in der
Benutzeroberfläche.

## Engine und Selbst-Hosting

Der iOS-Pfad verwendet die unveränderte **8th Wall Distributed Engine Binary
1.0.0** mit World Tracking:

- `vendor/8thwall/xr.js`
- `vendor/8thwall/xr-slam.js`
- `vendor/8thwall/LICENSE`

Bezugsquelle: offizielles npm-Paket
[`@8thwall/engine-binary@1.0.0`](https://www.npmjs.com/package/@8thwall/engine-binary).
SHA-256 des bezogenen npm-Archivs:
`31E916D871A1B9046BBE055A79BC173AA6244D120116A1337D3ADA7EF96112FF`.

Nur Entry-Point, SLAM-Chunk und Lizenz werden ausgeliefert. Face Effects,
Semantikmodelle, VPS, Maps und Hand Tracking sind nicht eingebunden. Das Script
wird ausschließlich für den automatisch ausgewählten iOS-Pfad dynamisch geladen.

Die Binary steht unter dem beigefügten XR Engine License Agreement. Die Dateien
bleiben unverändert; die Copyright- und Lizenzhinweise sind am Anfang der Binary
enthalten. In der Hilfe verlinkt „Rechtliche Hinweise“ sichtbar auf
`vendor/8thwall/LICENSE` und nennt Urheber, Lizenz sowie Gewährleistungsausschluss.

## Technische Integration

Das Backend verwendet `XR8.XrController` mit aktiviertem World Tracking und
absoluter Meter-Skalierung. Der bestehende Three.js-Canvas und Render-Loop treiben
die Engine über `XR8.runPreRender()` und `XR8.runPostRender()` an. Deshalb entstehen
weder eine zweite Three.js-Szene noch ein zweiter Render-Loop.

Die Kamerapose und Projektionsmatrix kommen aus dem Engine-Ergebnis. Ein
Bildschirm-Hit-Test im unteren mittleren Kamerabereich bevorzugt
`DETECTED_SURFACE`, danach `ESTIMATED_SURFACE` und zuletzt `FEATURE_POINT`. Die
Ergebnisse laufen durch den vorhandenen `PoseStabilizer` und anschließend durch
den unveränderten `PlacementController`. Das Modell behält damit Normalisierung,
Bodenkontakt, Transformationen, Animationen und fachliche Geo-Local-Regeln.

Eine semantische Bodenklassifizierung wird nicht behauptet. Die Platzierung nutzt
World Tracking, den dokumentierten 8th-Wall-Hit-Test und die Bestätigung durch den
Nutzer.

## Geo-Global-Pfad

Der getrennte Geo-Global-Modus nutzt weiterhin `SensorFusion`, Standort und
Kompass. Modellnormalisierung, Bodenkontakt und `placement.transform` werden im
iPhone-Fallback nun genauso angewendet wie im Android-/WebXR-Pfad. Beide Pfade
richten die Szene an derselben Nordreferenz aus.

## Manuelle Vergleichscheckliste

Auf einem unterstützten Android-Gerät und einem realen iPhone jeweils prüfen:

- dieselbe URL, Startansicht und derselbe Startbutton;
- Kamera-, Standort- und gegebenenfalls Kompassberechtigungen;
- identische Initialisierungs- und Scananweisungen;
- Erscheinen, Position und Stabilität des Reticles;
- Platzierung durch Tippen beziehungsweise „Objekt setzen“;
- Bodenkontakt, Maßstab, Rotation, Modelle und Animationen;
- Stabilität beim Umrunden und Drift nach etwa 5–10 Metern;
- Trackingverlust und Wiederherstellung;
- Zurücksetzen, erneutes Platzieren, Beenden und erneutes Starten;
- Tab-Wechsel sowie Rückkehr in die AR-Ansicht;
- helle, dunkle, strukturreiche und strukturarme Böden;
- sichtbare oder funktionale Abweichungen zwischen beiden Geräten.

Reale Trackingstabilität, Drift und Bodenqualität können ohne physisches iPhone
nicht abschließend automatisiert beurteilt werden.
