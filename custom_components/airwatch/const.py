"""Constants for Airwatch."""

from __future__ import annotations

from typing import Final

DOMAIN: Final = "airwatch"
DEFAULT_NAME: Final = "Airwatch"

CONF_AIRPORT_CODE: Final = "airport_code"
CONF_NAME: Final = "name"
CONF_RADIUS_KM: Final = "radius_km"
CONF_SCAN_INTERVAL_SECONDS: Final = "scan_interval_seconds"
CONF_ZOOM: Final = "zoom"

DEFAULT_RADIUS_KM: Final = 50.0
DEFAULT_SCAN_INTERVAL_SECONDS: Final = 15
DEFAULT_ZOOM: Final = 9

SERVICE_SELECT: Final = "select_target"
SERVICE_CLEAR_SELECTION: Final = "clear_selection"
