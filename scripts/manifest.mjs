#!/usr/bin/env node
/**
 * Met à jour le manifeste publié avec une nouvelle version d'un fichier, puis le signe.
 * Les autres entrées du manifeste précédent sont reprises telles quelles.
 *
 *   PHARMAI_DATA_SIGNING_KEY=… node scripts/manifest.mjs --previous build/previous/manifest.json \
 *     --entry catalog-fr --file build/catalog-fr.db.gz --db build/catalog-fr.db --sources-sha <empreinte> \
 *     --out build/manifest.json
 *   (fichier sans base SQLite : --counts '{"destinations":244}' --schema-version 1 au lieu de --db)
 */
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readPayload, signManifest } from './sign.mjs';

const ROOT = join(import.meta.dirname, '..');
/** Identifiant de la clé en service (voir scripts/keys.json). */
export const KEY_ID = '2026-11';
/** Adresse de base des fichiers publiés : la publication « donnees » du dépôt. */
export const BASE_URL = 'https://github.com/TonioBDS/PharmAI-Data/releases/download/donnees/';

export function catalogEntry({ file, db, sourcesSha, now = new Date() }) {
  const bytes = readFileSync(file);
  const counts = {};
  for (const table of ['specialites', 'presentations', 'compositions', 'generiques']) counts[table] = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  const schema = JSON.parse(readFileSync(join(ROOT, 'catalog', 'schema.json'), 'utf8'));
  return {
    file: basename(file),
    // Date et heure de publication : l'app compare les versions dans cet ordre
    version: now.toISOString(),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length,
    schemaVersion: schema.version,
    sourcesSha,
    counts,
  };
}

/** Entrée d'un fichier quelconque (données de voyage…). */
export function fileEntry({ file, sourcesSha, schemaVersion, counts, now = new Date() }) {
  const bytes = readFileSync(file);
  return {
    file: basename(file),
    version: now.toISOString(),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    size: bytes.length,
    schemaVersion,
    sourcesSha,
    counts,
  };
}

export function nextManifest(previous, entryName, entry, now = new Date()) {
  return { format: 1, generatedAt: now.toISOString(), baseUrl: BASE_URL, files: { ...(previous?.files ?? {}), [entryName]: entry } };
}

function main() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, '')] = argv[i + 1];
  const seed = process.env.PHARMAI_DATA_SIGNING_KEY;
  if (!seed) throw new Error('Secret PHARMAI_DATA_SIGNING_KEY absent : rien n’est publié');
  let previous = null;
  try {
    previous = readPayload(JSON.parse(readFileSync(args.previous, 'utf8')));
  } catch {
    // premier manifeste
  }
  let entry;
  if (args.db) {
    const db = new DatabaseSync(args.db, { readOnly: true });
    entry = catalogEntry({ file: args.file, db, sourcesSha: args['sources-sha'] });
    db.close();
  } else {
    entry = fileEntry({ file: args.file, sourcesSha: args['sources-sha'], schemaVersion: Number(args['schema-version']), counts: JSON.parse(args.counts) });
  }
  const manifest = nextManifest(previous, args.entry, entry);
  writeFileSync(args.out, JSON.stringify(signManifest(manifest, seed, KEY_ID), null, 2) + '\n');
  console.log(`Manifeste signé : ${args.entry} ${entry.version}, ${entry.size} octets (${statSync(args.file).size})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
