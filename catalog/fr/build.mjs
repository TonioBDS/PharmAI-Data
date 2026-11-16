#!/usr/bin/env node
/**
 * Catalogue France : construit le catalogue des médicaments (SQLite) à partir des fichiers
 * de la Base de données publique des médicaments (BDPM, ANSM/HAS/UNCAM, Licence Ouverte).
 *
 * Usage :
 *   node catalog/fr/build.mjs --download [--out build/catalog-fr.db]
 *   node catalog/fr/build.mjs --input dossier/avec/fichiers [--out …]
 *
 * Structure produite : catalog/schema.json (attendue par l'app, vérifiée par checks.mjs).
 *
 * Fichiers utilisés (texte, séparés par tabulations, sans en-tête) :
 *   CIS_bdpm.txt        spécialités
 *   CIS_CIP_bdpm.txt    présentations (boîtes, code CIP13)
 *   CIS_COMPO_bdpm.txt  compositions (substances actives)
 *   CIS_GENER_bdpm.txt  groupes génériques (princeps et génériques substituables)
 *
 * Licence des données : mentionner la source et la date de mise à jour, ne pas
 * les altérer. La date de génération est stockée dans la table meta.
 *
 * Note : la BDPM devient « Info Médicament » en janvier 2027 (nouveaux formats
 * sur data.gouv.fr) ; ce script devra être adapté à ce moment-là.
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const FILES = ['CIS_bdpm.txt', 'CIS_CIP_bdpm.txt', 'CIS_COMPO_bdpm.txt', 'CIS_GENER_bdpm.txt'];
const BASE_URLS = [
  'https://base-donnees-publique.medicaments.gouv.fr/download/file/',
  'https://base-donnees-publique.medicaments.gouv.fr/telechargement.php?fichier=',
];

function parseArgs(argv) {
  const args = { out: 'build/catalog-fr.db', input: null, download: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--input') args.input = argv[++i];
    else if (argv[i] === '--download') args.download = true;
  }
  if (!args.input && !args.download) throw new Error('Préciser --input <dossier> ou --download');
  return args;
}

/** Les fichiers BDPM sont historiquement en Windows-1252 ; on accepte aussi l'UTF-8. */
export function decode(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

export function parseTsv(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split('\t').map((c) => c.trim()));
}

/** Texte de recherche : minuscules, sans accents. */
export function searchKey(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

async function download(name) {
  const errors = [];
  for (const base of BASE_URLS) {
    const url = base + name;
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'PharmAI-Data (+https://github.com/TonioBDS/PharmAI-Data)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const head = buf.subarray(0, 200).toString('latin1');
      if (/<html/i.test(head)) throw new Error('page HTML reçue au lieu du fichier');
      return buf;
    } catch (err) {
      errors.push(`${url} : ${err.message}`);
    }
  }
  throw new Error(`Téléchargement impossible de ${name}\n${errors.join('\n')}`);
}

