import leafletCss from "leaflet/dist/leaflet.css?inline";
import * as L from "leaflet";
import type { Map as LeafletMap, Marker } from "leaflet";
import { LitElement, css, html, unsafeCSS, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  aircraftForFlight,
  DEFAULT_ENTITY,
  displayTime,
  getAttributes,
  getEntity,
  matchForAircraft,
  sortFlightsByRelevance,
} from "./helpers";
import type {
  Aircraft,
  AirwatchCardConfig,
  AirwatchListCardConfig,
  FlightMatch,
  HomeAssistant,
  ScheduledFlight,
} from "./types";

const VERSION = "0.1.0";

@customElement("airwatch-map-card")
export class AirwatchMapCard extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config: AirwatchCardConfig = { type: "custom:airwatch-map-card", entity: DEFAULT_ENTITY };
  @state() private _paused = false;
  private _map?: LeafletMap;
  private _markers = new Map<string, Marker>();
  private _resizeObserver?: ResizeObserver;
  private _fittedView?: string;

  public setConfig(config: AirwatchCardConfig): void {
    this._config = { entity: DEFAULT_ENTITY, ...config };
  }

  public static getStubConfig(): AirwatchCardConfig {
    return { type: "custom:airwatch-map-card", entity: DEFAULT_ENTITY };
  }

  public getCardSize(): number {
    return 6;
  }

  protected firstUpdated(): void {
    this._ensureMap();
  }

  protected updated(): void {
    this._ensureMap();
    if (!this._paused) this._renderMarkers();
  }

  public override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resizeObserver?.disconnect();
    this._resizeObserver = undefined;
    this._map?.remove();
    this._map = undefined;
    this._markers.clear();
  }

  protected render(): TemplateResult {
    const entity = getEntity(this.hass, this._config.entity);
    const attrs = getAttributes(entity);
    const count = attrs.aircraft?.length ?? 0;
    const selected = attrs.selected_aircraft_id;

    const plane = attrs.aircraft?.find((item) => item.id === selected);
    const label = plane ? plane.callsign || plane.registration || plane.id : null;

    return html`
      <ha-card>
        <header>
          <div>
            <h2>${this._config.title || "Airwatch Map"}</h2>
            <p>${count} aircraft nearby${label ? ` · ${label}` : ""}${this._paused ? " · paused" : ""}</p>
          </div>
          <button @click=${this._togglePause}>${this._paused ? "Resume" : "Pause"}</button>
        </header>
        <div id="map" class="map"></div>
        ${!entity ? html`<div class="empty">Configure the Airwatch overview entity.</div>` : null}
      </ha-card>
    `;
  }

  private _togglePause(): void {
    this._paused = !this._paused;
    if (!this._paused) this._renderMarkers();
  }

  private _ensureMap(): void {
    if (this._map) return;
    const container = this.renderRoot.querySelector<HTMLDivElement>("#map");
    if (!container) return;
    const attrs = getAttributes(getEntity(this.hass, this._config.entity));
    const center: [number, number] = [attrs.map?.latitude ?? 0, attrs.map?.longitude ?? 0];
    this._map = L.map(container, {
      zoomControl: false,
      dragging: false,
      touchZoom: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
    }).setView(center, attrs.map?.zoom ?? 9);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(this._map);
    this._resizeObserver = new ResizeObserver(() => {
      this._map?.invalidateSize();
      this._fitView(true);
    });
    this._resizeObserver.observe(container);
    this._renderMarkers();
  }

  private _renderMarkers(): void {
    if (!this._map) return;
    const attrs = getAttributes(getEntity(this.hass, this._config.entity));
    const aircraft = attrs.aircraft ?? [];
    const selected = attrs.selected_aircraft_id;
    const seen = new Set<string>();

    this._fitView();

    for (const plane of aircraft) {
      seen.add(plane.id);
      const marker = this._markers.get(plane.id) ?? this._createMarker(plane);
      marker.setLatLng([plane.latitude, plane.longitude]);
      marker.setIcon(aircraftIcon(plane, plane.id === selected));
      marker.bindTooltip(labelForAircraft(plane));
    }

    for (const [id, marker] of this._markers) {
      if (!seen.has(id)) {
        marker.remove();
        this._markers.delete(id);
      }
    }
  }

  private _fitView(force = false): void {
    const map = getAttributes(getEntity(this.hass, this._config.entity)).map;
    if (!this._map || !map) return;
    const key = `${map.latitude},${map.longitude},${map.radius_km},${map.zoom}`;
    if (!force && key === this._fittedView) return;
    this._fittedView = key;
    if (map.radius_km) {
      this._map.fitBounds(L.latLng(map.latitude, map.longitude).toBounds(map.radius_km * 2000), {
        animate: false,
      });
    } else {
      this._map.setView([map.latitude, map.longitude], map.zoom, { animate: false });
    }
  }

  private _createMarker(plane: Aircraft): Marker {
    const marker = L.marker([plane.latitude, plane.longitude], { icon: aircraftIcon(plane, false) }).addTo(this._map!);
    marker.on("click", () => this._selectAircraft(plane));
    this._markers.set(plane.id, marker);
    return marker;
  }

  private async _selectAircraft(plane: Aircraft): Promise<void> {
    const attrs = getAttributes(getEntity(this.hass, this._config.entity));
    if (attrs.selected_aircraft_id === plane.id) {
      await this.hass?.callService("airwatch", "clear_selection");
      return;
    }
    const match = matchForAircraft(attrs.matches ?? [], plane.id);
    await this.hass?.callService("airwatch", "select_target", {
      aircraft_id: plane.id,
      flight_id: match?.flight_id,
    });
  }

  static override get styles() {
    return [unsafeCSS(leafletCss), cardStyles()];
  }
}

