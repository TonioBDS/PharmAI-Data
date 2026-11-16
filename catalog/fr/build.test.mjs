import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { buildDatabase, decode, searchKey } from './build.mjs';

const dir = join(import.meta.dirname, 'fixtures');
const load = (name) => readFileSync(join(dir, name));

describe('catalogue FR (données fictives)', () => {
  it('décode le Windows-1252 et l’UTF-8', () => {
    expect(decode(Buffer.from('crème', 'latin1'))).toBe('crème');
    expect(decode(Buffer.from('crème', 'utf8'))).toBe('crème');
  });

  it('normalise la recherche', () => {
    expect(searchKey('FICTIVINE Crème')).toBe('fictivine creme');
  });

  it('construit la base et ignore les lignes invalides', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'ref-')), 'reference.db');
    const counts = buildDatabase(out, {
      'CIS_bdpm.txt': load('CIS_bdpm.txt'),
      'CIS_CIP_bdpm.txt': load('CIS_CIP_bdpm.txt'),
      'CIS_COMPO_bdpm.txt': load('CIS_COMPO_bdpm.txt'),
      'CIS_GENER_bdpm.txt': load('CIS_GENER_bdpm.txt'),
    });
    expect(counts).toEqual({ specialites: 2, presentations: 2, compositions: 2, generiques: 2 });

    const db = new DatabaseSync(out, { readOnly: true });
    const row = db
      .prepare(
        `SELECT s.denomination, s.forme, s.surveillance_renforcee, p.libelle
           FROM presentations p JOIN specialites s ON s.cis = p.cis WHERE p.cip13 = ?`,
      )
      .get('3400930000028');
    expect(row).toEqual({
      denomination: 'FICTIVINE 1 %, crème',
      forme: 'crème',
      surveillance_renforcee: 1,
      libelle: '1 tube de 30 g',
    });
    db.close();
  });
});
