"""OpenSky Network live-aircraft provider."""

from __future__ import annotations

import logging
import time
from math import cos, radians
from typing import Any

import aiohttp

from ..models import Aircraft, AircraftCategory, ScheduledFlight
from ..provider import AirwatchProvider

_LOGGER = logging.getLogger(__name__)

STATES_URL = "https://opensky-network.org/api/states/all"
TOKEN_URL = (
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token"
)

EMERGENCY_SQUAWKS = {"7500", "7600", "7700"}

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
                        return self._parse_states(await self._read_json(retry))
                return self._parse_states(await self._read_json(resp))
        except (TimeoutError, aiohttp.ClientError) as err:
            raise OpenSkyError(f"OpenSky request failed: {err}") from err

    async def async_get_schedules(self, *, airport_code: str | None) -> list[ScheduledFlight]:
        # Schedules come from airport-website adapters, not OpenSky.
        return []

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
