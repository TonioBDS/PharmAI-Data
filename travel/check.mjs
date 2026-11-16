#!/usr/bin/env node
/**
 * Contrôles des données de voyage avant publication. Un seul échec = rien n'est publié.
 *
 *   node travel/check.mjs --gz build/travel.json.gz [--previous build/previous/manifest.json] [--accept-variation]
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { readPayload } from '../scripts/sign.mjs';
import { counts as countsOf, TRAVEL_SCHEMA_VERSION } from './publish.mjs';

const known = JSON.parse(readFileSync(join(import.meta.dirname, 'known.json'), 'utf8'));
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function checkTravel({ data, compressedSize, previous, acceptVariation = false }) {
  const errors = [];
  if (data.schemaVersion !== TRAVEL_SCHEMA_VERSION) errors.push(`Version de format ${data.schemaVersion}, ${TRAVEL_SCHEMA_VERSION} attendue`);
  if (!DATE.test(data.retrieved ?? '')) errors.push('Date de relevé absente');
  for (const s of ['cdc', 'diplomatie', 'ecdc', 'power', 'naturalearth', 'cldr']) if (!data.sources?.[s]?.attribution) errors.push(`Mention de source absente : ${s}`);
  const ids = new Set();
  const items = new Set(Object.keys(data.packing?.items ?? {}));
  for (const d of data.destinations ?? []) {
    const where = d.id ?? '?';
    if (!d.id || ids.has(d.id)) errors.push(`Identifiant absent ou en double : ${where}`);
    ids.add(d.id);
    if (!/^[A-Z]{2}$/.test(d.iso2 ?? '')) errors.push(`${where} : code ISO invalide`);
    if (!d.name?.fr || !d.name?.en) errors.push(`${where} : nom manquant`);
    if (!d.cdc?.url || !Array.isArray(d.cdc.vaccines) || !Array.isArray(d.cdc.diseases)) errors.push(`${where} : données du CDC incomplètes`);
    for (const p of d.cdc?.packing ?? []) if (!items.has(p)) errors.push(`${where} : article de liste inconnu ${p}`);
    for (const p of d.places ?? []) {
      const c = p.climate;
      if (!c || ['temp', 'max', 'min'].some((k) => c[k]?.length !== 12 || c[k].some((v) => typeof v !== 'number' || v < -80 || v > 60))) errors.push(`${where} : climat invalide pour ${p.name}`);
    }
    if (d.diplomatie && (!DATE.test(d.diplomatie.updated ?? '') || !d.diplomatie.blocks?.length)) errors.push(`${where} : rubrique Santé de France Diplomatie incomplète`);
  }
  for (const id of known.destinations) if (!ids.has(id)) errors.push(`Destination attendue absente : ${id}`);
  for (const [id, expect] of Object.entries(known.expect)) {
    const d = data.destinations.find((x) => x.id === id);
    if (!d) continue;
    for (const [flag, value] of Object.entries(expect)) {
      const actual = flag === 'diplomatie' ? !!d.diplomatie : flag === 'yellowFeverEntry' ? d.cdc.yellowFever?.entry : d.flags[flag];
      if (actual !== value) errors.push(`${id} : ${flag} = ${JSON.stringify(actual)}, ${JSON.stringify(value)} attendu`);
    }
  }

  const counts = countsOf(data);
  for (const [k, min] of Object.entries(known.minimum)) if (counts[k] < min) errors.push(`${k} : ${counts[k]}, minimum ${min}`);
  if (previous && !acceptVariation) {
    for (const [k, max] of Object.entries(known.maxVariation)) {
      const before = previous[k];
      if (!before) continue;
      const change = (counts[k] - before) / before;
      if (Math.abs(change) > max) errors.push(`${k} : ${before} → ${counts[k]} (${(change * 100).toFixed(1)} %, maximum ± ${max * 100} %)`);
    }
  }
  const { min, max } = known.compressedSize;
  if (compressedSize < min || compressedSize > max) errors.push(`Taille compressée ${compressedSize} octets hors de [${min}, ${max}]`);
  return { counts, errors };
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
  const gz = readFileSync(arg('--gz'));
  const data = JSON.parse(gunzipSync(gz).toString('utf8'));
  let previous = null;
  try {
    previous = readPayload(JSON.parse(readFileSync(arg('--previous'), 'utf8'))).files?.travel?.counts ?? null;
  } catch {
    // première publication
  }
  const { counts, errors } = checkTravel({ data, compressedSize: gz.length, previous, acceptVariation: argv.includes('--accept-variation') });
  console.log('Volumes :', counts, previous ? `(précédent : ${JSON.stringify(previous)})` : '(première publication)');
  if (errors.length) {
    console.error(`${errors.length} contrôle(s) en échec :\n- ${errors.slice(0, 50).join('\n- ')}`);
    process.exit(1);
  }
  console.log('Tous les contrôles sont passés.');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
