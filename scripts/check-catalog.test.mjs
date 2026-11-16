import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildDatabase } from '../catalog/fr/build.mjs';
import { checkCatalog } from './check-catalog.mjs';

const fixtures = join(import.meta.dirname, '..', 'catalog', 'fr', 'fixtures');
const schema = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'catalog', 'schema.json'), 'utf8'));
// Contrôles adaptés au jeu fictif (2 médicaments)
const known = {
  boxes: [{ cip13: '3400930000028', name: 'FICTIVINE', substance: '' }],
  searches: [{ query: 'fictivine', atLeast: 1 }],
  minimum: { specialites: 2, presentations: 2, compositions: 2, generiques: 2 },
  maxVariation: { specialites: 0.05, presentations: 0.05, compositions: 0.1, generiques: 0.15 },
  compressedSize: { min: 10, max: 10_000_000 },
};

let db;
beforeAll(() => {
  const out = join(mkdtempSync(join(tmpdir(), 'chk-')), 'catalog.db');
  const load = (n) => readFileSync(join(fixtures, n));
  buildDatabase(out, { 'CIS_bdpm.txt': load('CIS_bdpm.txt'), 'CIS_CIP_bdpm.txt': load('CIS_CIP_bdpm.txt'), 'CIS_COMPO_bdpm.txt': load('CIS_COMPO_bdpm.txt'), 'CIS_GENER_bdpm.txt': load('CIS_GENER_bdpm.txt') });
  db = new DatabaseSync(out, { readOnly: true });
});

describe('contrôles du catalogue', () => {
  it('passe sur un catalogue conforme', () => {
    const r = checkCatalog({ db, known, schema, compressedSize: 1000, previous: { specialites: 2, presentations: 2 } });
    expect(r.errors).toEqual([]);
    expect(r.counts).toEqual({ specialites: 2, presentations: 2, compositions: 2, generiques: 2 });
  });

  it('refuse une chute brutale du nombre de médicaments, sauf si on l’accepte', () => {
    const previous = { specialites: 4, presentations: 2 };
    expect(checkCatalog({ db, known, schema, compressedSize: 1000, previous }).errors[0]).toMatch(/specialites : 4 → 2 lignes \(-50\.0 %/);
    expect(checkCatalog({ db, known, schema, compressedSize: 1000, previous, acceptVariation: true }).errors).toEqual([]);
  });

  it('signale une boîte connue absente, une recherche vide, une taille anormale, un minimum non atteint', () => {
    const strict = { ...known, boxes: [{ cip13: '3400939999999', name: 'ABSENT', substance: 'X' }], searches: [{ query: 'introuvable', atLeast: 1 }], minimum: { ...known.minimum, specialites: 3 } };
    const errors = checkCatalog({ db, known: strict, schema, compressedSize: 1, previous: null }).errors;
    expect(errors).toHaveLength(4);
  });

  it('refuse une structure différente de celle attendue par l’app', () => {
    const other = { ...schema, tables: { ...schema.tables, presentations: [...schema.tables.presentations, 'colonne_nouvelle'] } };
    expect(checkCatalog({ db, known, schema: other, compressedSize: 1000, previous: null }).errors).toEqual(['Colonnes absentes dans presentations : colonne_nouvelle']);
  });
});