@customElement("airwatch-list-card")
export class AirwatchListCard extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;
  @state() private _config: AirwatchListCardConfig = {
    type: "custom:airwatch-list-card",
    entity: DEFAULT_ENTITY,
    mode: "aircraft",
    show: "both",
    max_items: 8,
  };

  public setConfig(config: AirwatchListCardConfig): void {
    this._config = { entity: DEFAULT_ENTITY, mode: "aircraft", show: "both", max_items: 8, ...config };
  }

  public static getStubConfig(): AirwatchListCardConfig {
    return { type: "custom:airwatch-list-card", entity: DEFAULT_ENTITY, mode: "aircraft" };
  }

  public getCardSize(): number {
    return 5;
  }

  protected render(): TemplateResult {
    const attrs = getAttributes(getEntity(this.hass, this._config.entity));
    const aircraft = attrs.aircraft ?? [];
    const matches = attrs.matches ?? [];
    const mode = this._config.mode ?? "aircraft";

    return html`
      <ha-card>
        <header>
          <div>
            <h2>${this._config.title || (mode === "aircraft" ? "Nearby Aircraft" : "Airport Schedule")}</h2>
            <p>${attrs.last_updated ? `Updated ${new Date(attrs.last_updated).toLocaleTimeString()}` : "Waiting for data"}</p>
          </div>
        </header>
        ${mode === "aircraft"
          ? this._renderAircraftList(aircraft, attrs.selected_aircraft_id ?? null)
          : html`
              ${this._config.show !== "departures"
                ? this._renderSection("Arrivals", attrs.arrivals ?? [], aircraft, matches, attrs.selected_flight_id ?? null)
                : null}
              ${this._config.show !== "arrivals"
                ? this._renderSection("Departures", attrs.departures ?? [], aircraft, matches, attrs.selected_flight_id ?? null)
                : null}
            `}
      </ha-card>
    `;
  }

  private _renderAircraftList(aircraft: Aircraft[], selectedId: string | null): TemplateResult {
    const sorted = [...aircraft].sort((a, b) => Number(a.on_ground ?? false) - Number(b.on_ground ?? false));
    return html`
      <section class="list">
        ${sorted.length
          ? sorted.slice(0, this._config.max_items).map((plane) => this._renderAircraft(plane, plane.id === selectedId))
          : html`<div class="empty">No aircraft in range.</div>`}
      </section>
    `;
  }

  private _renderAircraft(plane: Aircraft, selected: boolean): TemplateResult {
    const name = plane.callsign || plane.registration || plane.icao24 || plane.id;
    const status = plane.on_ground
      ? "on ground"
      : plane.altitude_ft
        ? `${plane.altitude_ft.toLocaleString()} ft`
        : "airborne";
    return html`
      <button class="row ${selected ? "selected" : ""}" @click=${() => this._selectAircraft(plane, selected)}>
        <span class="row-main">
          <span class="ident">
            <strong>${name}</strong>
            <small>${status}</small>
          </span>
          ${renderRoute(plane.origin, plane.destination)}
          <span class="meta">${plane.ground_speed_kt ? `${plane.ground_speed_kt} kt` : ""}</span>
        </span>
        ${selected ? renderAircraftDetails(plane) : null}
      </button>
    `;
  }

  private async _selectAircraft(plane: Aircraft, selected: boolean): Promise<void> {
    if (selected) {
      await this.hass?.callService("airwatch", "clear_selection");
      return;
    }
    const attrs = getAttributes(getEntity(this.hass, this._config.entity));
    const match = matchForAircraft(attrs.matches ?? [], plane.id);
    await this.hass?.callService("airwatch", "select_target", {
      aircraft_id: plane.id,
      flight_id: match?.flight_id,
    });
  }

  private _renderSection(
    title: string,
    flights: ScheduledFlight[],
    aircraft: Aircraft[],
    matches: FlightMatch[],
    selectedId: string | null,
  ): TemplateResult {
    const sorted = sortFlightsByRelevance(flights).slice(0, this._config.max_items);
    return html`
      <section>
        <h3>${title}</h3>
        ${sorted.length
          ? sorted.map((flight) =>
              this._renderFlight(flight, aircraftForFlight(aircraft, matches, flight.id), flight.id === selectedId),
            )
          : html`<div class="empty">No ${title.toLowerCase()} available.</div>`}
      </section>
    `;
  }

  private _renderFlight(flight: ScheduledFlight, aircraft: Aircraft | undefined, selected: boolean): TemplateResult {
    return html`
      <button class="row ${selected ? "selected" : ""}" @click=${() => this._selectFlight(flight, aircraft, selected)}>
        <span class="row-main flight">
          <span class="time">${displayTime(flight)}</span>
          <span class="ident">
            <strong>${flight.flight_number}</strong>
            <small>${flight.status || "unknown"}${aircraft ? " · live" : ""}</small>
          </span>
          <span class="meta">${flight.terminal ? `T${flight.terminal}` : ""}${flight.gate ? ` · ${flight.gate}` : ""}</span>
        </span>
        ${selected ? renderFlightDetails(flight, aircraft) : null}
      </button>
    `;
  }

  private async _selectFlight(flight: ScheduledFlight, aircraft: Aircraft | undefined, selected: boolean): Promise<void> {
    if (selected) {
      await this.hass?.callService("airwatch", "clear_selection");
      return;
    }
    await this.hass?.callService("airwatch", "select_target", {
      flight_id: flight.id,
      aircraft_id: aircraft?.id,
    });
  }

  static override get styles() {
    return cardStyles();
  }
}

