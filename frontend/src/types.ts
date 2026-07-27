export interface AirwatchCardConfig {
  type: string;
  entity?: string;
  title?: string;
}

export interface AirwatchListCardConfig extends AirwatchCardConfig {
  mode?: "aircraft" | "schedules";
  show?: "arrivals" | "departures" | "both";
  max_items?: number;
}

export interface HomeAssistant {
  states: Record<string, HassEntity | undefined>;
  callService(domain: string, service: string, data?: Record<string, unknown>): Promise<unknown>;
}

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: AirwatchAttributes & Record<string, unknown>;
}

export interface AirwatchAttributes {
  aircraft?: Aircraft[];
  arrivals?: ScheduledFlight[];
  departures?: ScheduledFlight[];
  matches?: FlightMatch[];
  map?: MapConfig;
  provider_status?: Record<string, unknown>;
  selected_aircraft_id?: string | null;
  selected_flight_id?: string | null;
  last_updated?: string;
}

export interface MapConfig {
  latitude: number;
  longitude: number;
  radius_km: number;
  zoom: number;
}

export interface Aircraft {
  id: string;
  latitude: number;
  longitude: number;
  icao24?: string | null;
  callsign?: string | null;
  registration?: string | null;
  altitude_ft?: number | null;
  ground_speed_kt?: number | null;
  track_deg?: number | null;
  vertical_rate_fpm?: number | null;
  on_ground?: boolean;
  origin?: string | null;
  origin_name?: string | null;
  destination?: string | null;
  destination_name?: string | null;
  updated_at?: string;
}

export interface ScheduledFlight {
  id: string;
  flight_number: string;
  direction: "arrival" | "departure";
  airport: string;
  scheduled_time: string;
  callsign?: string | null;
  estimated_time?: string | null;
  actual_time?: string | null;
  status?: string;
  gate?: string | null;
  terminal?: string | null;
  aircraft_registration?: string | null;
}

export interface FlightMatch {
  aircraft_id: string;
  flight_id: string;
  confidence: number;
  reasons: string[];
}
