/**
 * Climat moyen par mois (NASA POWER, normales 2001-2025, domaine public — voir SOURCES.md)
 * en quelques villes de chaque destination, choisies dans Natural Earth (domaine public).
 */

export const POWER_PARAMETERS = ['T2M', 'T2M_MAX', 'T2M_MIN', 'PRECTOTCORR', 'RH2M', 'ALLSKY_SFC_UV_INDEX'];
export const POWER_URL = (lat, lon) =>
  `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=${POWER_PARAMETERS.join(',')}&community=RE&longitude=${lon}&latitude=${lat}&format=JSON`;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const round1 = (x) => Math.round(x * 10) / 10;

/**
 * Réponse POWER → douze valeurs par grandeur, de janvier à décembre :
 * temp (moyenne °C), max/min (extrêmes moyens du mois, °C), rain (mm/jour), humidity (%),
 * uv (indice UV moyen sur 24 h : environ le quart de l'indice de midi).
 */
export function parsePower(json) {
  const p = json?.properties?.parameter;
  if (!p) throw new Error('réponse NASA POWER inattendue');
  const fill = json.header?.fill_value ?? -999;
  const series = (key) => {
    const s = p[key];
    if (!s) return null;
    const values = MONTHS.map((m) => s[m]);
    if (values.some((v) => typeof v !== 'number' || v === fill)) return null;
    return values.map(round1);
  };
  const out = {
    temp: series('T2M'),
    max: series('T2M_MAX'),
    min: series('T2M_MIN'),
    rain: series('PRECTOTCORR'),
    humidity: series('RH2M'),
    uv: series('ALLSKY_SFC_UV_INDEX'),
  };
  if (!out.max || !out.min) throw new Error('températures absentes');
  return out;
}

/** Distance en km entre deux points (formule de haversine). */
export function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export const MAX_PLACES = 4;
export const MIN_SPACING_KM = 600;

/**
 * Villes retenues pour une destination : la capitale (ou la plus peuplée), puis les plus
 * peuplées situées à plus de 600 km de celles déjà retenues, quatre au plus. Un petit pays
 * n'a donc qu'une ville, un grand pays en a plusieurs aux climats différents.
 */
export function pickPlaces(candidates, max = MAX_PLACES, spacing = MIN_SPACING_KM) {
  const sorted = [...candidates].sort((a, b) => Number(b.capital) - Number(a.capital) || b.population - a.population);
  const out = [];
  for (const c of sorted) {
    if (out.length >= max) break;
    if (out.every((o) => distanceKm(o, c) >= spacing)) out.push(c);
  }
  return out;
}

/** Villes de Natural Earth (« populated places ») regroupées par code pays ISO. */
export function placesByCountry(geojson) {
  const out = new Map();
  for (const f of geojson.features) {
    const p = f.properties;
    const iso = p.iso_a2 === '-99' ? (p.adm0name === 'Kosovo' ? 'XK' : null) : p.iso_a2;
    if (!iso) continue;
    const place = {
      name: p.name,
      region: p.adm1name ?? null,
      lat: round2(p.latitude),
      lon: round2(p.longitude),
      population: p.pop_max ?? 0,
      capital: p.featurecla === 'Admin-0 capital',
    };
    if (!out.has(iso)) out.set(iso, []);
    out.get(iso).push(place);
  }
  return out;
}
const round2 = (x) => Math.round(x * 100) / 100;
