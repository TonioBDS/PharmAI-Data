#!/usr/bin/env node
/**
 * Contrôles de cohérence d'un catalogue avant publication. Un seul échec = rien n'est publié.
 *
 *   node scripts/check-catalog.mjs --country fr --db build/catalog-fr.db --gz build/catalog-fr.db.gz
 *        [--previous build/previous/manifest.json] [--accept-variation]
 *
 * --accept-variation : accepte une forte variation du nombre de lignes (changement de format
 * de la source, à vérifier à la main) ; les autres contrôles restent appliqués.
 */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readPayload } from './sign.mjs';

const ROOT = join(import.meta.dirname, '..');

const searchKey = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * @param db           base ouverte (node:sqlite)
 * @param known        catalog/<pays>/known.json
 * @param schema       catalog/schema.json
 * @param compressedSize taille du fichier compressé (octets)
 * @param previous     nombres de lignes du catalogue publié précédent, ou null
 * @returns { counts, errors: string[] }
 */
export function checkCatalog({ db, known, schema, compressedSize, previous, acceptVariation = false }) {
  const errors = [];
  const integrity = db.prepare('PRAGMA integrity_check').get();
  if (Object.values(integrity)[0] !== 'ok') errors.push(`Base corrompue : ${JSON.stringify(integrity)}`);

  // Structure attendue par l'app
  for (const [table, columns] of Object.entries(schema.tables)) {
    const actual = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    const missing = columns.filter((c) => !actual.includes(c));
    if (actual.length === 0) errors.push(`Table absente : ${table}`);
    else if (missing.length) errors.push(`Colonnes absentes dans ${table} : ${missing.join(', ')}`);
  }
  if (errors.length) return { counts: {}, errors };

  // Volumes : minimum absolu, puis variation par rapport au catalogue publié
  const counts = {};
  for (const table of Object.keys(known.minimum)) counts[table] = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  for (const [table, min] of Object.entries(known.minimum)) {
    if (counts[table] < min) errors.push(`${table} : ${counts[table]} lignes, minimum ${min}`);
  }
  if (previous && !acceptVariation) {
    for (const [table, max] of Object.entries(known.maxVariation)) {
      const before = previous[table];
      if (!before) continue;
      const change = (counts[table] - before) / before;
      if (Math.abs(change) > max) {
        errors.push(`${table} : ${before} → ${counts[table]} lignes (${(change * 100).toFixed(1)} %, maximum ± ${max * 100} %)`);
      }
    }
  }

  // Boîtes connues : retrouvées par code, avec le bon nom et la bonne substance
  const box = db.prepare(
    `SELECT s.denomination, (SELECT group_concat(substance, ' + ') FROM compositions c WHERE c.cis = s.cis) AS substances
       FROM presentations p JOIN specialites s ON s.cis = p.cis WHERE p.cip13 = ?`,
  );
  for (const k of known.boxes) {
    const row = box.get(k.cip13);
    if (!row) errors.push(`Boîte ${k.cip13} (${k.name}) introuvable`);
    else if (!searchKey(row.denomination).includes(searchKey(k.name))) errors.push(`Boîte ${k.cip13} : « ${row.denomination} » au lieu de ${k.name}`);
    else if (!searchKey(row.substances ?? '').includes(searchKey(k.substance))) errors.push(`Boîte ${k.cip13} : substance ${k.substance} absente (${row.substances})`);
  }

  // Recherche par nom (colonne utilisée par l'app)
  for (const s of known.searches) {
    const n = db.prepare('SELECT COUNT(*) AS n FROM specialites WHERE recherche LIKE ?').get(`%${searchKey(s.query)}%`).n;
    if (n < s.atLeast) errors.push(`Recherche « ${s.query} » : ${n} résultats, au moins ${s.atLeast} attendus`);
  }

  const { min, max } = known.compressedSize;
  if (compressedSize < min || compressedSize > max) errors.push(`Taille compressée ${compressedSize} octets hors de [${min}, ${max}]`);
  return { counts, errors };
}

function main() {
  const args = { country: null, db: null, gz: null, previous: null, acceptVariation: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--country') args.country = argv[++i];
    else if (argv[i] === '--db') args.db = argv[++i];
    else if (argv[i] === '--gz') args.gz = argv[++i];
    else if (argv[i] === '--previous') args.previous = argv[++i];
    else if (argv[i] === '--accept-variation') args.acceptVariation = true;
  }
  const known = JSON.parse(readFileSync(join(ROOT, 'catalog', args.country, 'known.json'), 'utf8'));
  const schema = JSON.parse(readFileSync(join(ROOT, 'catalog', 'schema.json'), 'utf8'));
  let previous = null;
  try {
    previous = readPayload(JSON.parse(readFileSync(args.previous, 'utf8'))).files?.[`catalog-${args.country}`]?.counts ?? null;
  } catch {
    // premier lancement : pas de catalogue publié
  }
  const db = new DatabaseSync(args.db, { readOnly: true });
  const { counts, errors } = checkCatalog({ db, known, schema, compressedSize: statSync(args.gz).size, previous, acceptVariation: args.acceptVariation });
  db.close();
  console.log('Lignes :', counts, previous ? `(précédent : ${JSON.stringify(previous)})` : '(premier catalogue)');
  if (errors.length) {
    console.error(`${errors.length} contrôle(s) en échec :\n- ${errors.join('\n- ')}`);
    process.exit(1);
  }
  console.log('Tous les contrôles sont passés.');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
