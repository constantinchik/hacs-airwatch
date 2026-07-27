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
  private _map?: LeafletMap;
  private _markers = new Map<string, Marker>();
  private _resizeObserver?: ResizeObserver;

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
    this._renderMarkers();
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

    return html`
      <ha-card>
        <header>
          <div>
            <h2>${this._config.title || "Airwatch Map"}</h2>
            <p>${count} aircraft nearby${selected ? ` · selected ${selected}` : ""}</p>
          </div>
          <button @click=${this._clearSelection}>Clear</button>
        </header>
        <div id="map" class="map"></div>
        ${!entity ? html`<div class="empty">Configure the Airwatch overview entity.</div>` : null}
      </ha-card>
    `;
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
    this._resizeObserver = new ResizeObserver(() => this._map?.invalidateSize());
    this._resizeObserver.observe(container);
    this._renderMarkers();
  }

  private _renderMarkers(): void {
    if (!this._map) return;
    const attrs = getAttributes(getEntity(this.hass, this._config.entity));
    const aircraft = attrs.aircraft ?? [];
    const selected = attrs.selected_aircraft_id;
    const seen = new Set<string>();

    if (attrs.map) {
      this._map.setView([attrs.map.latitude, attrs.map.longitude], attrs.map.zoom);
    }

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

  private _createMarker(plane: Aircraft): Marker {
    const marker = L.marker([plane.latitude, plane.longitude], { icon: aircraftIcon(plane, false) }).addTo(this._map!);
    marker.on("click", () => this._selectAircraft(plane));
    this._markers.set(plane.id, marker);
    return marker;
  }

  private async _selectAircraft(plane: Aircraft): Promise<void> {
    const attrs = getAttributes(getEntity(this.hass, this._config.entity));
    const match = matchForAircraft(attrs.matches ?? [], plane.id);
    await this.hass?.callService("airwatch", "select_target", {
      aircraft_id: plane.id,
      flight_id: match?.flight_id,
    });
  }

  private async _clearSelection(): Promise<void> {
    await this.hass?.callService("airwatch", "clear_selection");
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
    show: "both",
    max_items: 8,
  };

  public setConfig(config: AirwatchListCardConfig): void {
    this._config = { entity: DEFAULT_ENTITY, show: "both", max_items: 8, ...config };
  }

  public static getStubConfig(): AirwatchListCardConfig {
    return { type: "custom:airwatch-list-card", entity: DEFAULT_ENTITY, show: "both" };
  }

  public getCardSize(): number {
    return 5;
  }

  protected render(): TemplateResult {
    const attrs = getAttributes(getEntity(this.hass, this._config.entity));
    const aircraft = attrs.aircraft ?? [];
    const matches = attrs.matches ?? [];
    const selectedAircraft = aircraft.find((item) => item.id === attrs.selected_aircraft_id);
    const selectedFlight = [...(attrs.arrivals ?? []), ...(attrs.departures ?? [])].find(
      (item) => item.id === attrs.selected_flight_id,
    );

    return html`
      <ha-card>
        <header>
          <div>
            <h2>${this._config.title || "Airwatch Flights"}</h2>
            <p>${attrs.last_updated ? `Updated ${new Date(attrs.last_updated).toLocaleTimeString()}` : "Waiting for data"}</p>
          </div>
        </header>
        ${this._renderSelected(selectedAircraft, selectedFlight)}
        ${this._config.show !== "departures"
          ? this._renderSection("Arrivals", attrs.arrivals ?? [], aircraft, matches)
          : null}
        ${this._config.show !== "arrivals"
          ? this._renderSection("Departures", attrs.departures ?? [], aircraft, matches)
          : null}
      </ha-card>
    `;
  }

  private _renderSelected(aircraft?: Aircraft, flight?: ScheduledFlight): TemplateResult | null {
    if (!aircraft && !flight) return null;
    return html`
      <section class="selected">
        <span class="eyebrow">Selected</span>
        <strong>${flight?.flight_number || aircraft?.callsign || aircraft?.registration || aircraft?.id}</strong>
        <span>${aircraft ? labelForAircraft(aircraft) : "Scheduled flight"}</span>
      </section>
    `;
  }

  private _renderSection(
    title: string,
    flights: ScheduledFlight[],
    aircraft: Aircraft[],
    matches: FlightMatch[],
  ): TemplateResult {
    const sorted = sortFlightsByRelevance(flights).slice(0, this._config.max_items);
    return html`
      <section>
        <h3>${title}</h3>
        ${sorted.length
          ? sorted.map((flight) => this._renderFlight(flight, aircraftForFlight(aircraft, matches, flight.id)))
          : html`<div class="empty">No ${title.toLowerCase()} available.</div>`}
      </section>
    `;
  }

  private _renderFlight(flight: ScheduledFlight, aircraft?: Aircraft): TemplateResult {
    return html`
      <button class="flight" @click=${() => this._selectFlight(flight, aircraft)}>
        <span class="time">${displayTime(flight)}</span>
        <span class="main">
          <strong>${flight.flight_number}</strong>
          <small>${flight.status || "unknown"}${aircraft ? " · live" : ""}</small>
        </span>
        <span class="meta">${flight.terminal ? `T${flight.terminal}` : ""}${flight.gate ? ` · ${flight.gate}` : ""}</span>
      </button>
    `;
  }

  private async _selectFlight(flight: ScheduledFlight, aircraft?: Aircraft): Promise<void> {
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
  return L.divIcon({
    className: selected ? "airwatch-marker selected" : "airwatch-marker",
    html: `<div style="transform: rotate(${rotation}deg)">✈</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function labelForAircraft(plane: Aircraft): string {
  const name = plane.callsign || plane.registration || plane.icao24 || plane.id;
  const route = plane.origin && plane.destination ? ` · ${plane.origin} to ${plane.destination}` : "";
  const altitude = plane.altitude_ft ? ` · ${plane.altitude_ft.toLocaleString()} ft` : "";
  return `${name}${route}${altitude}`;
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
  .meta,
  .selected span {
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

  .selected {
    background: linear-gradient(135deg, rgba(3, 169, 244, 0.16), rgba(63, 81, 181, 0.14));
    border: 1px solid rgba(3, 169, 244, 0.24);
    border-radius: 18px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 6px 16px 4px;
    padding: 14px;
  }

  .eyebrow {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .flight {
    align-items: center;
    background: transparent;
    border-top: 1px solid var(--divider-color);
    color: var(--primary-text-color);
    display: grid;
    gap: 12px;
    grid-template-columns: 58px 1fr auto;
    padding: 12px 16px;
    text-align: left;
    width: 100%;
  }

  .flight:hover {
    background: var(--secondary-background-color);
  }

  .time {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  .main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
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
