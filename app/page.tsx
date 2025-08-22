"use client";

import "leaflet/dist/leaflet.css";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

// React-Leaflet (client-side only)
const MapContainer = dynamic(() => import("react-leaflet").then(m => m.MapContainer), { ssr: false });
const TileLayer    = dynamic(() => import("react-leaflet").then(m => m.TileLayer),    { ssr: false });
const CircleMarker = dynamic(() => import("react-leaflet").then(m => m.CircleMarker), { ssr: false });
const Polyline     = dynamic(() => import("react-leaflet").then(m => m.Polyline),     { ssr: false });
const Popup        = dynamic(() => import("react-leaflet").then(m => m.Popup),        { ssr: false });

// ---------- Types ----------
type Wx = { tempC?: number; windKph?: number; windDir?: number };
type Point = { lat: number; lon: number; alt?: number; ts: string; wx?: Wx };

// ---------- Wind helpers ----------

// Simple color scale by wind speed (km/h)
function windColor(kph?: number) {
  if (kph == null) return "#5b9bd5";   // default blue
  if (kph < 10)  return "#7fc97f";     // green
  if (kph < 20)  return "#becc6a";     // yellow-green
  if (kph < 35)  return "#fddc5c";     // yellow
  if (kph < 55)  return "#fdae61";     // orange
  return "#d7191c";                    // red
}

// Scale dot radius with speed (kept modest to avoid clutter)
function windRadius(kph?: number) {
  if (kph == null) return 3;
  return Math.max(2, Math.min(6, 2 + kph / 15));
}

// Move from (lat,lon) by `km` along `bearing` deg (0=N). Good enough for tiny arrows.
function offsetLatLon(lat: number, lon: number, bearingDeg: number, km: number) {
  const R = 6371; // Earth radius km
  const br = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(km / R) +
      Math.cos(lat1) * Math.sin(km / R) * Math.cos(br)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(br) * Math.sin(km / R) * Math.cos(lat1),
      Math.cos(km / R) - Math.sin(lat1) * Math.sin(lat2)
    );

  return [ (lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI ] as [number, number];
}

export default function Page() {
  const [points, setPoints] = useState<Point[]>([]);
  const [tracks, setTracks] = useState<Point[][]>([]);
  const [showTracks, setShowTracks] = useState(false);
  const [showWindArrows, setShowWindArrows] = useState(false);

  // Load latest points enriched with weather
  useEffect(() => {
    const load = async () => {
      const r = await fetch("/api/windborne/with-weather", { cache: "no-store" });
      const j = await r.json();
      setPoints(Array.isArray(j.points) ? j.points : []);
    };
    load();
    const id = setInterval(load, 5 * 60_000); // refresh every 5 minutes
    return () => clearInterval(id);
  }, []);

  // Load 24h tracks when toggled on
  useEffect(() => {
    if (!showTracks) return;
    const loadTracks = async () => {
      const r = await fetch("/api/windborne", { cache: "no-store" });
      const j = await r.json();
      setTracks(Array.isArray(j.tracks) ? j.tracks : []);
    };
    loadTracks();
  }, [showTracks]);

  // Choose map center: avg of visible points (fallback Atlantic)
  const center = useMemo<[number, number]>(() => {
    const pool = points.length ? points : tracks.flat();
    if (!pool.length) return [20, 0];
    const lat = pool.reduce((s, p) => s + p.lat, 0) / pool.length;
    const lon = pool.reduce((s, p) => s + p.lon, 0) / pool.length;
    return [lat, lon];
  }, [points, tracks]);

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      {/* Controls */}
      <div
        style={{
          position: "absolute",
          zIndex: 1000,
          margin: 8,
          padding: "8px 10px",
          background: "white",
          borderRadius: 8,
          boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
          fontSize: 14,
        }}
      >
        <label style={{ display: "block", marginBottom: 6 }}>
          <input
            type="checkbox"
            checked={showTracks}
            onChange={(e) => setShowTracks(e.target.checked)}
          />{" "}
          Show 24h tracks
        </label>

        <label>
          <input
            type="checkbox"
            checked={showWindArrows}
            onChange={(e) => setShowWindArrows(e.target.checked)}
          />{" "}
          Show wind arrows
        </label>
      </div>

      {/* Legend */}
      <div
        style={{
          position: "absolute",
          right: 8,
          bottom: 8,
          zIndex: 1000,
          background: "white",
          padding: "6px 10px",
          borderRadius: 8,
          boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
          fontSize: 12,
          lineHeight: 1.3
        }}
      >
        <b>Wind speed (km/h)</b>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginTop: 6 }}>
          {[
            { lab: "<10",  col: "#7fc97f" },
            { lab: "10–20", col: "#becc6a" },
            { lab: "20–35", col: "#fddc5c" },
            { lab: "35–55", col: "#fdae61" },
            { lab: ">55",  col: "#d7191c" },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{ height: 8, background: s.col, borderRadius: 2 }} />
              <div>{s.lab}</div>
            </div>
          ))}
        </div>
      </div>

      <MapContainer center={center} zoom={2} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />

        {/* Optional 24h track polylines */}
        {showTracks &&
          tracks.map((t, i) => (
            <Polyline
              key={`t-${i}`}
              positions={t.map((p) => [p.lat, p.lon]) as [number, number][]}
              pathOptions={{ weight: 2, opacity: 0.5 }}
            />
          ))}

        {/* Latest balloons colored by wind speed, with optional arrows */}
        {points.map((p, i) => {
          const kph = p.wx?.windKph;
          const color = windColor(kph);
          const radius = windRadius(kph);

          // Open-Meteo windDir is FROM; arrow should point TO (add 180°)
          const arrow: [number, number][] | null = (() => {
            if (!showWindArrows || typeof p.wx?.windDir !== "number") return null;
            const toBearing = (p.wx!.windDir + 180) % 360;
            // Arrow length scales with speed, capped to avoid clutter
            const lenKm = Math.min(40, (kph ?? 0) * 0.7);
            const tip = offsetLatLon(p.lat, p.lon, toBearing, lenKm);
            return [[p.lat, p.lon], tip];
          })();

          return (
            <CircleMarker
              key={`p-${i}`}
              center={[p.lat, p.lon]}
              radius={radius}
              pathOptions={{ color, fillColor: color, opacity: 0.9, fillOpacity: 0.9 }}
            >
              <Popup>
                <div><b>Balloon</b></div>
                <div>Lat: {p.lat.toFixed(2)} Lon: {p.lon.toFixed(2)}</div>
                {typeof p.alt === "number" && <div>Alt: {p.alt.toFixed(1)}</div>}
                <div>Time: {new Date(p.ts).toLocaleString()}</div>

                {p.wx && (
                  <div style={{ marginTop: 6 }}>
                    <div><b>Weather (Open-Meteo)</b></div>
                    {typeof p.wx.tempC === "number"   && <div>Temp: {p.wx.tempC.toFixed(1)} °C</div>}
                    {typeof p.wx.windKph === "number" && <div>Wind: {p.wx.windKph.toFixed(1)} km/h</div>}
                    {typeof p.wx.windDir === "number" && <div>Dir: {Math.round(p.wx.windDir)}° (from)</div>}
                  </div>
                )}
              </Popup>

              {/* Arrow shaft */}
              {arrow && (
                <Polyline
                  positions={arrow as [number, number][]}
                  pathOptions={{ color, weight: 2, opacity: 0.8 }}
                />
              )}
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
