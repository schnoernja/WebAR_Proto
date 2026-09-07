# CityGML-Modellkonvertierung

`tools/convert_citygml_windows.bat` konvertiert die lokalen GML-Quelldateien aus
`CityGmls/` unter Windows nach `source-assets/models/generated/`. Die Konvertierung
läuft unabhängig vom WebAR-Produktions-Build und ihre Ausgaben werden nicht automatisch
nach `dist/` übernommen.

Der Pfad zum externen CityGML-Konverter wird im Batchskript über `C2G_EXE` festgelegt.
`CityGmls/` und die Konvertierung bleiben als Quelldaten- und Bearbeitungsweg erhalten.
