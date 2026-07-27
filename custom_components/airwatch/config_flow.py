"""Config flow for Airwatch."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.const import CONF_LATITUDE, CONF_LONGITUDE
from homeassistant.core import callback
from homeassistant.helpers.selector import (
    LocationSelector,
    LocationSelectorConfig,
    NumberSelector,
    NumberSelectorConfig,
    NumberSelectorMode,
    TextSelector,
    TextSelectorConfig,
)

from .const import (
    CONF_AIRPORT_CODE,
    CONF_NAME,
    CONF_RADIUS_KM,
    CONF_SCAN_INTERVAL_SECONDS,
    CONF_ZOOM,
    DEFAULT_NAME,
    DEFAULT_RADIUS_KM,
    DEFAULT_SCAN_INTERVAL_SECONDS,
    DEFAULT_ZOOM,
    DOMAIN,
)

CONF_LOCATION = "location"


class AirwatchConfigFlow(ConfigFlow, domain=DOMAIN):
    """Collect the map center and airport context."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            location = user_input[CONF_LOCATION]
            title = user_input.get(CONF_NAME) or DEFAULT_NAME
            data = {
                CONF_NAME: title,
                CONF_LATITUDE: float(location[CONF_LATITUDE]),
                CONF_LONGITUDE: float(location[CONF_LONGITUDE]),
                CONF_RADIUS_KM: float(user_input[CONF_RADIUS_KM]),
                CONF_ZOOM: int(user_input[CONF_ZOOM]),
                CONF_AIRPORT_CODE: _clean_airport_code(user_input.get(CONF_AIRPORT_CODE)),
            }
            await self.async_set_unique_id(f"{data[CONF_LATITUDE]:.4f}_{data[CONF_LONGITUDE]:.4f}")
            self._abort_if_unique_id_configured()
            return self.async_create_entry(title=title, data=data)

        return self.async_show_form(step_id="user", data_schema=self._schema())

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> AirwatchOptionsFlow:
        return AirwatchOptionsFlow()

    def _schema(self) -> vol.Schema:
        return vol.Schema(
            {
                vol.Required(CONF_NAME, default=DEFAULT_NAME): str,
                vol.Required(
                    CONF_LOCATION,
                    default={
                        CONF_LATITUDE: self.hass.config.latitude,
                        CONF_LONGITUDE: self.hass.config.longitude,
                    },
                ): LocationSelector(LocationSelectorConfig(radius=False, icon="mdi:airplane-marker")),
                vol.Required(CONF_RADIUS_KM, default=DEFAULT_RADIUS_KM): _number(1, 500, "km"),
                vol.Required(CONF_ZOOM, default=DEFAULT_ZOOM): _number(1, 18, None),
                vol.Optional(CONF_AIRPORT_CODE): TextSelector(TextSelectorConfig()),
            }
        )


class AirwatchOptionsFlow(OptionsFlow):
    """Allow map and polling options to be adjusted after setup."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            data = dict(user_input)
            location = data.pop(CONF_LOCATION)
            data[CONF_LATITUDE] = float(location[CONF_LATITUDE])
            data[CONF_LONGITUDE] = float(location[CONF_LONGITUDE])
            data[CONF_AIRPORT_CODE] = _clean_airport_code(data.get(CONF_AIRPORT_CODE))
            return self.async_create_entry(title="", data=data)

        entry = self.config_entry
        opts = entry.options
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_LOCATION,
                        default={
                            CONF_LATITUDE: opts.get(CONF_LATITUDE, entry.data[CONF_LATITUDE]),
                            CONF_LONGITUDE: opts.get(CONF_LONGITUDE, entry.data[CONF_LONGITUDE]),
                        },
                    ): LocationSelector(LocationSelectorConfig(radius=False, icon="mdi:airplane-marker")),
                    vol.Required(
                        CONF_RADIUS_KM,
                        default=opts.get(CONF_RADIUS_KM, entry.data.get(CONF_RADIUS_KM, DEFAULT_RADIUS_KM)),
                    ): _number(1, 500, "km"),
                    vol.Required(
                        CONF_ZOOM,
                        default=opts.get(CONF_ZOOM, entry.data.get(CONF_ZOOM, DEFAULT_ZOOM)),
                    ): _number(1, 18, None),
                    vol.Required(
                        CONF_SCAN_INTERVAL_SECONDS,
                        default=opts.get(CONF_SCAN_INTERVAL_SECONDS, DEFAULT_SCAN_INTERVAL_SECONDS),
                    ): _number(5, 600, "s"),
                    vol.Optional(
                        CONF_AIRPORT_CODE,
                        default=opts.get(CONF_AIRPORT_CODE, entry.data.get(CONF_AIRPORT_CODE, "")),
                    ): TextSelector(TextSelectorConfig()),
                }
            ),
        )


def _number(minimum: int, maximum: int, unit: str | None) -> NumberSelector:
    return NumberSelector(
        NumberSelectorConfig(
            min=minimum,
            max=maximum,
            step=1,
            unit_of_measurement=unit,
            mode=NumberSelectorMode.BOX,
        )
    )


def _clean_airport_code(value: object) -> str | None:
    cleaned = str(value or "").strip().upper()
    return cleaned or None
