"""Demo provider used until real provider adapters are selected."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from math import atan2, cos, degrees, radians, sin, tau

from ..models import Aircraft, ScheduledFlight
from ..provider import AirwatchProvider


def _orbit(period_s: float, phase: float) -> tuple[float, float, int]:
    """Return (north, east, track_deg) on a unit circle for the current time.

    Time-based so successive polls show the aircraft actually moving.
    """
    theta = tau * ((datetime.now(UTC).timestamp() / period_s + phase) % 1.0)
    north, east = sin(theta), cos(theta)
    track = round(degrees(atan2(-sin(theta), cos(theta)))) % 360
    return north, east, track


class DemoProvider(AirwatchProvider):
    """Return deterministic sample data for frontend and integration development."""

    name = "demo"

    async def async_get_aircraft(
        self, *, latitude: float, longitude: float, radius_km: float
    ) -> list[Aircraft]:
        # Scale offsets to the configured radius so demo traffic always stays in view.
        dlat = radius_km / 111.0
        dlon = radius_km / (111.0 * max(cos(radians(latitude)), 0.2))
        north1, east1, track1 = _orbit(period_s=180, phase=0.0)
        north2, east2, track2 = _orbit(period_s=240, phase=0.5)
        north3, east3, track3 = _orbit(period_s=75, phase=0.25)
        return [
            Aircraft(
                id="demo-baw123",
                icao24="400001",
                callsign="BAW123",
                registration="G-DEMO",
                category="jet",
                latitude=latitude + 0.45 * dlat * north1,
                longitude=longitude + 0.45 * dlon * east1,
                altitude_ft=2750,
                ground_speed_kt=184,
                track_deg=track1,
                vertical_rate_fpm=-640,
                origin="YOW",
                origin_name="Ottawa Macdonald-Cartier International",
                destination="YTZ",
                destination_name="Billy Bishop Toronto City",
            ),
            Aircraft(
                id="demo-ezy42",
                icao24="400002",
                callsign="EZY42",
                category="jet",
                latitude=latitude + 0.70 * dlat * north2,
                longitude=longitude + 0.70 * dlon * east2,
                altitude_ft=6100,
                ground_speed_kt=252,
                track_deg=track2,
                vertical_rate_fpm=1450,
                origin="YTZ",
                origin_name="Billy Bishop Toronto City",
                destination="EWR",
                destination_name="Newark Liberty International",
            ),
            Aircraft(
                id="demo-pd456",
                icao24="400003",
                callsign="POE456",
                registration="C-GDMO",
                category="prop",
                latitude=latitude + 0.04 * dlat,
                longitude=longitude + 0.06 * dlon,
                altitude_ft=0,
                ground_speed_kt=4,
                track_deg=60,
                on_ground=True,
                origin="YTZ",
                origin_name="Billy Bishop Toronto City",
                destination="YHZ",
                destination_name="Halifax Stanfield International",
            ),
            Aircraft(
                id="demo-chpr12",
                icao24="400004",
                callsign="CHPR12",
                registration="C-GHLO",
                category="heli",
                latitude=latitude + 0.22 * dlat * north3,
                longitude=longitude + 0.22 * dlon * east3,
                altitude_ft=900,
                ground_speed_kt=92,
                track_deg=track3,
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