export function buildDatabase(outPath, sources) {
  const specialites = parseTsv(decode(sources['CIS_bdpm.txt']));
  const presentations = parseTsv(decode(sources['CIS_CIP_bdpm.txt']));
  const compositions = parseTsv(decode(sources['CIS_COMPO_bdpm.txt']));
  const generiques = sources['CIS_GENER_bdpm.txt'] ? parseTsv(decode(sources['CIS_GENER_bdpm.txt'])) : [];

  if (specialites.length < 1 || presentations.length < 1) throw new Error('Fichiers BDPM vides ou illisibles');

  mkdirSync(dirname(outPath), { recursive: true });
  const tmp = `${outPath}.tmp`;
  rmSync(tmp, { force: true });
  const db = new DatabaseSync(tmp);
  db.exec(`
    PRAGMA journal_mode = OFF;
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE specialites (
      cis TEXT PRIMARY KEY,
      denomination TEXT NOT NULL,
      recherche TEXT NOT NULL,
      forme TEXT,
      voies TEXT,
      statut_amm TEXT,
      commercialisation TEXT,
      titulaire TEXT,
      surveillance_renforcee INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE presentations (
      cip13 TEXT PRIMARY KEY,
      cip7 TEXT,
      cis TEXT NOT NULL,
      libelle TEXT,
      commercialisation TEXT,
      taux_remboursement TEXT
    );
    CREATE TABLE generiques (
      groupe TEXT NOT NULL,
      libelle TEXT,
      cis TEXT NOT NULL,
      type INTEGER
    );
    CREATE TABLE compositions (
      cis TEXT NOT NULL,
      element TEXT,
      substance TEXT NOT NULL,
      dosage TEXT,
      reference_dosage TEXT,
      nature TEXT
    );
  `);

  const insSpec = db.prepare(
    `INSERT OR REPLACE INTO specialites (cis, denomination, recherche, forme, voies, statut_amm, commercialisation, titulaire, surveillance_renforcee)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insPres = db.prepare(
    `INSERT OR REPLACE INTO presentations (cip13, cip7, cis, libelle, commercialisation, taux_remboursement) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insCompo = db.prepare(
    `INSERT INTO compositions (cis, element, substance, dosage, reference_dosage, nature) VALUES (?, ?, ?, ?, ?, ?)`,
  );

  db.exec('BEGIN');
  let nSpec = 0;
  for (const c of specialites) {
    if (!/^\d{8}$/.test(c[0] ?? '') || !c[1]) continue;
    insSpec.run(c[0], c[1], searchKey(c[1]), c[2] || null, c[3] || null, c[4] || null, c[6] || null, c[10] || null, /oui/i.test(c[11] ?? '') ? 1 : 0);
    nSpec++;
  }
  let nPres = 0;
  for (const c of presentations) {
    if (!/^\d{8}$/.test(c[0] ?? '') || !/^\d{13}$/.test(c[6] ?? '')) continue;
    insPres.run(c[6], c[1] || null, c[0], c[2] || null, c[4] || null, c[8] || null);
    nPres++;
  }
  let nCompo = 0;
  for (const c of compositions) {
    if (!/^\d{8}$/.test(c[0] ?? '') || !c[3]) continue;
    insCompo.run(c[0], c[1] || null, c[3], c[4] || null, c[5] || null, c[6] || null);
    nCompo++;
  }
  const insGen = db.prepare('INSERT INTO generiques (groupe, libelle, cis, type) VALUES (?, ?, ?, ?)');
  let nGen = 0;
  for (const c of generiques) {
    if (!c[0] || !/^\d{8}$/.test(c[2] ?? '')) continue;
    insGen.run(c[0], c[1] || null, c[2], Number(c[3]) || 0);
    nGen++;
  }
  const meta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
  meta.run('source', 'Base de données publique des médicaments (base-donnees-publique.medicaments.gouv.fr)');
  meta.run('generated_at', new Date().toISOString());
  meta.run('specialites', String(nSpec));
  meta.run('presentations', String(nPres));
  meta.run('compositions', String(nCompo));
  meta.run('generiques', String(nGen));
  db.exec('COMMIT');
  db.exec(`
    CREATE INDEX presentations_cis ON presentations(cis);
    CREATE INDEX compositions_cis ON compositions(cis);
    CREATE INDEX generiques_cis ON generiques(cis);
    CREATE INDEX generiques_groupe ON generiques(groupe);
    CREATE INDEX specialites_recherche ON specialites(recherche);
    VACUUM;
  `);
  db.close();
  renameSync(tmp, outPath);
  return { specialites: nSpec, presentations: nPres, compositions: nCompo, generiques: nGen };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sources = {};
  for (const name of FILES) {
    sources[name] = args.download ? await download(name) : readFileSync(join(args.input, name));
    if (args.download && process.env.BDPM_SAVE_DIR) {
      mkdirSync(process.env.BDPM_SAVE_DIR, { recursive: true });
      writeFileSync(join(process.env.BDPM_SAVE_DIR, name), sources[name]);
    }
  }
  const counts = buildDatabase(args.out, sources);
  console.log(`Catalogue écrit dans ${args.out} :`, counts);
  if (counts.specialites < 1000 && args.download) {
    throw new Error('Moins de 1 000 spécialités : fichier probablement tronqué, catalogue non publié');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
