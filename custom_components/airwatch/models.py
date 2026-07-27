"""Provider-neutral Airwatch data models."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Literal

FlightDirection = Literal["arrival", "departure"]
FlightStatus = Literal["scheduled", "delayed", "airborne", "landed", "cancelled", "unknown"]
AircraftCategory = Literal["jet", "prop", "light", "heli"]


def utc_now_iso() -> str:
    """Return an ISO timestamp suitable for entity attributes."""
    return datetime.now(UTC).isoformat()


@dataclass(slots=True)
class Aircraft:
    """A normalized live aircraft position."""

    id: str
    latitude: float
    longitude: float
    icao24: str | None = None
    callsign: str | None = None
    registration: str | None = None
    category: AircraftCategory | None = None
    altitude_ft: int | None = None
    ground_speed_kt: int | None = None
    track_deg: int | None = None
    vertical_rate_fpm: int | None = None
    on_ground: bool = False
    origin: str | None = None
    origin_name: str | None = None
    destination: str | None = None
    destination_name: str | None = None
    updated_at: str = field(default_factory=utc_now_iso)

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(slots=True)
class ScheduledFlight:
    """A normalized airport schedule item."""

    id: str
    flight_number: str
    direction: FlightDirection
    airport: str
    scheduled_time: str
    callsign: str | None = None
    estimated_time: str | None = None
    actual_time: str | None = None
    status: FlightStatus = "unknown"
    gate: str | None = None
    terminal: str | None = None
    aircraft_registration: str | None = None

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(slots=True)
class FlightMatch:
    """A best-effort link between live aircraft and a scheduled flight."""

    aircraft_id: str
    flight_id: str
    confidence: float
    reasons: list[str]

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(slots=True)
class AirwatchData:
    """Complete card-facing data snapshot."""

    aircraft: list[Aircraft]
    arrivals: list[ScheduledFlight]
    departures: list[ScheduledFlight]
    matches: list[FlightMatch]
    map: dict[str, object]
    provider_status: dict[str, object]
    selected_aircraft_id: str | None = None
    selected_flight_id: str | None = None
    last_updated: str = field(default_factory=utc_now_iso)

    def to_attributes(self) -> dict[str, object]:
        return {
            "aircraft": [aircraft.to_dict() for aircraft in self.aircraft],
            "arrivals": [flight.to_dict() for flight in self.arrivals],
            "departures": [flight.to_dict() for flight in self.departures],
            "matches": [match.to_dict() for match in self.matches],
            "map": self.map,
            "provider_status": self.provider_status,
            "selected_aircraft_id": self.selected_aircraft_id,
            "selected_flight_id": self.selected_flight_id,
            "last_updated": self.last_updated,
        }
