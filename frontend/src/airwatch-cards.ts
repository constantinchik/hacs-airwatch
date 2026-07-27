import leafletCss from "leaflet/dist/leaflet.css?inline";
import * as L from "leaflet";
import type { Map as LeafletMap, Marker } from "leaflet";
import { LitElement, css, html, unsafeCSS, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { aircraftShape, aircraftTypeName } from "./aircraft-icons";
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
  private _baseline = new Map<string, Aircraft>();
  private _baselineTime = 0;
  private _dataStamp?: string;
  private _selStamp: string | null = null;
  private _animTimer?: number;
  private _flownLine?: L.Polyline;
  private _aheadLine?: L.Polyline;

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
    if (this._animTimer !== undefined) {
      clearInterval(this._animTimer);
      this._animTimer = undefined;
    }
    this._map?.remove();
    this._map = undefined;
    this._markers.clear();
    this._flownLine = undefined;
    this._aheadLine = undefined;
    this._dataStamp = undefined;
    this._selStamp = null;
    this._baselineTime = 0;
  }

  protected render(): TemplateResult {
    const entity = getEntity(this.hass, this._config.entity);
    const attrs = getAttributes(entity);
    const count = attrs.aircraft?.length ?? 0;
    const selected = attrs.selected_aircraft_id;

    const plane = attrs.aircraft?.find((item) => item.id === selected);
    const label = plane ? plane.callsign || plane.registration || plane.id : null;

    return html`
      <ha-card class="palette-${this._config.palette || "industry"}">
        <header>
          <div>
            <h2>${this._config.title || "Airwatch Map"}</h2>
            <p>
              ${entity && entity.state === "unavailable"
                ? "Provider unavailable — check Home Assistant logs"
                : `${count} aircraft nearby${label ? ` · ${label}` : ""}${this._paused ? " · paused" : ""}`}
            </p>
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
    this._animTimer = window.setInterval(() => this._animate(), 1000);
    this._renderMarkers();
  }

  private _renderMarkers(): void {
    if (!this._map) return;
    const attrs = getAttributes(getEntity(this.hass, this._config.entity));
    const aircraft = attrs.aircraft ?? [];
    const selected = attrs.selected_aircraft_id ?? null;
    const dataChanged = attrs.last_updated !== this._dataStamp;
    const selectionChanged = selected !== this._selStamp;

    this._fitView();
    if (!dataChanged && !selectionChanged) return;
    this._dataStamp = attrs.last_updated;
    this._selStamp = selected;

    const seen = new Set<string>();
    for (const plane of aircraft) {
      seen.add(plane.id);
      const marker = this._markers.get(plane.id) ?? this._createMarker(plane);
      if (dataChanged) {
        marker.setLatLng([plane.latitude, plane.longitude]);
        marker.bindTooltip(labelForAircraft(plane));
      }
      this._syncMarkerIcon(marker, plane, plane.id === selected);
    }

    for (const [id, marker] of this._markers) {
      if (!seen.has(id)) {
        marker.remove();
        this._markers.delete(id);
      }
    }

    if (dataChanged) {
      this._baseline = new Map(aircraft.map((plane) => [plane.id, plane]));
      this._baselineTime = Date.now();
    }
    const plane = (selected && this._baseline.get(selected)) || aircraft.find((p) => p.id === selected);
    this._updateRouteLines(plane, plane ? projectPosition(plane, this._elapsedSeconds()) : undefined);
  }

  private _syncMarkerIcon(marker: Marker, plane: Aircraft, selected: boolean): void {
    const shapeKey = `${plane.type_code ?? ""}|${plane.category ?? ""}`;
    const el = marker.getElement();
    if (!el || el.dataset.shape !== shapeKey) {
      marker.setIcon(aircraftIcon(plane, selected));
      const fresh = marker.getElement();
      if (fresh) fresh.dataset.shape = shapeKey;
      return;
    }
    el.classList.toggle("selected", selected);
    el.classList.toggle("grounded", Boolean(plane.on_ground));
    el.classList.toggle("emergency", Boolean(plane.emergency));
    const shape = el.querySelector<HTMLElement>(".plane-shape");
    if (shape) shape.style.transform = `rotate(${plane.track_deg ?? 0}deg)`;
  }

  private _elapsedSeconds(): number {
    if (!this._baselineTime) return 0;
    return Math.min((Date.now() - this._baselineTime) / 1000, 120);
  }

  private _animate(): void {
    if (!this._map || this._paused || !this._baselineTime) return;
    const elapsed = this._elapsedSeconds();
    for (const [id, marker] of this._markers) {
      const plane = this._baseline.get(id);
      if (!plane) continue;
      const position = projectPosition(plane, elapsed);
      marker.setLatLng(position);
      if (id === this._selStamp) this._updateRouteLines(plane, position);
    }
  }

  private _updateRouteLines(plane?: Aircraft, position?: [number, number]): void {
    if (!this._map || !plane) {
      this._flownLine?.remove();
      this._flownLine = undefined;
      this._aheadLine?.remove();
      this._aheadLine = undefined;
      return;
    }
    const current = position ?? [plane.latitude, plane.longitude];
    const flown =
      plane.origin_latitude != null && plane.origin_longitude != null
        ? greatCircle([plane.origin_latitude, plane.origin_longitude], current)
        : null;
    const ahead =
      plane.destination_latitude != null && plane.destination_longitude != null
        ? greatCircle(current, [plane.destination_latitude, plane.destination_longitude])
        : null;
    this._flownLine = this._syncLine(this._flownLine, flown, "aw-route flown");
    this._aheadLine = this._syncLine(this._aheadLine, ahead, "aw-route ahead");
  }

  private _syncLine(
    line: L.Polyline | undefined,
    points: [number, number][] | null,
    className: string,
  ): L.Polyline | undefined {
    if (!points) {
      line?.remove();
      return undefined;
    }
    if (line) {
      line.setLatLngs(points);
      return line;
    }
    return L.polyline(points, { className, interactive: false }).addTo(this._map!);
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
            <p>
              ${getEntity(this.hass, this._config.entity)?.state === "unavailable"
                ? "Provider unavailable — check Home Assistant logs"
                : attrs.last_updated
                  ? `Updated ${new Date(attrs.last_updated).toLocaleTimeString()}`
                  : "Waiting for data"}
            </p>
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
  const shape = aircraftShape(plane.type_code, plane.category);
  const classes = [
    "airwatch-marker",
    selected ? "selected" : "",
    plane.on_ground ? "grounded" : "",
    plane.emergency ? "emergency" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return L.divIcon({
    className: classes,
    html: `<div class="plane-shape" style="transform: rotate(${rotation}deg)"><svg viewBox="${shape.vb}" style="overflow:visible"><circle class="halo" cx="0" cy="0" r="${shape.haloR}" vector-effect="non-scaling-stroke"/><path d="${shape.d}" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg></div>`,
    iconSize: [shape.sz, shape.sz],
    iconAnchor: [shape.sz / 2, shape.sz / 2],
  });
}

function projectPosition(plane: Aircraft, elapsedSeconds: number): [number, number] {
  const speed = plane.ground_speed_kt ?? 0;
  const track = plane.track_deg;
  if (plane.on_ground || speed < 20 || track == null || elapsedSeconds <= 0) {
    return [plane.latitude, plane.longitude];
  }
  const meters = speed * 0.514444 * elapsedSeconds;
  const bearing = (track * Math.PI) / 180;
  const dLat = (meters * Math.cos(bearing)) / 111320;
  const dLon = (meters * Math.sin(bearing)) / (111320 * Math.cos((plane.latitude * Math.PI) / 180));
  return [plane.latitude + dLat, plane.longitude + dLon];
}

function greatCircle(from: [number, number], to: [number, number], steps = 48): [number, number][] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const [lat1, lon1] = [toRad(from[0]), toRad(from[1])];
  const [lat2, lon2] = [toRad(to[0]), toRad(to[1])];
  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
      ),
    );
  if (d < 1e-9) return [from, to];
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const a = Math.sin((1 - f) * d) / Math.sin(d);
    const b = Math.sin(f * d) / Math.sin(d);
    const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);
    points.push([toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), toDeg(Math.atan2(y, x))]);
  }
  return points;
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
  if (!origin && !destination) {
    return html`<span class="route muted">Local</span>`;
  }
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
  const items: Array<[string, string | TemplateResult]> = [];
  if (plane.altitude_ft != null) {
    items.push(["Altitude", plane.on_ground ? "On ground" : `${plane.altitude_ft.toLocaleString()} ft`]);
  }
  if (plane.ground_speed_kt != null) {
    items.push([
      "Speed",
      html`${plane.ground_speed_kt} kt<span class="detail-sub">${Math.round(plane.ground_speed_kt * 1.852)} km/h</span>`,
    ]);
  }
  if (plane.vertical_rate_fpm) {
    items.push(["Vertical", `${plane.vertical_rate_fpm > 0 ? "+" : ""}${plane.vertical_rate_fpm} fpm`]);
  }
  const typeName = aircraftTypeName(plane.type_code) || plane.model;
  if (typeName) items.push(["Type", typeName]);
  if (plane.registration) items.push(["Registration", plane.registration]);
  if (plane.icao24) items.push(["ICAO24", plane.icao24.toUpperCase()]);
  const compass = plane.track_deg != null ? renderCompass(plane.track_deg) : null;
  return html`${renderRouteDetails(plane)}${renderDetails(items, compass)}`;
}

function renderCompass(deg: number): TemplateResult {
  return html`
    <span class="detail compass-detail" title="${deg}°">
      <small>Heading</small>
      <span class="compass">
        <svg viewBox="0 0 32 32" aria-label="Heading ${deg} degrees">
          <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-opacity="0.3" stroke-width="1.5" />
          <path d="M16 3v3M16 29v-3M3 16h3M29 16h-3" stroke="currentColor" stroke-opacity="0.5" stroke-width="1.5" stroke-linecap="round" fill="none" />
          <g transform="rotate(${deg} 16 16)">
            <path class="needle-n" d="M16 5.5l2.6 10.5h-5.2z" />
            <path class="needle-s" d="M16 26.5l-2.6-10.5h5.2z" />
          </g>
        </svg>
        <span class="compass-deg">${deg}°</span>
      </span>
    </span>
  `;
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

function renderDetails(items: Array<[string, string | TemplateResult]>, extra: TemplateResult | null = null): TemplateResult {
  return html`
    <span class="details">
      ${items.map(([label, value]) => html`<span class="detail"><small>${label}</small>${value}</span>`)}
      ${extra}
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

  .route.muted {
    color: var(--secondary-text-color);
    font-weight: 500;
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

  .detail-sub {
    color: var(--secondary-text-color);
    font-size: 11px;
    font-weight: 500;
  }

  .compass {
    align-items: center;
    display: inline-flex;
    gap: 6px;
  }

  .compass svg {
    display: block;
    height: 26px;
    width: 26px;
  }

  .needle-n {
    fill: var(--primary-color, #03a9f4);
  }

  .needle-s {
    fill: currentColor;
    opacity: 0.3;
  }

  .compass-deg {
    font-variant-numeric: tabular-nums;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .compass-detail:hover .compass-deg {
    opacity: 1;
  }

  .empty {
    padding: 12px 16px 18px;
  }

  /* Marker palettes from the "Minimalist plane tracking icons" design doc
     (light-map variants; dark twins land with the dark-tiles milestone). */
  ha-card,
  ha-card.palette-industry {
    --aw-ink: #2b2b2d;
    --aw-hover: #416180;
    --aw-sel: #5980a6;
    --aw-out: #f2f2f3;
    --aw-ground: #98989b;
    --aw-emerg: #1d2d3d;
    --aw-halo: rgba(89, 128, 166, 0.18);
  }

  ha-card.palette-broadsheet {
    --aw-ink: #201e1d;
    --aw-hover: #006786;
    --aw-sel: #0088b0;
    --aw-out: #f3f2f2;
    --aw-ground: #9b9797;
    --aw-emerg: #d6006c;
    --aw-halo: rgba(0, 136, 176, 0.16);
  }

  ha-card.palette-nocturne {
    --aw-ink: #3f424d;
    --aw-hover: #5d5294;
    --aw-sel: #796cbf;
    --aw-out: #e4e7f5;
    --aw-ground: #9397ab;
    --aw-emerg: #2b2741;
    --aw-halo: rgba(121, 108, 191, 0.18);
  }

  .airwatch-marker {
    transition: transform 1s linear;
  }

  .aw-route {
    fill: none;
    stroke: var(--aw-sel);
    stroke-opacity: 0.6;
    stroke-width: 2;
  }

  .aw-route.ahead {
    stroke-dasharray: 6 7;
    stroke-opacity: 0.45;
  }

  .plane-shape {
    height: 100%;
    transition: transform 0.6s ease;
    width: 100%;
  }

  .plane-shape svg {
    display: block;
    height: 100%;
    overflow: visible;
    width: 100%;
  }

  .plane-shape path {
    fill: var(--aw-ink);
    stroke: none;
  }

  .plane-shape .halo {
    fill: none;
    stroke: none;
  }

  .airwatch-marker:hover:not(.selected) path {
    fill: var(--aw-hover);
  }

  .airwatch-marker:hover:not(.selected) .halo {
    fill: var(--aw-halo);
  }

  .airwatch-marker.grounded path {
    fill: var(--aw-ground);
    opacity: 0.5;
  }

  .airwatch-marker.emergency path {
    fill: var(--aw-emerg);
    opacity: 1;
    stroke: var(--aw-out);
    stroke-width: 1.4;
  }

  .airwatch-marker.emergency .halo {
    stroke: var(--aw-emerg);
    stroke-dasharray: 5 3.5;
    stroke-width: 1.6;
  }

  .airwatch-marker.selected {
    z-index: 1000 !important;
  }

  .airwatch-marker.selected .plane-shape {
    filter: drop-shadow(0 0 3px var(--aw-sel));
  }

  .airwatch-marker.selected path {
    fill: var(--aw-sel);
    opacity: 1;
    paint-order: stroke;
    stroke: var(--aw-out);
    stroke-width: 2;
  }

  .airwatch-marker.selected .halo {
    fill: none;
    stroke: var(--aw-sel);
    stroke-width: 1.25;
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
