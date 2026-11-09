# Development

## Source map

- [models.py](../custom_components/airwatch/models.py) defines the provider-neutral
  `Aircraft`, `ScheduledFlight`, `FlightMatch` and card-facing `AirwatchData` snapshot.
- [provider.py](../custom_components/airwatch/provider.py) defines the provider interface;
  [providers/](../custom_components/airwatch/providers/) contains OpenSky and demo adapters.
- [coordinator.py](../custom_components/airwatch/coordinator.py) owns polling, conservative
  matching and shared selection. [sensor.py](../custom_components/airwatch/sensor.py)
  exposes the snapshot through the overview entity.
- [__init__.py](../custom_components/airwatch/__init__.py) registers selection services;
  [services.yaml](../custom_components/airwatch/services.yaml) describes their fields.
- [types.ts](../frontend/src/types.ts), [helpers.ts](../frontend/src/helpers.ts) and
  [airwatch-cards.ts](../frontend/src/airwatch-cards.ts) own the frontend contract,
  matching/time helpers and both Lit cards. Keep Python attributes and TypeScript types aligned.

## Provider and selection contracts

OpenSky supplies live positions plus optional OpenSky aircraft metadata and adsbdb
callsign-route enrichment. It returns no schedules. Demo supplies synthetic aircraft
and schedules for development; demo output is not live acceptance evidence. There is
no FlightRadar24 backend. Real schedule adapters remain roadmap work, even though the
schedule model, demo data and schedule list mode already exist.

Keep live aircraft and airport schedules separate. A route lookup is not a schedule,
an observed journey or proof of arrival/departure status. `_match_flights` currently
links only equal nonempty callsigns or registrations and records reasons/confidence;
it does not infer a link from proximity, route or timing, or guarantee a unique match.
Unmatched schedules must remain usable without a live marker.

Both cards read the same overview entity and send `airwatch.select_target` or
`airwatch.clear_selection`; the coordinator publishes `selected_aircraft_id` and
`selected_flight_id`. Selecting a matched item carries both IDs; an unmatched item
has only its own ID. Clicking the selected item clears selection. Preserve this shared
map/list behavior rather than adding independent selection state to each card.
Services support `entry_id`; current card calls omit it, so they target all loaded
Airwatch coordinators. Do not claim selection is isolated per entry today.

## Missing and stale data

Preserve absent optional fields as absent; do not turn missing altitude/speed into
zero or invent endpoints, matches or flight status. Positionless OpenSky vectors are
dropped. Empty schedules from OpenSky mean no schedule source, not proof that an
airport has no flights. `provider_status.schedules` currently becomes `none` whenever
the schedule result is empty, including an empty result from an implemented provider.

The cards show an unavailable-provider message and missing-entity guidance, but do
not provide comprehensive stale-data handling. `last_updated` is snapshot creation
time and `Aircraft.updated_at` defaults to model creation time; OpenSky observation
timestamps are not currently carried through. Neither proves observation freshness.
Retained attributes on an unavailable entity must not be presented as verified live data.
The route label `Local` currently means both endpoints are missing, not a confirmed
local flight. Treat these as implementation limitations when reviewing or reporting UI behavior.

The map projects motion between updates, capped at 120 seconds after receipt. Selected
route lines are great-circle segments to/from known airports, not recorded tracks or
filed flight plans. Animation and route enrichment already exist; neither is fresh
provider evidence, and neither should be listed as unimplemented roadmap work.

## Offline checks

Use an existing development environment; Python 3.12+ is required by
[pyproject.toml](../pyproject.toml). The existing CI uses Python 3.12 and Node 22:
[backend checks](../.github/workflows/tests.yml),
[frontend checks](../.github/workflows/frontend.yml).

From the repository root:

```bash
python -m pytest
python -m ruff check .
```

From `frontend/`, with dependencies already available:

```bash
npm run type-check
npm run build
test -f dist/airwatch-cards.js
```

The README documents initial dependency installation. Do not provision services or
use real accounts just to validate documentation. Ruff above is read-only; avoid
autofix/formatting unrelated code. [tests/](../tests/) currently covers model/scaffold
and provider parsing; it does not establish rendered card behavior, coordinator
integration behavior or real provider access. Report actual failures or missing tools
without claiming a check passed. UI behavior changes additionally need authorized
rendered map/list checks; see [deployment.md](deployment.md) for live evidence.
