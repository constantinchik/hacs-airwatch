"""Constants for Airwatch."""

from __future__ import annotations

from typing import Final

DOMAIN: Final = "airwatch"
DEFAULT_NAME: Final = "Airwatch"

CONF_AIRPORT_CODE: Final = "airport_code"
CONF_NAME: Final = "name"
CONF_OPENSKY_CLIENT_ID: Final = "opensky_client_id"
CONF_OPENSKY_CLIENT_SECRET: Final = "opensky_client_secret"
CONF_PROVIDER: Final = "provider"
CONF_RADIUS_KM: Final = "radius_km"
CONF_SCAN_INTERVAL_SECONDS: Final = "scan_interval_seconds"
CONF_ZOOM: Final = "zoom"

DEFAULT_PROVIDER: Final = "opensky"
DEFAULT_RADIUS_KM: Final = 3.0
DEFAULT_SCAN_INTERVAL_SECONDS: Final = 15
DEFAULT_ZOOM: Final = 9

PROVIDER_DEMO: Final = "demo"
PROVIDER_OPENSKY: Final = "opensky"

# OpenSky anonymous access gets 400 API credits/day, authenticated 4000.
# A small bounding box costs 1 credit per call, so clamp polling to fit.
MIN_INTERVAL_OPENSKY_ANON: Final = 240
MIN_INTERVAL_OPENSKY_AUTH: Final = 30

SERVICE_SELECT: Final = "select_target"
SERVICE_CLEAR_SELECTION: Final = "clear_selection"
