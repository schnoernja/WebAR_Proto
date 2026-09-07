# Nicht veröffentlichte Quelldaten

Dieser Ordner enthält bearbeitbare Quelldateien, Modellzwischenstände, Referenzbilder
und interne Arbeitsnotizen. Er ist weder Bestandteil von `dist/` noch des produktiven
WebAR-Images.

- `models/` enthält Blender-Dateien, Modellkonvertierungsstände und die Daten der
  CityGML-/Matching-Werkzeuge. Aktive Browsermodelle bleiben unter `frontend/models/`
  beziehungsweise `frontend/assets/`.
- `design/` enthält bearbeitbare Designquellen und interne Farbangaben.
- `images/` enthält nicht ausgelieferte Referenzbilder.
- `notes/` enthält interne Arbeits- und Regressionsnotizen.

Große Modell- und Blender-Dateien unter `source-assets/models/` werden über Git LFS
verwaltet. Eine rückwirkende Änderung der Git-Historie ist nicht vorgesehen.

Die Blender-Dateien referenzieren teilweise Texturen außerhalb des Repositorys unter
`D:\saski\Downloads\flower_pot\textures`. Vor einer erneuten Bearbeitung oder einem
Export müssen diese externen Dateien in Blender geprüft und gegebenenfalls neu verknüpft
oder eingebettet werden.
