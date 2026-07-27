"""The Airwatch integration."""

from __future__ import annotations

from functools import partial

from .const import DOMAIN, SERVICE_CLEAR_SELECTION, SERVICE_SELECT

PLATFORMS = ["sensor"]


async def async_setup_entry(hass, entry) -> bool:
    """Set up Airwatch from a config entry."""
    from .coordinator import AirwatchCoordinator

    coordinator = AirwatchCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator

    if not hass.services.has_service(DOMAIN, SERVICE_SELECT):
        hass.services.async_register(DOMAIN, SERVICE_SELECT, partial(_handle_select_target, hass))
    if not hass.services.has_service(DOMAIN, SERVICE_CLEAR_SELECTION):
        hass.services.async_register(DOMAIN, SERVICE_CLEAR_SELECTION, partial(_handle_clear_selection, hass))

    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass, entry) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def _async_update_listener(hass, entry) -> None:
    """Reload the entry when options change."""
    await hass.config_entries.async_reload(entry.entry_id)


async def _handle_select_target(hass, call) -> None:
    for coordinator in _target_coordinators(hass, call):
        await coordinator.async_select_target(
            aircraft_id=call.data.get("aircraft_id"),
            flight_id=call.data.get("flight_id"),
        )


async def _handle_clear_selection(hass, call) -> None:
    for coordinator in _target_coordinators(hass, call):
        await coordinator.async_clear_selection()


def _target_coordinators(hass, call):
    entry_id = call.data.get("entry_id")
    for entry in hass.config_entries.async_entries(DOMAIN):
        if entry_id and entry.entry_id != entry_id:
            continue
        coordinator = getattr(entry, "runtime_data", None)
        if coordinator is not None:
            yield coordinator
