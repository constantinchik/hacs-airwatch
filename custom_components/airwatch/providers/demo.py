"""Demo provider used until real provider adapters are selected."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from ..models import Aircraft, ScheduledFlight
from ..provider import AirwatchProvider


class DemoProvider(AirwatchProvider):
    """Return deterministic sample data for frontend and integration development."""

    name = "demo"

    async def async_get_aircraft(
        self, *, latitude: float, longitude: float, radius_km: float
    ) -> list[Aircraft]:
        return [
            Aircraft(
                id="demo-baw123",
                icao24="400001",
                callsign="BAW123",
                registration="G-DEMO",
                latitude=latitude + 0.08,
                longitude=longitude - 0.12,
                altitude_ft=12750,
                ground_speed_kt=284,
                track_deg=82,
                vertical_rate_fpm=-640,
                origin="AMS",
                destination="LHR",
            ),
            Aircraft(
                id="demo-ezy42",
                icao24="400002",
                callsign="EZY42",
                latitude=latitude - 0.14,
                longitude=longitude + 0.16,
                altitude_ft=22100,
                ground_speed_kt=410,
                track_deg=245,
                origin="LHR",
                destination="EDI",
            ),
        ]

    async def async_get_schedules(self, *, airport_code: str | None) -> list[ScheduledFlight]:
        airport = airport_code or "LOCAL"
        now = datetime.now(UTC).replace(second=0, microsecond=0)
        return [
            ScheduledFlight(
                id="demo-arrival-baw123",
                flight_number="BA123",
                callsign="BAW123",
                direction="arrival",
                airport=airport,
                scheduled_time=(now + timedelta(minutes=18)).isoformat(),
                estimated_time=(now + timedelta(minutes=26)).isoformat(),
                status="delayed",
                terminal="5",
                gate="A12",
            ),
            ScheduledFlight(
                id="demo-departure-ezy42",
                flight_number="U242",
                callsign="EZY42",
                direction="departure",
                airport=airport,
                scheduled_time=(now - timedelta(minutes=7)).isoformat(),
                actual_time=(now - timedelta(minutes=3)).isoformat(),
                status="airborne",
                terminal="2",
                gate="B4",
            ),
        ]
