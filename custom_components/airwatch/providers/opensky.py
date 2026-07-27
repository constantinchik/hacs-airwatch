"""OpenSky Network live-aircraft provider."""

from __future__ import annotations

import asyncio
import logging
import time
from math import cos, radians
from typing import Any

import aiohttp

from ..models import Aircraft, AircraftCategory, ScheduledFlight
from ..provider import AirwatchProvider

_LOGGER = logging.getLogger(__name__)

STATES_URL = "https://opensky-network.org/api/states/all"
METADATA_URL = "https://opensky-network.org/api/metadata/aircraft/icao/{icao24}"
ROUTE_URL = "https://api.adsbdb.com/v0/callsign/{callsign}"
TOKEN_URL = (
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token"
)

EMERGENCY_SQUAWKS = {"7500", "7600", "7700"}
MAX_METADATA_LOOKUPS_PER_CYCLE = 8
MAX_ROUTE_LOOKUPS_PER_CYCLE = 5

# OpenSky ADS-B emitter categories -> Airwatch categories.
# https://openskynetwork.github.io/opensky-api/rest.html
_CATEGORY_MAP: dict[int, AircraftCategory] = {
    2: "light",  # Light (< 15500 lbs)
    3: "prop",  # Small (15500 to 75000 lbs)
    4: "jet",  # Large (75000 to 300000 lbs)
    5: "jet",  # High vortex large
    6: "jet",  # Heavy (> 300000 lbs)
    7: "jet",  # High performance
    8: "heli",  # Rotorcraft
    9: "light",  # Glider / sailplane
    12: "light",  # Ultralight
}


class OpenSkyError(RuntimeError):
    """Raised when the OpenSky API cannot be queried."""


