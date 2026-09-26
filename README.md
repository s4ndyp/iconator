# Iconator

Donkere webapp om iconen te maken uit afbeeldingen en op te slaan in PocketBase. Opgeslagen iconen zijn direct via URL te gebruiken in andere apps (zoals een extern icoon).

Gebaseerd op het tinynote-deploypatroon: één PocketBase-container, frontend in `pb_public`, collecties via `pb_migrations`.

## Functies

- **Startpagina** met keuze tussen icoon maken en bibliotheek
- **Icoon maken**: rond of vierkant masker, slepen/zoomen, zwarte-achtergrondfilter (slider), transparant of normaal, **ZIP-export** (32, 128, 192, 256, 512 px)
- **Bibliotheek**: grid met previews, zoeken, link kopiëren, verwijderen

## PocketBase collectie

Migratie `pb_migrations/1788048001_created_icons.js` maakt collectie `icons` met publieke regels (leeg = iedereen mag lezen/schrijven). Pas dit aan als je de app achter auth wilt zetten.

Bestands-URL formaat:

```text
https://<jouw-host>/api/files/icons/<record-id>/<bestandsnaam>.png
```

## Lokaal bouwen

```bash
docker build -t iconator:local .
docker run --rm -p 8080:8080 -v iconator_data:/pb/pb_data iconator:local
```

Open `http://localhost:8080`. PocketBase admin: `http://localhost:8080/_/`.

## Deploy (Dockhand / GHCR)

1. Push naar `main` — GitHub Actions bouwt en pusht naar `ghcr.io/s4ndyp/iconator:latest`.
2. Gebruik `docker-compose.yml` op je server (volume `iconator_data` voor persistente data).

```bash
docker compose up -d
```

## Structuur

```text
pb_public/          Frontend (HTML, CSS, JS)
pb_migrations/      PocketBase migraties
Dockerfile            Alpine + PocketBase 0.40.4
docker-compose.yml    Productie stack
```
