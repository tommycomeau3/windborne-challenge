"use client";

import "leaflet/dist/leaflet.css";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

// React-Leaflet (loaded client-side to avoid SSR issues)
const MapContainer = dynamic(() => import("react-leaflet").then(m => m.MapContainer), { ssr: false });
const TileLayer    = dynamic(() => import("react-leaflet").then(m => m.TileLayer),    { ssr: false });
const CircleMarker = dynamic(() => import("react-leaflet").then(m => m.CircleMarker), { ssr: false });
const Polyline     = dynamic(() => import("react-leaflet").then(m => m.Polyline),     { ssr: false });
const Popup        = dynamic(() => import("react-leaflet").then(m => m.Popup),        { ssr: false });

// Types for our points and weather
type Wx = { tempC?: number; windKph?: number; windDir?: number };
type Point = { lat: number; lon: number; alt?: number; ts: string; wx?: Wx };

export default function Page() {
  const [points, setPoints] = useState<Point[]>([]);
  const [tracks, setTracks] = useState<Point[][]>([]);
  const [showTracks, setShowTracks] = useState(false);

  // Load latest + weather
  useEffect(() => {
    const load = async () => {
      const r = await fetch("/api/windborne/with-weather", { cache: "no-store" });
      const j = await r.json();
      setPoints(Array.isArray(j.points) ? j.points : []);
    };
    load();
    const id = setInterval(load, 5 * 60_000); // refresh every 5 min
    return () => clearInterval(id);
  }, []);

  // Load 24h tracks only when toggled on
  useEffect(() => {
    if (!showTracks) return;
    const loadTracks = async () => {
      const r = await fetch("/api/windborne", { cache: "no-store" });
      const j = await r.json();
      setTracks(Array.isArray(j.tracks) ? j.tracks : []);
    };
    loadTracks();
  }, [showTracks]);

  // Map center = average of visible points (or default Atlantic)
  const center = useMemo<[number, number]>(() => {
    const pool = points.length ? points : tracks.flat();
    if (!pool.length) return [20, 0];
    const lat = pool.reduce((s, p) => s + p.lat, 0) / pool.length;
    const lon = pool.reduce((s, p) => s + p.lon, 0) / pool.length;
    return [lat, lon];
  }, [points, tracks]);

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      {/* Little UI card */}
      <div
        style={{
          position: "absolute",
          zIndex: 1000,
          margin: 8,
          padding: "8px 10px",
          background: "white",
          borderRadius: 8,
          boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
          fontSize: 14
        }}
      >
        <label>
          <input
            type="checkbox"
            checked={showTracks}
            onChange={(e) => setShowTracks(e.target.checked)}
          />{" "}
          Show 24h tracks
        </label>
      </div>

      <MapContainer center={center} zoom={2} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />

        {/* Optional track polylines */}
        {showTracks &&
          tracks.map((t, i) => (
            <Polyline
              key={`t-${i}`}
              positions={t.map((p) => [p.lat, p.lon]) as [number, number][]}
              pathOptions={{ weight: 2, opacity: 0.5 }}
            />
          ))}

        {/* Latest balloons with weather popups */}
        {points.map((p, i) => (
          <CircleMarker
            key={`p-${i}`}
            center={[p.lat, p.lon]}
            radius={3}
            pathOptions={{ opacity: 0.7, fillOpacity: 0.7 }}
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
                  {typeof p.wx.windDir === "number" && <div>Dir: {Math.round(p.wx.windDir)}°</div>}
                </div>
              )}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
