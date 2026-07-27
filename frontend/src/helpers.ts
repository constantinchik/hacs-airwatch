import type { AirwatchAttributes, Aircraft, FlightMatch, HassEntity, HomeAssistant, ScheduledFlight } from "./types";

export const DEFAULT_ENTITY = "sensor.airwatch_overview";

export function getEntity(hass: HomeAssistant | undefined, entityId?: string): HassEntity | undefined {
  return hass?.states[entityId || DEFAULT_ENTITY];
}

export function getAttributes(entity: HassEntity | undefined): AirwatchAttributes {
  return entity?.attributes ?? {};
}

export function matchForAircraft(matches: FlightMatch[], aircraftId: string): FlightMatch | undefined {
  return matches.find((match) => match.aircraft_id === aircraftId);
}

export function aircraftForFlight(
  aircraft: Aircraft[],
  matches: FlightMatch[],
  flightId: string,
): Aircraft | undefined {
  const match = matches.find((item) => item.flight_id === flightId);
  return match ? aircraft.find((item) => item.id === match.aircraft_id) : undefined;
}

export function sortFlightsByRelevance(flights: ScheduledFlight[]): ScheduledFlight[] {
  const now = Date.now();
  return [...flights].sort((a, b) => Math.abs(timeOf(a) - now) - Math.abs(timeOf(b) - now));
}

export function displayTime(flight: ScheduledFlight): string {
  const value = flight.actual_time || flight.estimated_time || flight.scheduled_time;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

function timeOf(flight: ScheduledFlight): number {
  return new Date(flight.actual_time || flight.estimated_time || flight.scheduled_time).getTime();
}
