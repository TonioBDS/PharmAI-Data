#!/usr/bin/env node
/**
 * Assemble les données de voyage relues (travel/data/) en un seul fichier compressé, téléchargé
 * par l'app comme le catalogue : build/travel.json.gz, puis contrôles (travel/check.mjs).
 *
 *   node travel/publish.mjs --out build/travel.json.gz
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const HERE = import.meta.dirname;
export const TRAVEL_SCHEMA_VERSION = 1;

export function assemble(dataDir = join(HERE, 'data')) {
  const read = (p) => JSON.parse(readFileSync(join(dataDir, p), 'utf8'));
  const { retrieved, sources } = read('sources.json');
  const destinations = readdirSync(join(dataDir, 'destinations'))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => read(join('destinations', f)));
  return { schemaVersion: TRAVEL_SCHEMA_VERSION, retrieved, sources, ...read('common.json'), destinations };
}

/** Compression reproductible (pas de date dans l'en-tête gzip). */
export function compress(data) {
  return gzipSync(Buffer.from(JSON.stringify(data)), { level: 9 });
}

export function counts(data) {
  const d = data.destinations;
  return {
    destinations: d.length,
    diplomatie: d.filter((x) => x.diplomatie).length,
    climate: d.filter((x) => x.places.length).length,
    malaria: d.filter((x) => x.flags.malaria).length,
    packing: d.filter((x) => x.cdc.packing.length).length,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[process.argv.indexOf('--out') + 1];
  const data = assemble();
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, compress(data));
  writeFileSync(out.replace(/\.gz$/, ''), JSON.stringify(data));
  console.log(`${out} :`, counts(data));
}
