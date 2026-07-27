# Airwatch

[![HACS](https://img.shields.io/badge/HACS-Custom-orange.svg?logo=HomeAssistantCommunityStore&logoColor=white)](https://github.com/hacs/integration)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Airwatch is a HACS-installable Home Assistant flight tracker with synchronized Lovelace cards for live aircraft and airport flight lists.

Status: early scaffold. The integration currently ships a demo provider and the frontend card shell. Real live-aircraft and schedule providers are intentionally still open.

## Goals

- Show a live Leaflet map around a configured airport or location.
- Show polished arrival and departure lists ordered by relevance to the current time.
- Allow map marker clicks and flight tile clicks to share selected aircraft/flight state.
- Keep live aircraft and scheduled flights separate when they cannot be matched reliably.
- Support flexible Lovelace layouts through separate cards.

## Cards

The frontend bundle registers these custom cards:

- `custom:airwatch-map-card`
- `custom:airwatch-list-card`

Both cards read the same overview entity and use backend services for shared selection state.

Example Lovelace config:

```yaml
type: vertical-stack
cards:
  - type: custom:airwatch-map-card
    entity: sensor.airwatch_overview
  - type: custom:airwatch-list-card
    entity: sensor.airwatch_overview
    show: both
```

## Architecture

- Home Assistant integration domain: `airwatch`
- Frontend: TypeScript, Lit, Vite, Leaflet
- Backend: provider-neutral Python models, `DataUpdateCoordinator`, config flow, one overview sensor
- Initial provider: demo data only

## Provider Plan

Airwatch intentionally does not use FlightRadar24.

Likely live aircraft provider candidates:

- OpenSky Network
- airplanes.live / adsb.lol compatible APIs
- self-hosted tar1090/readsb JSON feeds

Likely schedule provider candidates:

- AeroDataBox
- Aviationstack
- airport-specific public feeds where available
- future local/manual provider adapters

## Development

Backend checks:

```bash
python -m pytest
python -m ruff check .
```

Frontend checks:

```bash
cd frontend
npm install
npm run type-check
npm run build
```
