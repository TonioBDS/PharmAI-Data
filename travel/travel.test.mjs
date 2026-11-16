import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { diplomatieIso, SOURCES } from './build.mjs';
import { isoDate, parseDestinationList, parseDestinationPage, parsePackingList } from './cdc/parse.mjs';
import { parsePower, pickPlaces } from './climate/climate.mjs';
import { derive, malariaStatus, rabiesInDogs, yellowFeverStatus } from './derive.mjs';
import { frenchDate, healthTopics, parseCountryList, parseHealthPage, slugify } from './diplomatie/parse.mjs';
import { parseLegend, parseVectorTable } from './ecdc/vectors.mjs';
import { checkTravel } from './check.mjs';

const F = join(import.meta.dirname, 'fixtures');
const html = (f) => gunzipSync(readFileSync(join(F, f))).toString('utf8');
const json = (f) => JSON.parse(readFileSync(join(F, f), 'utf8'));
const read = (f) => JSON.parse(readFileSync(join(import.meta.dirname, f), 'utf8'));
const names = read('cdc/names.json');
const packing = read('cdc/packing.json');

describe('CDC', () => {
  it('liste des destinations', () => {
    const list = parseDestinationList(html('cdc-list.html.gz'));
    expect(list.size).toBeGreaterThan(240);
    expect(list.get('reunion')).toBe('Réunion (France)');
  });

  it('chaque destination a un code ISO valide (pas un code retiré de la norme)', () => {
    const mapping = read('cdc/destinations.json');
    const list = parseDestinationList(html('cdc-list.html.gz'));
    for (const slug of list.keys()) expect(mapping[slug], slug).toBeTruthy();
    const retired = ['DD', 'DY', 'FX', 'HV', 'SU', 'TP', 'UK', 'YU', 'BU', 'ZR', 'IC'];
    for (const [slug, m] of Object.entries(mapping)) {
      expect(m.iso2, slug).toMatch(/^[A-Z]{2}$/);
      expect(retired, slug).not.toContain(m.iso2);
    }
  });

  it('page praticien du Kenya : alertes, vaccins, paludisme, fièvre jaune, maladies', () => {
    const page = parseDestinationPage(html('cdc-kenya-clinician.html.gz'), 'Kenya');
    expect(page.notices.length).toBeGreaterThan(0);
    expect(page.notices[0]).toMatchObject({ level: 1, url: expect.stringMatching(/^https:\/\/wwwnc\.cdc\.gov\/travel\/notices\//), date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    const malaria = page.vaccines.find((v) => v.disease === 'Malaria');
    expect(malaria.updated).toBe('2025-04-23');
    expect(malaria.sections['Transmission areas'][0]).toMatch(/^All areas \(including game parks\)/);
    // Appels de note retirés
    expect(malaria.sections['Recommended chemoprophylaxis'][0]).not.toMatch(/\d$/);
    const yf = page.vaccines.find((v) => v.disease === 'Yellow Fever');
    expect(Object.keys(yf.sections)).toEqual(['CDC recommendations', 'Country entry requirements']);
    expect(page.diseases.map((d) => d.disease)).toContain('Schistosomiasis');
    expect(page.diseases.find((d) => d.disease === 'Dengue')).toMatchObject({ group: 'Avoid bugs', spread: ['Mosquito bite'] });
  });

  it('repères dérivés : noms français, paludisme, fièvre jaune, indicateurs', () => {
    const page = parseDestinationPage(html('cdc-kenya-clinician.html.gz'), 'Kenya');
    page.staySafe = [];
    page.packing = [];
    const warnings = [];
    const d = derive({ page, names, packing, warn: (w) => warnings.push(w) });
    expect(warnings).toEqual([]);
    expect(d.malaria.areas.length).toBe(1);
    expect(d.yellowFever).toMatchObject({ recommended: 'some', entry: 'from-risk' });
    expect(d.flags).toMatchObject({ malaria: true, mosquitoes: true, ticks: true, freshwater: true, foodWater: true, rabies: 'common' });
    expect(d.diseases.find((x) => x.id === 'dengue')).toMatchObject({ fr: 'Dengue', group: 'insects', vector: 'mosquito' });
    expect(d.vaccines.find((x) => x.id === 'yellow-fever').fr).toBe('Fièvre jaune');
  });

  it('Guyane : fièvre jaune exigée de tous', () => {
    const page = parseDestinationPage(html('cdc-french-guiana-clinician.html.gz'), 'French Guiana');
    const yf = yellowFeverStatus(page.vaccines.find((v) => v.disease === 'Yellow Fever'));
    expect(yf.entry).toBe('all');
    expect(yf.recommended).toBe('all');
  });

  it('fièvre jaune et rage : phrases types', () => {
    const v = (...lines) => ({ content: lines.map((text) => ({ text })) });
    expect(yellowFeverStatus(v('CDC recommendations: Vaccine is not recommended.', 'Country entry requirements: Vaccine is not required.'))).toMatchObject({ recommended: 'no', entry: 'no' });
    expect(yellowFeverStatus(v('CDC recommendations: Vaccine is generally not recommended for travel to Eritrea.', 'Travel from countries with risk for YF virus transmission: Vaccine is required for travelers ≥1 year old.'))).toMatchObject({ recommended: 'generally-not', entry: 'from-risk' });
    expect(yellowFeverStatus(v('Country entry requirements: Easter Island has not stated its YF vaccination certificate requirements'))).toMatchObject({ entry: 'unknown' });
    expect(rabiesInDogs(v('Dogs infected with rabies are not commonly found in Spain.'))).toBe('rare');
    expect(rabiesInDogs(v('Dogs infected with rabies are sometimes found in Argentina.'))).toBe('sometimes');
    expect(malariaStatus({ sections: { 'Transmission areas': ['None'] }, content: [] })).toBeNull();
  });

  it('page voyageur : seulement les conseils propres à la destination', () => {
    const page = parseDestinationPage(html('cdc-peru-traveler.html.gz'), 'Peru');
    expect(page.staySafe.some((s) => /Machu Picchu/.test(s))).toBe(true);
    expect(page.staySafe.every((s) => s.includes('Peru'))).toBe(true);
    expect(page.staySafe.some((s) => /embassy to verify/.test(s))).toBe(false);
  });

  it('liste de bagages : tous les articles ont un libellé français', () => {
    const list = parsePackingList(html('cdc-peru-packing.html.gz'));
    expect(list.length).toBeGreaterThan(50);
    for (const p of list) {
      expect(packing.items[p.item], p.item).toBeTruthy();
      expect(packing.categories[p.category], p.category).toBeTruthy();
    }
    expect(list.find((p) => p.item === 'Diarrhea medicine').note).not.toMatch(/</);
    expect(list.find((p) => p.item === 'Contact card').list.length).toBe(5);
  });

  it('étiquettes de l’app connues', () => {
    const tags = ['fever', 'pain', 'cold', 'cough', 'throat', 'allergy', 'digestion', 'nausea', 'diarrhea', 'constipation', 'skin', 'wound', 'burn', 'bruise', 'muscle', 'insects', 'eyes', 'teeth', 'sleep', 'stress', 'infection', 'heart', 'breathing', 'vitamins', 'sun', 'lice', 'child', 'travel', 'homeopathy'];
    const ids = new Set();
    for (const it of Object.values(packing.items)) {
      expect(ids.has(it.id), it.id).toBe(false);
      ids.add(it.id);
      for (const t of it.tags ?? []) expect(tags, it.id).toContain(t);
    }
  });

  it('dates anglaises', () => {
    expect(isoDate('Updated April 3, 2025')).toBe('2025-04-03');
    expect(isoDate('rien')).toBeNull();
  });
});

describe('France Diplomatie', () => {
  it('liste des pays et adresses', () => {
    const list = parseCountryList(html('diplomatie-list.html.gz'));
    expect(list.length).toBeGreaterThan(190);
    expect(list.find((c) => c.name === 'Afrique du Sud').slug).toBe('afrique-du-sud');
    expect(slugify('Côte d’Ivoire')).toBe('cote-d-ivoire');
  });

  it('noms → codes ISO', () => {
    expect(diplomatieIso('Allemagne')).toBe('DE');
    expect(diplomatieIso('Zimbabwé')).toBe('ZW');
    expect(diplomatieIso('Vanuatu')).toBe('VU');
    expect(diplomatieIso('Birmanie')).toBe('MM');
    expect(diplomatieIso('Arctique')).toBe(false);
    for (const c of parseCountryList(html('diplomatie-list.html.gz'))) expect(diplomatieIso(c.name), c.name).not.toBeNull();
  });

  it('rubrique Santé du Kenya, sans les encadrés du site', () => {
    const page = parseHealthPage(html('diplomatie-kenya-sante.html.gz'));
    expect(page.updated).toBe('2026-09-25');
    expect(page.blocks[0]).toEqual({ h: 3, text: 'Avant le départ' });
    expect(healthTopics(page)).toContain('Paludisme');
    expect(healthTopics(page)).toContain('Fièvre de la vallée du Rift');
    const all = JSON.stringify(page.blocks);
    expect(all).not.toMatch(/Fil d'Ariane|Donnez-nous votre avis/);
    expect(page.blocks.some((b) => b.li?.startsWith('Fièvre jaune :'))).toBe(true);
  });

  it('dates françaises', () => {
    expect(frenchDate('Date de mise à jour le : 1er août 2026')).toBe('2026-08-01');
  });
});

describe('ECDC', () => {
  it('légende et table par destination, outre-mer à part', () => {
    const legend = parseLegend(json('ecdc-albopictus-legend.json'));
    expect(legend).toMatchObject({ INV001A: 'present', INV002A: 'introduced', INV003A: 'absent', INV004A: 'unknown' });
    const table = parseVectorTable(json('ecdc-albopictus-fr-pt.json'), legend);
    expect(table.FR.present).toContain('Bouches-du-Rhône');
    expect(table.FR.present).not.toContain('La Réunion');
    expect(table.RE.present).toEqual(['La Réunion']);
    expect(table.FR.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(() => parseVectorTable({ features: [{ attributes: { CNTR_CODE: 'FR', AssessedDistributionStatus: 'X' } }] }, legend)).toThrow(/inconnu/);
  });
});

describe('climat', () => {
  it('normales NASA POWER', () => {
    const c = parsePower(json('power-lisbon.json'));
    expect(c.max).toHaveLength(12);
    expect(c.max[7]).toBeGreaterThan(c.max[0]);
    expect(c.uv).toHaveLength(12);
    expect(() => parsePower({})).toThrow();
  });

  it('villes espacées, capitale d’abord', () => {
    const places = [
      { name: 'Grande', lat: 40, lon: 0, population: 9e6, capital: false },
      { name: 'Capitale', lat: 41, lon: 1, population: 1e6, capital: true },
      { name: 'Loin', lat: 50, lon: 10, population: 5e5, capital: false },
      { name: 'Proche', lat: 41.5, lon: 1.5, population: 8e5, capital: false },
    ];
    expect(pickPlaces(places).map((p) => p.name)).toEqual(['Capitale', 'Loin']);
  });
});

describe('contrôles', () => {
  const destination = (id) => ({
    id,
    iso2: 'FR',
    name: { fr: 'France', en: 'France' },
    places: [],
    flags: { malaria: false },
    cdc: { url: 'https://x', vaccines: [], diseases: [], packing: ['bandages'], yellowFever: null },
    diplomatie: null,
    vectors: {},
  });
  const data = (n) => ({ schemaVersion: 1, retrieved: '2026-11-17', sources: SOURCES, packing: { items: { bandages: {} } }, destinations: Array.from({ length: n }, (_, i) => destination(`d${i}`)) });

  it('volumes minimums et destinations attendues', () => {
    const { errors } = checkTravel({ data: data(3), compressedSize: 500000, previous: null });
    expect(errors.some((e) => /destinations : 3, minimum/.test(e))).toBe(true);
    expect(errors.some((e) => /Destination attendue absente : france/.test(e))).toBe(true);
  });

  it('article de liste inconnu', () => {
    const d = data(1);
    d.destinations[0].cdc.packing = ['inconnu'];
    expect(checkTravel({ data: d, compressedSize: 500000, previous: null }).errors.some((e) => /article de liste inconnu/.test(e))).toBe(true);
  });
});
