"""Provider contract for Airwatch data sources."""

from __future__ import annotations

from abc import ABC, abstractmethod

from .models import Aircraft, ScheduledFlight


class AirwatchProvider(ABC):
    """Base class for live-aircraft and schedule providers."""

    name: str

    @abstractmethod
    async def async_get_aircraft(
        self, *, latitude: float, longitude: float, radius_km: float
    ) -> list[Aircraft]:
        """Return live aircraft near a point."""

    @abstractmethod
    async def async_get_schedules(self, *, airport_code: str | None) -> list[ScheduledFlight]:
        """Return arrivals and departures for an airport."""
