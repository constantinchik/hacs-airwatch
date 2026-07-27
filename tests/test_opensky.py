"""Tests for OpenSky state-vector mapping."""

from __future__ import annotations

from custom_components.airwatch.providers.opensky import state_to_aircraft


def _vector(overrides: dict[int, object] | None = None):
    state = [
        "c06abc",  # 0 icao24
        "POE456  ",  # 1 callsign (padded, as OpenSky sends it)
        "Canada",  # 2 origin_country
        1750000000,  # 3 time_position
        1750000001,  # 4 last_contact
        -79.396,  # 5 longitude
        43.627,  # 6 latitude
        1524.0,  # 7 baro_altitude (m)
        False,  # 8 on_ground
        92.6,  # 9 velocity (m/s)
        132.4,  # 10 true_track
        -3.25,  # 11 vertical_rate (m/s)
        None,  # 12 sensors
        1580.0,  # 13 geo_altitude
        "1200",  # 14 squawk
        False,  # 15 spi
        0,  # 16 position_source
        4,  # 17 category (extended=1)
    ]
    for index, value in (overrides or {}).items():
        state[index] = value
    return state


def test_maps_full_state_vector() -> None:
    plane = state_to_aircraft(_vector())

    assert plane is not None
    assert plane.id == "c06abc"
    assert plane.callsign == "POE456"
    assert plane.latitude == 43.627
    assert plane.longitude == -79.396
    assert plane.altitude_ft == 5000
    assert plane.ground_speed_kt == 180
    assert plane.track_deg == 132
    assert plane.vertical_rate_fpm == -640
    assert plane.on_ground is False
    assert plane.emergency is False
    assert plane.category == "jet"


def test_category_mapping() -> None:
    assert state_to_aircraft(_vector({17: 8})).category == "heli"
    assert state_to_aircraft(_vector({17: 2})).category == "light"
    assert state_to_aircraft(_vector({17: 3})).category == "prop"
    assert state_to_aircraft(_vector({17: 0})).category is None


def test_emergency_squawk() -> None:
    assert state_to_aircraft(_vector({14: "7700"})).emergency is True
    assert state_to_aircraft(_vector({14: None})).emergency is False


def test_drops_positionless_state() -> None:
    assert state_to_aircraft(_vector({5: None, 6: None})) is None


def test_handles_short_vector_without_category() -> None:
    plane = state_to_aircraft(_vector()[:17])

    assert plane is not None
    assert plane.category is None


def test_falls_back_to_geo_altitude_and_blank_callsign() -> None:
    plane = state_to_aircraft(_vector({1: "        ", 7: None}))

    assert plane is not None
    assert plane.callsign is None
    assert plane.altitude_ft == 5184


def test_class_to_category() -> None:
    from custom_components.airwatch.providers.opensky import class_to_category

    assert class_to_category("H1T") == "heli"
    assert class_to_category("H2T") == "heli"
    assert class_to_category("G1P") == "heli"
    assert class_to_category("L2J") == "jet"
    assert class_to_category("L2T") == "prop"
    assert class_to_category("L1P") == "light"
    assert class_to_category("L1E") == "light"
    assert class_to_category("") is None
    assert class_to_category(None) is None
    assert class_to_category("L2") is None
