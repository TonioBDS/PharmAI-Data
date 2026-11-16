#!/usr/bin/env node
/**
 * Données de voyage : relève les sources officielles, les met en forme et écrit un fichier
 * par destination dans travel/data/ (relu en pull request avant publication).
 *
 *   node travel/build.mjs --download [--cache build/travel-cache]   relevé complet
 *   node travel/build.mjs --from build/travel-cache                  depuis un relevé existant
 *
 * Sources et licences : SOURCES.md. Rien ici ne recommande un traitement : les textes officiels
 * sont repris tels quels, avec leur date et leur adresse, et l'app renvoie vers un médecin.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CDC_BASE, parseDestinationList, parseDestinationPage, parsePackingList } from './cdc/parse.mjs';
import { POWER_URL, distanceKm, parsePower, pickPlaces, placesByCountry } from './climate/climate.mjs';
import { adviceUrl, healthUrl, parseCountryList, parseHealthPage, healthTopics } from './diplomatie/parse.mjs';
import { VECTORS, parseLegend, parseVectorTable, vectorUrls } from './ecdc/vectors.mjs';
import { derive } from './derive.mjs';

const HERE = import.meta.dirname;
const ROOT = join(HERE, '..');
export const DATA_DIR = join(HERE, 'data');
const CLIMATE_CACHE = join(HERE, 'climate', 'cache.json');
const UA = 'PharmAI-Data (+https://github.com/TonioBDS/PharmAI-Data)';
const NE_PLACES = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson';
const DIPLOMATIE_LIST = 'https://www.diplomatie.gouv.fr/fr/information-par-pays';

/** Sources reprises, avec la mention demandée par chacune (rappelée dans SOURCES.md et dans l'app). */
export const SOURCES = {
  cdc: {
    name: "CDC Travelers' Health (Centers for Disease Control and Prevention)",
    url: 'https://wwwnc.cdc.gov/travel',
    licence: 'Domaine public (œuvre du gouvernement fédéral des États-Unis)',
    attribution:
      "Source : CDC Travelers' Health, contenu disponible gratuitement sur cdc.gov. Texte repris en anglais, sans modification ; libellés français ajoutés par PharmAI. Sa reprise n'implique aucune approbation du CDC, du HHS ou du gouvernement des États-Unis.",
  },
  diplomatie: {
    name: 'France Diplomatie, Conseils aux voyageurs (ministère de l’Europe et des Affaires étrangères)',
    url: 'https://www.diplomatie.gouv.fr/fr/conseils-aux-voyageurs/',
    licence: 'Licence Ouverte 2.0',
    licenceUrl: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/',
    attribution: 'Source : France Diplomatie, rubrique Santé des Conseils aux voyageurs, date de mise à jour indiquée pour chaque pays. Texte repris sans modification.',
  },
  ecdc: {
    name: 'ECDC et EFSA, cartes des vecteurs (VectorNet), via l’atlas Environnement et santé de l’Agence européenne pour l’environnement',
    url: 'https://www.ecdc.europa.eu/en/disease-vectors/surveillance-and-disease-data',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: 'Source : ECDC (European Centre for Disease Prevention and Control) et EFSA, cartes VectorNet. Données réduites à la liste des régions par statut ; aucune autre modification.',
  },
  power: {
    name: 'NASA POWER (Prediction Of Worldwide Energy Resources), normales climatiques 2001-2025',
    url: 'https://power.larc.nasa.gov',
    licence: 'Domaine public',
    attribution: 'Données obtenues du projet POWER du NASA Langley Research Center (LaRC), financé par le programme NASA Earth Science/Applied Science.',
  },
  naturalearth: {
    name: 'Natural Earth (villes)',
    url: 'https://www.naturalearthdata.com',
    licence: 'Domaine public',
    attribution: 'Made with Natural Earth.',
  },
  cldr: {
    name: 'Unicode CLDR (noms de pays en français)',
    url: 'https://cldr.unicode.org',
    licence: 'Unicode License v3',
    licenceUrl: 'https://www.unicode.org/license.txt',
    attribution: 'Noms de pays : Unicode CLDR, Copyright © Unicode, Inc.',
  },
};

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Relevé : chaque adresse est enregistrée sous un nom de fichier, puis relue depuis le disque. */
class Source {
  constructor(dir, download) {
    this.dir = dir;
    this.download = download;
    mkdirSync(dir, { recursive: true });
  }

