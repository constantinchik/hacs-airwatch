"""Airwatch data coordinator."""

from __future__ import annotations

import logging
from datetime import timedelta

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_LATITUDE, CONF_LONGITUDE
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import (
    CONF_AIRPORT_CODE,
    CONF_OPENSKY_CLIENT_ID,
    CONF_OPENSKY_CLIENT_SECRET,
    CONF_PROVIDER,
    CONF_RADIUS_KM,
    CONF_SCAN_INTERVAL_SECONDS,
    CONF_ZOOM,
    DEFAULT_PROVIDER,
    DEFAULT_RADIUS_KM,
    DEFAULT_SCAN_INTERVAL_SECONDS,
    DEFAULT_ZOOM,
    DOMAIN,
    MIN_INTERVAL_OPENSKY_ANON,
    MIN_INTERVAL_OPENSKY_AUTH,
    PROVIDER_DEMO,
)
from .models import Aircraft, AirwatchData, FlightMatch, ScheduledFlight
from .provider import AirwatchProvider
from .providers.demo import DemoProvider
from .providers.opensky import OpenSkyProvider

_LOGGER = logging.getLogger(__name__)


class AirwatchCoordinator(DataUpdateCoordinator[AirwatchData]):
    """Fetch provider data and expose a stable card-facing snapshot."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.entry = entry
        self.provider = self._build_provider(hass)
        self.selected_aircraft_id: str | None = None
        self.selected_flight_id: str | None = None
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=self.effective_interval_seconds),
        )

    def _build_provider(self, hass: HomeAssistant) -> AirwatchProvider:
        if self.provider_kind == PROVIDER_DEMO:
            return DemoProvider()
        return OpenSkyProvider(
            async_get_clientsession(hass),
            client_id=self._option(CONF_OPENSKY_CLIENT_ID),
            client_secret=self._option(CONF_OPENSKY_CLIENT_SECRET),
        )

    def _option(self, key: str) -> str | None:
        value = self.entry.options.get(key, self.entry.data.get(key))
        return str(value).strip() or None if value else None

    @property
    def provider_kind(self) -> str:
        return self._option(CONF_PROVIDER) or DEFAULT_PROVIDER

    @property
    def effective_interval_seconds(self) -> int:
        """Clamp polling to what the provider's rate limits can sustain."""
        configured = self.scan_interval_seconds
        if not isinstance(self.provider, OpenSkyProvider):
            return configured
        minimum = (
            MIN_INTERVAL_OPENSKY_AUTH if self.provider.authenticated else MIN_INTERVAL_OPENSKY_ANON
        )
        if configured < minimum:
            _LOGGER.info(
                "Raising OpenSky update interval from %ss to %ss to respect API credits "
                "(add credentials or increase the interval to silence this)",
                configured,
                minimum,
            )
            return minimum
        return configured

    @property
    def latitude(self) -> float:
        return float(self.entry.options.get(CONF_LATITUDE, self.entry.data[CONF_LATITUDE]))

    @property
    def longitude(self) -> float:
        return float(self.entry.options.get(CONF_LONGITUDE, self.entry.data[CONF_LONGITUDE]))

    @property
    def radius_km(self) -> float:
        return float(self.entry.options.get(CONF_RADIUS_KM, self.entry.data.get(CONF_RADIUS_KM, DEFAULT_RADIUS_KM)))

    @property
    def zoom(self) -> int:
        return int(self.entry.options.get(CONF_ZOOM, self.entry.data.get(CONF_ZOOM, DEFAULT_ZOOM)))

    @property
    def scan_interval_seconds(self) -> int:
        return int(self.entry.options.get(CONF_SCAN_INTERVAL_SECONDS, DEFAULT_SCAN_INTERVAL_SECONDS))

    @property
    def airport_code(self) -> str | None:
        value = self.entry.options.get(CONF_AIRPORT_CODE, self.entry.data.get(CONF_AIRPORT_CODE))
        return str(value).upper() if value else None

    async def async_select_target(
        self, *, aircraft_id: str | None = None, flight_id: str | None = None
    ) -> None:
        """Set the shared selected aircraft/flight target used by all cards."""
        self.selected_aircraft_id = aircraft_id or None
        self.selected_flight_id = flight_id or None
        if self.data is not None:
            self.async_set_updated_data(self._with_selection(self.data))

    async def async_clear_selection(self) -> None:
        """Clear shared card selection state."""
        await self.async_select_target()

    async def _async_update_data(self) -> AirwatchData:
        try:
            aircraft = await self.provider.async_get_aircraft(
                latitude=self.latitude,
                longitude=self.longitude,
                radius_km=self.radius_km,
            )
            schedules = await self.provider.async_get_schedules(airport_code=self.airport_code)
        except Exception as err:
            raise UpdateFailed(str(err)) from err

        arrivals = [flight for flight in schedules if flight.direction == "arrival"]
        departures = [flight for flight in schedules if flight.direction == "departure"]
        return self._with_selection(
            AirwatchData(
                aircraft=aircraft,
                arrivals=arrivals,
                departures=departures,
                matches=_match_flights(aircraft, schedules),
                map={
                    "latitude": self.latitude,
                    "longitude": self.longitude,
                    "radius_km": self.radius_km,
                    "zoom": self.zoom,
                },
                provider_status={
                    "live": self.provider.name,
                    "schedules": self.provider.name if schedules else "none",
                },
            )
        )

    def _with_selection(self, data: AirwatchData) -> AirwatchData:
        data.selected_aircraft_id = self.selected_aircraft_id
        data.selected_flight_id = self.selected_flight_id
        return data


def _match_flights(aircraft: list[Aircraft], schedules: list[ScheduledFlight]) -> list[FlightMatch]:
    """Match conservatively; never invent links without an explicit identifier."""
    matches: list[FlightMatch] = []
    for plane in aircraft:
        for flight in schedules:
            reasons: list[str] = []
            if plane.callsign and flight.callsign and plane.callsign == flight.callsign:
                reasons.append("callsign")
            if (
                plane.registration
                and flight.aircraft_registration
                and plane.registration == flight.aircraft_registration
            ):
                reasons.append("registration")
            if reasons:
                matches.append(
                    FlightMatch(
                        aircraft_id=plane.id,
                        flight_id=flight.id,
                        confidence=0.95 if "callsign" in reasons else 0.8,
                        reasons=reasons,
                    )
                )
    return matches


type AirwatchConfigEntry = ConfigEntry[AirwatchCoordinator]