class OpenSkyProvider(AirwatchProvider):
    """Fetch live state vectors from the OpenSky Network REST API."""

    name = "opensky"

    def __init__(
        self,
        session: aiohttp.ClientSession,
        client_id: str | None = None,
        client_secret: str | None = None,
    ) -> None:
        self._session = session
        self._client_id = client_id or None
        self._client_secret = client_secret or None
        self._token: str | None = None
        self._token_expires_at = 0.0
        # icao24 -> metadata dict, or None when OpenSky has no record (negative cache).
        self._metadata: dict[str, dict[str, Any] | None] = {}
        # callsign -> route dict, or None when adsbdb has no route (negative cache).
        self._routes: dict[str, dict[str, Any] | None] = {}

    @property
    def authenticated(self) -> bool:
        return bool(self._client_id and self._client_secret)

    async def async_get_aircraft(
        self, *, latitude: float, longitude: float, radius_km: float
    ) -> list[Aircraft]:
        dlat = radius_km / 111.0
        dlon = radius_km / (111.0 * max(cos(radians(latitude)), 0.05))
        params = {
            "lamin": f"{latitude - dlat:.4f}",
            "lamax": f"{latitude + dlat:.4f}",
            "lomin": f"{longitude - dlon:.4f}",
            "lomax": f"{longitude + dlon:.4f}",
            "extended": "1",
        }
        headers = await self._auth_headers()
        try:
            async with self._session.get(
                STATES_URL, params=params, headers=headers, timeout=aiohttp.ClientTimeout(total=30)
            ) as resp:
                if resp.status == 401 and self.authenticated:
                    # Token may have been revoked early; force one refresh.
                    self._token = None
                    headers = await self._auth_headers()
                    async with self._session.get(
                        STATES_URL,
                        params=params,
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=30),
                    ) as retry:
                        aircraft = self._parse_states(await self._read_json(retry))
                else:
                    aircraft = self._parse_states(await self._read_json(resp))
        except (TimeoutError, aiohttp.ClientError) as err:
            raise OpenSkyError(f"OpenSky request failed: {err}") from err
        await self._apply_metadata(aircraft)
        await self._apply_routes(aircraft)
        return aircraft

    async def async_get_schedules(self, *, airport_code: str | None) -> list[ScheduledFlight]:
        # Schedules come from airport-website adapters, not OpenSky.
        return []

    async def _apply_metadata(self, aircraft: list[Aircraft]) -> None:
        """Enrich aircraft with cached OpenSky metadata (type, class, registration)."""
        pending = [
            plane.icao24
            for plane in aircraft
            if plane.icao24 and plane.icao24 not in self._metadata
        ][:MAX_METADATA_LOOKUPS_PER_CYCLE]
        if pending:
            await asyncio.gather(*(self._fetch_metadata(icao24) for icao24 in pending))
        for plane in aircraft:
            meta = self._metadata.get(plane.icao24 or "")
            if not meta:
                continue
            plane.registration = plane.registration or meta.get("registration")
            plane.type_code = meta.get("typecode")
            plane.model = meta.get("model")
            category = class_to_category(meta.get("icao_class"))
            if category:
                plane.category = category

    async def _apply_routes(self, aircraft: list[Aircraft]) -> None:
        """Enrich aircraft with cached adsbdb route data (origin/destination airports)."""
        pending = [
            plane.callsign
            for plane in aircraft
            if plane.callsign and plane.callsign.isalnum() and plane.callsign not in self._routes
        ][:MAX_ROUTE_LOOKUPS_PER_CYCLE]
        if pending:
            await asyncio.gather(*(self._fetch_route(callsign) for callsign in pending))
        for plane in aircraft:
            route = self._routes.get(plane.callsign or "")
            if not route:
                continue
            if origin := route.get("origin"):
                plane.origin = origin.get("code")
                plane.origin_name = origin.get("name")
                plane.origin_latitude = origin.get("latitude")
                plane.origin_longitude = origin.get("longitude")
            if destination := route.get("destination"):
                plane.destination = destination.get("code")
                plane.destination_name = destination.get("name")
                plane.destination_latitude = destination.get("latitude")
                plane.destination_longitude = destination.get("longitude")

    async def _fetch_route(self, callsign: str) -> None:
        try:
            async with self._session.get(
                ROUTE_URL.format(callsign=callsign),
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status == 404:
                    self._routes[callsign] = None
                    return
                if resp.status >= 400:
                    _LOGGER.debug("Route lookup for %s returned HTTP %s", callsign, resp.status)
                    return
                payload = await resp.json()
        except (TimeoutError, aiohttp.ClientError, ValueError) as err:
            _LOGGER.debug("Route lookup for %s failed: %s", callsign, err)
            return
        self._routes[callsign] = parse_route(payload)

    async def _fetch_metadata(self, icao24: str) -> None:
        headers = await self._auth_headers()
        try:
            async with self._session.get(
                METADATA_URL.format(icao24=icao24),
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status == 404:
                    self._metadata[icao24] = None
                    return
                if resp.status >= 400:
                    # Transient (rate limit etc.) - retry on a later cycle.
                    _LOGGER.debug("Metadata lookup for %s returned HTTP %s", icao24, resp.status)
                    return
                data = await resp.json()
        except (TimeoutError, aiohttp.ClientError, ValueError) as err:
            _LOGGER.debug("Metadata lookup for %s failed: %s", icao24, err)
            return
        self._metadata[icao24] = {
            "registration": str(data.get("registration") or "").strip() or None,
            "typecode": str(data.get("typecode") or "").strip().upper() or None,
            "model": str(data.get("model") or "").strip() or None,
            "icao_class": data.get("icaoAircraftClass") or data.get("icaoAircraftType"),
        }

    async def _read_json(self, resp: aiohttp.ClientResponse) -> dict[str, Any]:
        if resp.status == 429:
            retry_after = resp.headers.get("X-Rate-Limit-Retry-After-Seconds", "unknown")
            raise OpenSkyError(
                f"OpenSky rate limit exhausted (retry after {retry_after}s); "
                "increase the update interval or add API credentials"
            )
        if resp.status >= 400:
            raise OpenSkyError(f"OpenSky returned HTTP {resp.status}")
        return await resp.json()

    async def _auth_headers(self) -> dict[str, str]:
        if not self.authenticated:
            return {}
        if self._token is None or time.monotonic() >= self._token_expires_at:
            await self._refresh_token()
        return {"Authorization": f"Bearer {self._token}"}

    async def _refresh_token(self) -> None:
        data = {
            "grant_type": "client_credentials",
            "client_id": self._client_id,
            "client_secret": self._client_secret,
        }
        try:
            async with self._session.post(
                TOKEN_URL, data=data, timeout=aiohttp.ClientTimeout(total=30)
            ) as resp:
                if resp.status >= 400:
                    raise OpenSkyError(
                        f"OpenSky token request failed with HTTP {resp.status}; check credentials"
                    )
                payload = await resp.json()
        except (TimeoutError, aiohttp.ClientError) as err:
            raise OpenSkyError(f"OpenSky token request failed: {err}") from err
        self._token = payload["access_token"]
        self._token_expires_at = time.monotonic() + float(payload.get("expires_in", 1800)) - 60

    def _parse_states(self, payload: dict[str, Any]) -> list[Aircraft]:
        aircraft = [
            plane
            for state in payload.get("states") or []
            if (plane := state_to_aircraft(state)) is not None
        ]
        _LOGGER.debug("OpenSky returned %d usable aircraft", len(aircraft))
        return aircraft


def parse_route(payload: dict[str, Any]) -> dict[str, Any] | None:
    """Extract origin/destination airports from an adsbdb callsign response."""
    response = payload.get("response")
    if not isinstance(response, dict):
        return None
    flightroute = response.get("flightroute")
    if not isinstance(flightroute, dict):
        return None

    def airport(value: Any) -> dict[str, Any] | None:
        if not isinstance(value, dict):
            return None
        code = value.get("iata_code") or value.get("icao_code")
        if not code:
            return None
        return {
            "code": str(code).upper(),
            "name": value.get("name") or value.get("municipality"),
            "latitude": value.get("latitude"),
            "longitude": value.get("longitude"),
        }

    origin = airport(flightroute.get("origin"))
    destination = airport(flightroute.get("destination"))
    if not origin and not destination:
        return None
    return {"origin": origin, "destination": destination}


def class_to_category(icao_class: Any) -> AircraftCategory | None:
    """Map an ICAO aircraft class like 'L2J' or 'H1T' to an Airwatch category."""
    if not icao_class or not isinstance(icao_class, str):
        return None
    cleaned = icao_class.strip().upper()
    if not cleaned:
        return None
    if cleaned[0] in ("H", "G"):  # helicopter, gyrocopter
        return "heli"
    if len(cleaned) >= 3:
        engine = cleaned[2]
        if engine == "J":
            return "jet"
        if engine == "T":
            return "prop"
        if engine in ("P", "E"):
            return "light"
    return None


def state_to_aircraft(state: list[Any]) -> Aircraft | None:
    """Map an OpenSky state vector to an Aircraft, or None if unusable."""
    if len(state) < 17:
        state = list(state) + [None] * (17 - len(state))
    icao24, callsign = state[0], state[1]
    longitude, latitude = state[5], state[6]
    if latitude is None or longitude is None:
        return None
    on_ground = bool(state[8])
    baro_altitude_m = state[7] if state[7] is not None else state[13]
    velocity_ms = state[9]
    track = state[10]
    vertical_ms = state[11]
    squawk = state[14]
    category = state[17] if len(state) > 17 else None
    return Aircraft(
        id=str(icao24),
        icao24=str(icao24),
        callsign=str(callsign).strip() or None if callsign else None,
        latitude=float(latitude),
        longitude=float(longitude),
        altitude_ft=round(baro_altitude_m * 3.28084) if baro_altitude_m is not None else None,
        ground_speed_kt=round(velocity_ms * 1.94384) if velocity_ms is not None else None,
        track_deg=round(track) % 360 if track is not None else None,
        vertical_rate_fpm=round(vertical_ms * 196.850) if vertical_ms is not None else None,
        on_ground=on_ground,
        emergency=str(squawk) in EMERGENCY_SQUAWKS if squawk else False,
        category=_CATEGORY_MAP.get(category) if isinstance(category, int) else None,
    )
