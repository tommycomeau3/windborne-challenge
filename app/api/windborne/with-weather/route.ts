// app/api/windborne/with-weather/route.ts
import { NextResponse } from "next/server";

type Pt = { lat: number; lon: number; alt?: number; ts: string };
type PtWithWx = Pt & { wx?: { tempC?: number; windKph?: number; windDir?: number } };

const LATEST = "https://a.windbornesystems.com/treasure/00.json";

// Round to 0.5° to dedupe nearby balloons so we don't hammer the weather API
const keyOf = (lat: number, lon: number) =>
  `${(Math.round(lat * 2) / 2).toFixed(1)},${(Math.round(lon * 2) / 2).toFixed(1)}`;

async function fetchLatest(): Promise<Pt[]> {
  try {
    const r = await fetch(LATEST, { cache: "no-store" });
    const text = await r.text();

    let raw: any;
    try {
      raw = JSON.parse(text);
      if (raw?.tracks) raw = raw.tracks;
    } catch {
      raw = text
        .split(/\n+/)
        .map((s) => {
          try { return JSON.parse(s); } catch { return null; }
        })
        .filter(Boolean);
    }

    const iso = new Date().toISOString();
    const pts: Pt[] = [];
    for (const it of raw as any[]) {
      const lat = Number(it?.lat ?? it?.[0]);
      const lon = Number(it?.lon ?? it?.[1]);
      const alt = Number(it?.alt ?? it?.[2]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        pts.push({ lat, lon, ts: iso, alt: Number.isFinite(alt) ? alt : undefined });
      }
    }
    return pts;
  } catch {
    return [];
  }
}

async function fetchOpenMeteo(lat: number, lon: number) {
  // Hourly wind + temperature near “now” (UTC)
  // No API key needed.
  const now = new Date();
  const start = new Date(now.getTime() - 2 * 3600_000).toISOString().slice(0, 13) + ":00";
  const end   = new Date(now.getTime() + 2 * 3600_000).toISOString().slice(0, 13) + ":00";

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,wind_speed_10m,wind_direction_10m&start_hour=${start}&end_hour=${end}&timezone=UTC`;

  try {
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json();

    const h = j?.hourly;
    if (!h || !h.time) return null;

    // Pick the hour closest to "now"
    const times: string[] = h.time;
    let best = 0, bestDiff = Infinity;
    for (let i = 0; i < times.length; i++) {
      const diff = Math.abs(+new Date(times[i]) - now.getTime());
      if (diff < bestDiff) { best = i; bestDiff = diff; }
    }

    const tempC = h.temperature_2m?.[best];
    const windMs = h.wind_speed_10m?.[best]; // m/s
    const windDir = h.wind_direction_10m?.[best];

    return {
      tempC: Number.isFinite(tempC) ? Number(tempC) : undefined,
      windKph: Number.isFinite(windMs) ? Number(windMs) * 3.6 : undefined,
      windDir: Number.isFinite(windDir) ? Number(windDir) : undefined,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  // 1) Get latest balloons
  const pts = await fetchLatest();

  // 2) Build a set of rounded coordinate keys so we only call Open-Meteo once per cell
  const uniq = new Map<string, { lat: number; lon: number }>();
  for (const p of pts) {
    const k = keyOf(p.lat, p.lon);
    if (!uniq.has(k)) uniq.set(k, { lat: p.lat, lon: p.lon });
  }

  // Safety: cap to at most ~150 weather lookups
  const cells = Array.from(uniq.values()).slice(0, 150);

  // 3) Fetch weather for each cell concurrently
  const wxResults = await Promise.all(
    cells.map(({ lat, lon }) => fetchOpenMeteo(lat, lon))
  );

  // 4) Attach weather back onto each point via its rounded cell key
  const cellKeys = cells.map((c) => keyOf(c.lat, c.lon));
  const cellWx = new Map<string, NonNullable<Awaited<ReturnType<typeof fetchOpenMeteo>>>>();
  cellKeys.forEach((k, i) => {
    if (wxResults[i]) cellWx.set(k, wxResults[i]!);
  });

  const enriched: PtWithWx[] = pts.map((p) => {
    const wx = cellWx.get(keyOf(p.lat, p.lon)) || undefined;
    return { ...p, wx };
  });

  return NextResponse.json({
    updatedAt: new Date().toISOString(),
    points: enriched,
    meta: { weatherCells: cellWx.size, totalPoints: enriched.length }
  });
}
