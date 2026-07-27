"""Sensor platform for Airwatch."""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DEFAULT_NAME, DOMAIN
from .coordinator import AirwatchConfigEntry, AirwatchCoordinator


async def async_setup_entry(
    hass, entry: AirwatchConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up Airwatch sensors."""
    async_add_entities([AirwatchOverviewSensor(entry.runtime_data)])


class AirwatchOverviewSensor(CoordinatorEntity[AirwatchCoordinator], SensorEntity):
    """Single card-facing overview entity."""

    _attr_has_entity_name = True
    _attr_icon = "mdi:airplane-marker"
    _attr_name = "Overview"
    _attr_translation_key = "overview"

    def __init__(self, coordinator: AirwatchCoordinator) -> None:
        super().__init__(coordinator)
        entry = coordinator.entry
        self._attr_unique_id = f"{entry.entry_id}_overview"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=entry.title or DEFAULT_NAME,
            manufacturer="Airwatch",
            entry_type=DeviceEntryType.SERVICE,
        )

    @property
    def native_value(self) -> int:
        return len(self.coordinator.data.aircraft) if self.coordinator.data else 0

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        if self.coordinator.data is None:
            return {}
        return self.coordinator.data.to_attributes()
