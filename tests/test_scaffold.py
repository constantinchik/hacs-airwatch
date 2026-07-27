"""Smoke tests for the fresh Airwatch scaffold."""

from __future__ import annotations

import json
from pathlib import Path

from custom_components.airwatch.const import DOMAIN
from custom_components.airwatch.models import (
    Aircraft,
    AirwatchData,
    FlightMatch,
    ScheduledFlight,
)

ROOT = Path(__file__).parent.parent


def test_manifest_matches_domain() -> None:
    manifest = json.loads((ROOT / "custom_components" / "airwatch" / "manifest.json").read_text())

    assert DOMAIN == "airwatch"
    assert manifest["domain"] == DOMAIN
    assert manifest["name"] == "Airwatch"
    assert manifest["config_flow"] is True


def test_hacs_metadata_is_provider_neutral() -> None:
    metadata = json.loads((ROOT / "hacs.json").read_text())

    assert metadata["name"] == "Airwatch"
    assert "flightradar" not in json.dumps(metadata).lower()


def test_card_data_contract_shape() -> None:
    data = AirwatchData(
        aircraft=[Aircraft(id="abc", latitude=51.0, longitude=-0.1, callsign="BAW123")],
        arrivals=[
            ScheduledFlight(
                id="arr-1",
                flight_number="BA123",
                callsign="BAW123",
                direction="arrival",
                airport="LHR",
                scheduled_time="2026-01-01T12:00:00+00:00",
            )
        ],
        departures=[],
        matches=[FlightMatch(aircraft_id="abc", flight_id="arr-1", confidence=0.95, reasons=["callsign"])],
        map={"latitude": 51.0, "longitude": -0.1, "radius_km": 50, "zoom": 9},
        provider_status={"live": "demo", "schedules": "demo"},
    )

    attrs = data.to_attributes()

    assert attrs["aircraft"][0]["callsign"] == "BAW123"
    assert attrs["arrivals"][0]["flight_number"] == "BA123"
    assert attrs["matches"][0]["reasons"] == ["callsign"]
    assert attrs["selected_aircraft_id"] is None
