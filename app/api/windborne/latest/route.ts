// app/api/windborne/latest/route.ts
import { NextResponse } from "next/server";

type Obs = { lat: number; lon: number; alt?: number; ts: string };
const URL = "https://a.windbornesystems.com/treasure/00.json";

export async function GET() {
  let text = "";
  try {
    const r = await fetch(URL, { cache: "no-store" });
    text = await r.text();
  } catch {
    return NextResponse.json({ updatedAt: new Date().toISOString(), points: [] });
  }

  let raw: any;
  try { raw = JSON.parse(text); }
  catch {
    raw = text.split(/\n+/).map(s => s.trim()).filter(Boolean).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
  }

  const iso = new Date().toISOString();
  const points: Obs[] = [];
  for (const item of raw) {
    if (Array.isArray(item) && item.length >= 2) {
      const [lat, lon, alt] = item;
      if (Number.isFinite(lat) && Number.isFinite(lon))
        points.push({ lat, lon, alt, ts: iso });
    } else if (item && typeof item === "object") {
      const lat = Number(item.lat ?? item[0]);
      const lon = Number(item.lon ?? item[1]);
      const alt = Number(item.alt ?? item[2]);
      if (Number.isFinite(lat) && Number.isFinite(lon))
        points.push({ lat, lon, alt: Number.isFinite(alt) ? alt : undefined, ts: iso });
    }
  }

  return NextResponse.json({ updatedAt: iso, points });
}
