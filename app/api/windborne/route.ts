import { NextResponse } from "next/server";

const BASE = "https://a.windbornesystems.com/treasure";
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));

type Obs = { id?: string; lat: number; lon: number; ts: string; alt?: number };

function distKm(a: Obs, b: Obs) {
  const toR = (d: number) => (d * Math.PI) / 180, R = 6371;
  const dφ = toR(b.lat - a.lat), dλ = toR(b.lon - a.lon);
  return 2 * R * Math.asin(Math.sqrt(Math.sin(dφ/2)**2 + Math.cos(toR(a.lat))*Math.cos(toR(b.lat))*Math.sin(dλ/2)**2));
}

async function fetchHour(hh: string, iso: string): Promise<Obs[]> {
  try {
    const r = await fetch(`${BASE}/${hh}.json`, { cache: "no-store" });
    const text = await r.text();
    let raw: any[] = [];
    try { raw = JSON.parse(text); }
    catch {
      raw = text.split(/\n+/).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean) as any[];
    }

    const points: Obs[] = [];
    for (const item of raw) {
      if (Array.isArray(item)) {
        const [lat, lon, alt] = item;
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          points.push({ lat, lon, alt: Number.isFinite(alt) ? alt : undefined, ts: iso });
        }
      } else if (item && typeof item === "object") {
        const lat = Number(item.lat ?? item[0]);
        const lon = Number(item.lon ?? item[1]);
        const alt = Number(item.alt ?? item[2]);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          points.push({ lat, lon, alt: Number.isFinite(alt) ? alt : undefined, ts: iso });
        }
      }
    }
    return points;
  } catch {
    return [];
  }
}

export async function GET() {
  const now = Date.now();
  const hours = await Promise.all(
    HOURS.map((hh, idx) => fetchHour(hh, new Date(now - idx * 3600_000).toISOString()))
  );

  // Oldest → newest
  const all = hours.flat().sort((a, b) => +new Date(a.ts) - +new Date(b.ts));

  // Greedy stitching: build tracks by proximity/time when we have no IDs
  const tracks: Obs[][] = [];
  const timeToleranceH = 2;
  const distanceKmMax = 80;

  for (const obs of all) {
    let bestTrack: Obs[] | null = null;
    let best = Infinity;

    for (const t of tracks) {
      const last = t[t.length - 1];
      const dtH = Math.abs(+new Date(obs.ts) - +new Date(last.ts)) / 3600_000;
      if (dtH > timeToleranceH) continue;
      const d = distKm(last, obs);
      if (d < best) { best = d; bestTrack = t; }
    }

    if (bestTrack && best < distanceKmMax) bestTrack.push(obs);
    else tracks.push([obs]);
  }

  return NextResponse.json({ updatedAt: new Date().toISOString(), tracks }, { headers: { "Cache-Control": "no-store" }});
}
