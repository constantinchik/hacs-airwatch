"""Demo provider used until real provider adapters are selected."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from math import cos, radians

from ..models import Aircraft, ScheduledFlight
from ..provider import AirwatchProvider


class DemoProvider(AirwatchProvider):
    """Return deterministic sample data for frontend and integration development."""

    name = "demo"

    async def async_get_aircraft(
        self, *, latitude: float, longitude: float, radius_km: float
    ) -> list[Aircraft]:
        # Scale offsets to the configured radius so demo traffic always stays in view.
        dlat = radius_km / 111.0
        dlon = radius_km / (111.0 * max(cos(radians(latitude)), 0.2))
        return [
            Aircraft(
                id="demo-baw123",
                icao24="400001",
                callsign="BAW123",
                registration="G-DEMO",
                latitude=latitude + 0.45 * dlat,
                longitude=longitude - 0.40 * dlon,
                altitude_ft=2750,
                ground_speed_kt=184,
                track_deg=132,
                vertical_rate_fpm=-640,
                origin="YOW",
                destination="YTZ",
            ),
            Aircraft(
                id="demo-ezy42",
                icao24="400002",
                callsign="EZY42",
                latitude=latitude - 0.60 * dlat,
                longitude=longitude + 0.70 * dlon,
                altitude_ft=6100,
                ground_speed_kt=252,
                track_deg=245,
                vertical_rate_fpm=1450,
                origin="YTZ",
                destination="EWR",
            ),
            Aircraft(
                id="demo-pd456",
                icao24="400003",
                callsign="POE456",
                registration="C-GDMO",
                latitude=latitude + 0.04 * dlat,
                longitude=longitude + 0.06 * dlon,
                altitude_ft=0,
                ground_speed_kt=4,
                track_deg=60,
                on_ground=True,
                origin="YTZ",
                destination="YHZ",
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
            ScheduledFlight(
                id="demo-departure-pd456",
                flight_number="PD456",
                callsign="POE456",
                direction="departure",
                airport=airport,
                scheduled_time=(now + timedelta(minutes=34)).isoformat(),
                status="scheduled",
                terminal="1",
                gate="C7",
                aircraft_registration="C-GDMO",
            ),
        ]
