# Airwatch

[![HACS](https://img.shields.io/badge/HACS-Custom-orange.svg?logo=HomeAssistantCommunityStore&logoColor=white)](https://github.com/hacs/integration)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Airwatch is a HACS-installable Home Assistant flight tracker with synchronized Lovelace cards for live aircraft and airport flight lists.

Status: live aircraft via the OpenSky Network (anonymous or OAuth2 API credentials), plus a demo provider for development. Schedule providers (per-airport website adapters) are the next milestone.

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

The map card is static: it frames the configured location at the configured radius, with all pan/zoom gestures disabled. The list card has two modes:

- `mode: aircraft` (default) — the live aircraft currently on the map, with origin → destination routes; clicking a row selects it (highlight + expanded details, synced with the map marker)
- `mode: schedules` — airport arrivals/departures sections (use `show: arrivals|departures|both`)

Example Lovelace config:

```yaml
type: vertical-stack
cards:
  - type: custom:airwatch-map-card
    entity: sensor.airwatch_overview
  - type: custom:airwatch-list-card
    entity: sensor.airwatch_overview
    mode: aircraft
```

## Architecture

- Home Assistant integration domain: `airwatch`
- Frontend: TypeScript, Lit, Vite, Leaflet
- Backend: provider-neutral Python models, `DataUpdateCoordinator`, config flow, one overview sensor
- Live provider: OpenSky Network (`extended=1` state vectors, bounding box from the configured radius)

## Providers

Airwatch intentionally does not use FlightRadar24.

Live aircraft come from the **OpenSky Network**. Anonymous access works out of the box but is limited to 400 API credits/day, so polling is clamped to 240 s. Adding OpenSky API client credentials (free account, 4000 credits/day) in the integration options lowers the clamp to 30 s. Emergency squawks (7500/7600/7700) are flagged on the aircraft.

Schedule provider candidates (next milestone, per-airport website adapters):

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
