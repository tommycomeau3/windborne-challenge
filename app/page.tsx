"use client";

import "leaflet/dist/leaflet.css";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

const MapContainer = dynamic(() => import("react-leaflet").then(m => m.MapContainer), { ssr: false });
const TileLayer    = dynamic(() => import("react-leaflet").then(m => m.TileLayer),    { ssr: false });
const CircleMarker = dynamic(() => import("react-leaflet").then(m => m.CircleMarker), { ssr: false });
const Polyline     = dynamic(() => import("react-leaflet").then(m => m.Polyline),     { ssr: false });
const Popup        = dynamic(() => import("react-leaflet").then(m => m.Popup),        { ssr: false });

type Point = { lat: number; lon: number; alt?: number; ts: string };

export default function Page() {
  const [latest, setLatest] = useState<Point[]>([]);
  const [tracks, setTracks] = useState<Point[][]>([]);
  const [showTracks, setShowTracks] = useState<boolean>(false);

  // Load latest (00.json)
  useEffect(() => {
    const load = async () => {
      const r = await fetch("/api/windborne/latest", { cache: "no-store" });
      const j = await r.json();
      setLatest(Array.isArray(j.points) ? j.points : []);
    };
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  // Load 24h tracks when toggled on
  useEffect(() => {
    if (!showTracks) return;
    const load = async () => {
      const r = await fetch("/api/windborne", { cache: "no-store" });
      const j = await r.json();
      setTracks(Array.isArray(j.tracks) ? j.tracks : []);
    };
    load();
  }, [showTracks]);

  const center = useMemo<[number, number]>(() => {
    const pts = latest.length ? latest : tracks.flat();
    if (!pts.length) return [20, 0];
    const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
    const lon = pts.reduce((s, p) => s + p.lon, 0) / pts.length;
    return [lat, lon];
  }, [latest, tracks]);

  return (
    <div style={{ height: "100vh", width: "100vw" }}>
      <div style={{
        position: "absolute", zIndex: 1000, margin: "8px",
        padding: "8px 10px", background: "white", borderRadius: 8, boxShadow: "0 2px 10px rgba(0,0,0,0.1)"
      }}>
        <label style={{ fontSize: 14 }}>
          <input type="checkbox" checked={showTracks} onChange={e => setShowTracks(e.target.checked)} />
          {" "}Show 24h tracks
        </label>
      </div>

      <MapContainer center={center} zoom={2} style={{ height: "100%", width: "100%" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />

        {showTracks && tracks.map((t, i) => (
          <Polyline
            key={`t-${i}`}
            positions={t.map(p => [p.lat, p.lon]) as [number, number][]}
            pathOptions={{ weight: 2, opacity: 0.5 }}
          />
        ))}

        {latest.map((p, i) => (
          <CircleMarker key={`p-${i}`} center={[p.lat, p.lon]} radius={3} pathOptions={{ opacity: 0.7, fillOpacity: 0.7 }}>
            <Popup>
              <div><b>Balloon</b></div>
              <div>Lat: {p.lat.toFixed(2)} Lon: {p.lon.toFixed(2)}</div>
              {typeof p.alt === "number" && <div>Alt: {p.alt.toFixed(1)}</div>}
              <div>Time: {new Date(p.ts).toLocaleString()}</div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