  async get(name, url, { delay = 300, optional = false } = {}) {
    const file = join(this.dir, name);
    if (existsSync(file)) return readFileSync(file, 'utf8');
    if (!this.download) {
      if (optional) return null;
      throw new Error(`relevé incomplet : ${name}`);
    }
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(90_000) });
        if (res.status === 404 && optional) {
          writeFileSync(file + '.absent', url);
          return null;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.text();
        mkdirSync(join(file, '..'), { recursive: true });
        writeFileSync(file, body);
        await sleep(delay);
        return body;
      } catch (err) {
        if (attempt >= 3) {
          if (optional) return null;
          throw new Error(`${url} : ${err.message}`);
        }
        await sleep(5000 * attempt);
      }
    }
  }

  absent(name) {
    return existsSync(join(this.dir, name + '.absent'));
  }
}

const json = async (src, name, url, opts) => {
  const body = await src.get(name, url, opts);
  return body == null ? null : JSON.parse(body);
};

/** Nom français d'un pays (CLDR, livré avec Node). */
const frenchName = (() => {
  const names = new Intl.DisplayNames(['fr'], { type: 'region' });
  return (iso) => names.of(iso);
})();

const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Codes retirés de la norme ISO 3166 que CLDR nomme encore (Allemagne de l'Est, Rhodésie…). */
const DEPRECATED = new Set(['AN', 'BU', 'CS', 'DD', 'DY', 'FX', 'HV', 'NH', 'NT', 'QO', 'RH', 'SU', 'TP', 'UK', 'YD', 'YU', 'ZR', 'EU', 'EZ', 'UN', 'IC', 'EA', 'CP', 'DG', 'TA', 'AC']);

/** Pays de France Diplomatie → code ISO (noms CLDR, plus quelques intitulés propres au site). */
export function diplomatieIso(name) {
  const special = read(join(HERE, 'diplomatie', 'countries.json'));
  if (name in special) return special[name];
  const names = new Intl.DisplayNames(['fr'], { type: 'region' });
  for (let a = 65; a < 91; a++)
    for (let b = 65; b < 91; b++) {
      const code = String.fromCharCode(a, b);
      let n;
      try {
        n = names.of(code);
      } catch {
        continue;
      }
      if (n && n !== code && !DEPRECATED.has(code) && norm(n) === norm(name)) return code;
    }
  return null;
}

export async function build({ cache, download, log = console.log }) {
  const src = new Source(cache, download);
  const warnings = [];
  const warn = (w) => {
    if (!warnings.includes(w)) warnings.push(w);
  };
  const mapping = read(join(HERE, 'cdc', 'destinations.json'));
  const names = read(join(HERE, 'cdc', 'names.json'));
  const packing = read(join(HERE, 'cdc', 'packing.json'));
  const extraPlaces = read(join(HERE, 'climate', 'places.json'));

  // CDC : liste des destinations, puis trois pages par destination
  const list = parseDestinationList(await src.get('cdc/list.html', `${CDC_BASE}/travel/destinations/list`));
  if (list.size < 200) throw new Error(`liste du CDC trop courte (${list.size})`);
  for (const slug of list.keys()) if (!mapping[slug]) warn(`Destination du CDC sans correspondance ISO (travel/cdc/destinations.json) : ${slug}`);
  for (const slug of Object.keys(mapping)) if (!list.has(slug)) warn(`Destination disparue de la liste du CDC : ${slug}`);

  const cdc = {};
  let n = 0;
  for (const [slug, name] of list) {
    if (!mapping[slug]) continue;
    if (++n % 25 === 0) log(`CDC : ${n}/${list.size}`);
    const clinician = await src.get(`cdc/clinician/${slug}.html`, `${CDC_BASE}/travel/destinations/clinician/none/${slug}`);
    const traveler = await src.get(`cdc/traveler/${slug}.html`, `${CDC_BASE}/travel/destinations/traveler/none/${slug}`);
    const pack = await src.get(`cdc/packing/${slug}.html`, `${CDC_BASE}/travel/destinations/${slug}/traveler/packing-list`, { optional: true });
    const page = parseDestinationPage(clinician, name);
    page.staySafe = parseDestinationPage(traveler, name).staySafe;
    page.packing = pack ? parsePackingList(pack) : [];
    cdc[slug] = { name, ...page };
  }

  // France Diplomatie : rubrique Santé de chaque pays
  const diplo = {};
  const countries = parseCountryList(await src.get('diplomatie/list.html', DIPLOMATIE_LIST));
  if (countries.length < 150) throw new Error(`liste de France Diplomatie trop courte (${countries.length})`);
  for (const c of countries) {
    const iso = diplomatieIso(c.name);
    if (iso === false) continue; // territoire sans destination (Arctique…)
    if (!iso) {
      warn(`Pays de France Diplomatie sans code ISO (travel/diplomatie/countries.json) : ${c.name}`);
      continue;
    }
    const html = await src.get(`diplomatie/sante/${c.slug}.html`, healthUrl(c.slug), { optional: true, delay: 500 });
    const page = html ? parseHealthPage(html) : null;
    if (!page) {
      warn(`Rubrique Santé introuvable sur France Diplomatie : ${c.name} (${healthUrl(c.slug)})`);
      continue;
    }
    diplo[iso] = { name: c.name, url: adviceUrl(c.slug), healthUrl: healthUrl(c.slug), ...page };
  }

  // ECDC : vecteurs par région européenne
  const vectors = {};
  for (const v of VECTORS) {
    const urls = vectorUrls(v);
    const legend = parseLegend(await json(src, `ecdc/${v.id}-legend.json`, urls.legend));
    vectors[v.id] = parseVectorTable(await json(src, `ecdc/${v.id}.json`, urls.query), legend);
  }

  // Villes (Natural Earth) et climat (NASA POWER, mis en cache : les normales ne changent pas)
  const byCountry = placesByCountry(await json(src, 'naturalearth/populated-places.geojson', NE_PLACES));
  const climateCache = existsSync(CLIMATE_CACHE) ? read(CLIMATE_CACHE) : {};
  const usedClimate = {};
  const climateOf = async (place) => {
    const key = `${place.lat},${place.lon}`;
    if (!climateCache[key]) {
      if (!download) {
        warn(`Climat absent du cache : ${place.name} (${key})`);
        return null;
      }
      try {
        climateCache[key] = parsePower(JSON.parse(await src.get(`power/${key}.json`, POWER_URL(place.lat, place.lon), { delay: 1000 })));
      } catch (err) {
        warn(`Climat indisponible pour ${place.name} : ${err.message}`);
        return null;
      }
    }
    usedClimate[key] = climateCache[key];
    return climateCache[key];
  };

  // Assemblage, une destination à la fois
  const destinations = {};
  const itemCategory = {};
  for (const [slug, m] of Object.entries(mapping)) {
    const page = cdc[slug];
    if (!page) continue;
    const key = m.region ?? m.iso2;
    let candidates = extraPlaces[slug] ?? (m.region ? [] : (byCountry.get(m.iso2) ?? []));
    // Le territoire principal d'un pays n'inclut pas ses archipels publiés à part
    if (!extraPlaces[slug]) {
      const remote = Object.entries(mapping)
        .filter(([s, o]) => o.iso2 === m.iso2 && o.region && extraPlaces[s])
        .flatMap(([s]) => extraPlaces[s]);
      candidates = candidates.filter((p) => remote.every((r) => distanceKm(r, p) > 400));
    }
    const places = [];
    for (const p of pickPlaces(candidates.map((p) => ({ population: 0, capital: false, ...p })))) {
      const climate = await climateOf(p);
      if (climate) places.push({ name: p.name, ...(p.region ? { region: p.region } : {}), lat: p.lat, lon: p.lon, climate });
    }
    if (!places.length && slug !== 'antarctica') warn(`Aucune ville avec climat pour ${slug}`);

    const d = derive({ slug, mapping: m, page, names, packing, warn, itemCategory });
    const vec = {};
    for (const v of VECTORS) {
      const c = vectors[v.id][key];
      if (c) vec[v.id] = c;
    }
    const health = m.region ? null : (diplo[m.iso2] ?? null);
    destinations[slug] = {
      id: slug,
      iso2: m.iso2,
      ...(m.region ? { region: m.region } : {}),
      name: { fr: m.fr ?? frenchName(m.iso2), en: page.name },
      places,
      flags: { ...d.flags, ...(vec['aedes-albopictus']?.present.length || vec['aedes-aegypti']?.present.length ? { mosquitoes: true } : {}), ...(vec['ixodes-ricinus']?.present.length ? { ticks: true } : {}) },
      cdc: {
        url: `${CDC_BASE}/travel/destinations/traveler/none/${slug}`,
        clinicianUrl: `${CDC_BASE}/travel/destinations/clinician/none/${slug}`,
        packingUrl: `${CDC_BASE}/travel/destinations/${slug}/traveler/packing-list`,
        notices: page.notices,
        vaccines: d.vaccines,
        malaria: d.malaria,
        yellowFever: d.yellowFever,
        diseases: d.diseases,
        staySafe: page.staySafe,
        packing: d.packing,
      },
      diplomatie: health ? { url: health.url, healthUrl: health.healthUrl, updated: health.updated, topics: healthTopics(health), blocks: health.blocks } : null,
      vectors: vec,
    };
  }

  return { destinations, climate: usedClimate, climateCache, warnings, packing, names, itemCategory };
}

/** Écrit travel/data/ (un fichier par destination, ordre stable pour des différences lisibles). */
export function writeData({ destinations, climateCache, packing, names, itemCategory = {}, retrieved = new Date().toISOString().slice(0, 10) }) {
  rmSync(DATA_DIR, { recursive: true, force: true });
  mkdirSync(join(DATA_DIR, 'destinations'), { recursive: true });
  for (const [slug, d] of Object.entries(destinations)) writeFileSync(join(DATA_DIR, 'destinations', `${slug}.json`), JSON.stringify(d, null, 1) + '\n');
  const items = {};
  for (const [en, it] of Object.entries(packing.items)) items[it.id] = { en, ...it, id: undefined, category: itemCategory[it.id] ?? null };
  const diseases = {};
  for (const [en, x] of Object.entries(names.diseases)) diseases[x.id] = { en, fr: x.fr, ...(x.vector ? { vector: x.vector } : {}) };
  const groups = {};
  for (const [en, x] of Object.entries(names.groups)) groups[x.id] = groups[x.id] ?? { en, fr: x.fr };
  writeFileSync(
    join(DATA_DIR, 'common.json'),
    JSON.stringify(
      {
        packing: { categories: Object.fromEntries(Object.entries(packing.categories).map(([en, c]) => [c.id, { en, fr: c.fr }])), items },
        diseases,
        groups,
        vectors: Object.fromEntries(VECTORS.map((v) => [v.id, { fr: v.fr }])),
      },
      null,
      1,
    ) + '\n',
  );
  writeFileSync(join(DATA_DIR, 'sources.json'), JSON.stringify({ retrieved, sources: SOURCES }, null, 1) + '\n');
  writeFileSync(CLIMATE_CACHE, JSON.stringify(Object.fromEntries(Object.entries(climateCache).sort(([a], [b]) => a.localeCompare(b)))) + '\n');
}

export function report({ destinations, warnings }) {
  const list = Object.values(destinations);
  const count = (f) => list.filter(f).length;
  return [
    `Destinations : ${list.length}`,
    `- avec rubrique Santé de France Diplomatie : ${count((d) => d.diplomatie)}`,
    `- avec climat : ${count((d) => d.places.length)}`,
    `- paludisme signalé : ${count((d) => d.flags.malaria)}`,
    `- fièvre jaune exigée à l'entrée (tous voyageurs) : ${count((d) => d.cdc.yellowFever?.entry === 'all')}`,
    `- avec liste de bagages du CDC : ${count((d) => d.cdc.packing.length)}`,
    '',
    warnings.length ? `Points à vérifier (${warnings.length}) :\n${warnings.map((w) => `- ${w}`).join('\n')}` : 'Aucun point à vérifier.',
  ].join('\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const download = argv.includes('--download');
  const cacheArg = argv[argv.indexOf(download ? '--cache' : '--from') + 1];
  const cache = argv.includes('--cache') || argv.includes('--from') ? cacheArg : join(ROOT, 'build', 'travel-cache');
  const result = await build({ cache, download });
  writeData(result);
  const text = report(result);
  mkdirSync(join(ROOT, 'build'), { recursive: true });
  writeFileSync(join(ROOT, 'build', 'travel-report.md'), text + '\n');
  console.log(text);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.stack ?? err.message);
    process.exit(1);
  });
}