function aircraftIcon(plane: Aircraft, selected: boolean): L.DivIcon {
  const rotation = plane.track_deg ?? 0;
  const classes = ["airwatch-marker", selected ? "selected" : "", plane.on_ground ? "grounded" : ""]
    .filter(Boolean)
    .join(" ");
  return L.divIcon({
    className: classes,
    html: `<div style="transform: rotate(${rotation}deg)">✈</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function labelForAircraft(plane: Aircraft): string {
  const name = plane.callsign || plane.registration || plane.icao24 || plane.id;
  const route = plane.origin && plane.destination ? ` · ${plane.origin} to ${plane.destination}` : "";
  const altitude = plane.on_ground
    ? " · on ground"
    : plane.altitude_ft
      ? ` · ${plane.altitude_ft.toLocaleString()} ft`
      : "";
  return `${name}${route}${altitude}`;
}

function renderRoute(origin?: string | null, destination?: string | null): TemplateResult {
  return html`
    <span class="route">
      <span>${origin || "···"}</span>
      <svg class="route-arrow" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 12h14m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span>${destination || "···"}</span>
    </span>
  `;
}

function renderAircraftDetails(plane: Aircraft): TemplateResult {
  const items: Array<[string, string]> = [];
  if (plane.altitude_ft != null) {
    items.push(["Altitude", plane.on_ground ? "On ground" : `${plane.altitude_ft.toLocaleString()} ft`]);
  }
  if (plane.ground_speed_kt != null) {
    items.push(["Speed", `${plane.ground_speed_kt} kt · ${Math.round(plane.ground_speed_kt * 1.852)} km/h`]);
  }
  if (plane.track_deg != null) items.push(["Heading", `${plane.track_deg}°`]);
  if (plane.vertical_rate_fpm) {
    items.push(["Vertical", `${plane.vertical_rate_fpm > 0 ? "+" : ""}${plane.vertical_rate_fpm} fpm`]);
  }
  if (plane.registration) items.push(["Registration", plane.registration]);
  if (plane.icao24) items.push(["ICAO24", plane.icao24.toUpperCase()]);
  return html`${renderRouteDetails(plane)}${renderDetails(items)}`;
}

function renderRouteDetails(plane: Aircraft): TemplateResult | null {
  if (!plane.origin && !plane.destination) return null;
  return html`
    <span class="details-route">
      ${renderEndpoint("From", plane.origin, plane.origin_name)}
      <svg class="route-arrow" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 12h14m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      ${renderEndpoint("To", plane.destination, plane.destination_name, true)}
    </span>
  `;
}

function renderEndpoint(label: string, code?: string | null, name?: string | null, end = false): TemplateResult {
  return html`
    <span class="endpoint ${end ? "end" : ""}">
      <small>${label}</small>
      <span class="airport-name">${name || code || "Unknown"}</span>
      ${name && code ? html`<span class="airport-code">${code}</span>` : null}
    </span>
  `;
}

function renderFlightDetails(flight: ScheduledFlight, aircraft?: Aircraft): TemplateResult {
  const items: Array<[string, string]> = [["Scheduled", formatClock(flight.scheduled_time)]];
  if (flight.estimated_time) items.push(["Estimated", formatClock(flight.estimated_time)]);
  if (flight.actual_time) items.push(["Actual", formatClock(flight.actual_time)]);
  if (flight.terminal) items.push(["Terminal", flight.terminal]);
  if (flight.gate) items.push(["Gate", flight.gate]);
  if (aircraft) items.push(["Live aircraft", aircraft.callsign || aircraft.registration || aircraft.id]);
  return renderDetails(items);
}

function renderDetails(items: Array<[string, string]>): TemplateResult {
  return html`
    <span class="details">
      ${items.map(([label, value]) => html`<span class="detail"><small>${label}</small>${value}</span>`)}
    </span>
  `;
}

function formatClock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

function cardStyles() {
  return css`
  :host {
    display: block;
  }

  ha-card {
    overflow: hidden;
    background: var(--ha-card-background, var(--card-background-color));
    color: var(--primary-text-color);
  }

  header {
    align-items: center;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 16px 10px;
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    font-size: 18px;
    font-weight: 650;
  }

  h3 {
    color: var(--secondary-text-color);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 16px 16px 8px;
    text-transform: uppercase;
  }

  p,
  small,
  .empty,
  .meta {
    color: var(--secondary-text-color);
  }

  button {
    border: 0;
    cursor: pointer;
    font: inherit;
  }

  header button {
    background: var(--secondary-background-color);
    border-radius: 999px;
    color: var(--primary-text-color);
    padding: 7px 12px;
  }

  .map {
    height: min(56vh, 520px);
    min-height: 320px;
  }

  .list {
    padding-bottom: 4px;
  }

  .row {
    background: transparent;
    border-top: 1px solid var(--divider-color);
    color: var(--primary-text-color);
    display: block;
    padding: 12px 16px;
    text-align: left;
    transition: background 0.15s ease;
    width: 100%;
  }

  .row:hover {
    background: var(--secondary-background-color);
  }

  .row.selected {
    background: rgba(3, 169, 244, 0.08);
    box-shadow: inset 3px 0 0 var(--primary-color, #03a9f4);
  }

  .row-main {
    align-items: center;
    display: grid;
    gap: 12px;
    grid-template-columns: minmax(90px, 1fr) auto minmax(48px, auto);
  }

  .row-main.flight {
    grid-template-columns: 58px 1fr auto;
  }

  .ident {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .route {
    align-items: center;
    display: inline-flex;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    gap: 6px;
    letter-spacing: 0.02em;
  }

  .route-arrow {
    color: var(--secondary-text-color);
    height: 14px;
    width: 14px;
  }

  .meta {
    justify-self: end;
    text-align: right;
  }

  .time {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  .details-route {
    align-items: center;
    border-top: 1px solid var(--divider-color);
    display: grid;
    gap: 12px;
    grid-template-columns: 1fr auto 1fr;
    margin-top: 12px;
    padding-top: 12px;
  }

  .details-route .route-arrow {
    height: 18px;
    width: 18px;
  }

  .endpoint {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .endpoint.end {
    align-items: flex-end;
    text-align: right;
  }

  .endpoint small {
    color: var(--secondary-text-color);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .airport-name {
    font-weight: 650;
    line-height: 1.25;
  }

  .airport-code {
    color: var(--secondary-text-color);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .details {
    display: grid;
    gap: 10px 14px;
    grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
    margin-top: 12px;
  }

  .detail {
    display: flex;
    flex-direction: column;
    font-weight: 600;
    gap: 2px;
  }

  .detail small {
    color: var(--secondary-text-color);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .empty {
    padding: 12px 16px 18px;
  }

  .airwatch-marker {
    align-items: center;
    background: var(--primary-color, #03a9f4);
    border: 2px solid white;
    border-radius: 999px;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.28);
    color: white;
    display: flex;
    font-size: 16px;
    height: 28px;
    justify-content: center;
    width: 28px;
  }

  .airwatch-marker.grounded {
    background: #78909c;
  }

  .airwatch-marker.selected {
    background: #ff9800;
    transform: scale(1.18);
  }
`;
}

declare global {
  interface HTMLElementTagNameMap {
    "airwatch-map-card": AirwatchMapCard;
    "airwatch-list-card": AirwatchListCard;
  }

  interface Window {
    customCards?: Array<{ type: string; name: string; description: string; preview?: boolean }>;
  }
}

window.customCards = window.customCards ?? [];
window.customCards.push(
  {
    type: "airwatch-map-card",
    name: "Airwatch Map Card",
    description: "Live aircraft map for Airwatch.",
    preview: true,
  },
  {
    type: "airwatch-list-card",
    name: "Airwatch List Card",
    description: "Arrival and departure tiles for Airwatch.",
    preview: true,
  },
);

console.info(
  `%c AIRWATCH-CARDS %c v${VERSION} `,
  "color:#fff;background:#0f766e;padding:2px 6px;border-radius:3px 0 0 3px;font-weight:700",
  "color:#0f766e;background:#fff;padding:2px 6px;border-radius:0 3px 3px 0;border:1px solid #0f766e",
);
