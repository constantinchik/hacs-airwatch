"""The Airwatch integration."""

from __future__ import annotations

from .const import DOMAIN, SERVICE_CLEAR_SELECTION, SERVICE_SELECT

PLATFORMS = ["sensor"]


async def async_setup_entry(hass, entry) -> bool:
    """Set up Airwatch from a config entry."""
    from .coordinator import AirwatchCoordinator

    coordinator = AirwatchCoordinator(hass, entry)
    await coordinator.async_config_entry_first_refresh()
    entry.runtime_data = coordinator

    if not hass.services.has_service(DOMAIN, SERVICE_SELECT):
        hass.services.async_register(DOMAIN, SERVICE_SELECT, _handle_select_target)
    if not hass.services.has_service(DOMAIN, SERVICE_CLEAR_SELECTION):
        hass.services.async_register(DOMAIN, SERVICE_CLEAR_SELECTION, _handle_clear_selection)

    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass, entry) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def _async_update_listener(hass, entry) -> None:
    """Reload the entry when options change."""
    await hass.config_entries.async_reload(entry.entry_id)


async def _handle_select_target(call) -> None:
    entry_id = call.data.get("entry_id")
    for entry in call.hass.config_entries.async_entries(DOMAIN):
        if entry_id and entry.entry_id != entry_id:
            continue
        await entry.runtime_data.async_select_target(
            aircraft_id=call.data.get("aircraft_id"),
            flight_id=call.data.get("flight_id"),
        )


async def _handle_clear_selection(call) -> None:
    entry_id = call.data.get("entry_id")
    for entry in call.hass.config_entries.async_entries(DOMAIN):
        if entry_id and entry.entry_id != entry_id:
            continue
        await entry.runtime_data.async_clear_selection()
