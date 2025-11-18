# WebAR_Proto

## Voraussetzungen
- Installiere [Docker](https://www.docker.com/) und [Docker Compose](https://docs.docker.com/compose/).

## Projekt starten

Öffne ein Terminal im Projektordner und führe aus:

```powershell
# Container bauen und starten/neustarten
docker compose up -d
```

Das Projekt ist dann unter [http://localhost:8080](http://localhost:8080) erreichbar.

## Hinweise
- Die statischen Dateien werden über einen nginx-Webserver bereitgestellt.
- Änderungen an den Dateien werden beim nächsten `docker compose up -d` automatisch übernommen.
