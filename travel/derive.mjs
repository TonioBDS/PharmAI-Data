/**
 * Repères tirés des pages du CDC pour une destination : identifiants stables et noms français
 * des maladies, état « paludisme » et « fièvre jaune », indicateurs (moustiques, tiques, eau…)
 * qui permettent à l'app de proposer des catégories de la trousse. Les textes officiels restent
 * joints, inchangés : ces repères n'en sont qu'un résumé, sans aucune recommandation de traitement.
 */

const lines = (v) => (v ? v.content.map((b) => b.text ?? b.bullet ?? b.heading).filter(Boolean) : []);

/**
 * Fièvre jaune, d'après les phrases du CDC :
 *   recommended : 'all' (tous les voyageurs), 'some' (certaines zones), 'generally-not', 'no'
 *   entry : 'all' (exigée de tous), 'from-risk' (seulement en provenance d'un pays à risque),
 *           'no' (non exigée), 'unknown' (le pays ne l'a pas précisé)
 */
export function yellowFeverStatus(v) {
  if (!v) return null;
  const all = lines(v);
  const reco = all.filter((l) => !/required|requirement/i.test(l));
  let recommended = null;
  if (reco.some((l) => /recommended for (all )?travelers? ≥?\s?\d/.test(l) || /recommended for all travelers/.test(l))) {
    recommended = reco.some((l) => /recommended for all travelers ≥?\s?\d+ months? old\.?$/.test(l.replace(/^CDC recommendations: /, ''))) && !reco.some((l) => /not recommended|except|going to|densely/.test(l)) ? 'all' : 'some';
  } else if (reco.some((l) => /generally not recommended/.test(l))) recommended = 'generally-not';
  else if (reco.some((l) => /not recommended/.test(l))) recommended = 'no';

  const req = all.filter((l) => /required|requirement|has not stated/i.test(l));
  let entry = null;
  if (req.some((l) => /has not stated/.test(l))) entry = 'unknown';
  if (req.some((l) => /required for all (arriving )?travelers|required for all travelers/.test(l))) entry = 'all';
  else if (req.some((l) => /(from countries with risk|arriving from|resided for more than|in transit)[^.]*required|required[^.]*(arriving from|from countries)/i.test(l) || /^Travel from countries with risk[^:]*: Vaccine is required/.test(l))) entry = 'from-risk';
  else if (req.some((l) => /not required/.test(l))) entry = entry ?? 'no';
  return { recommended, entry, updated: v.updated, text: v.content, references: v.references };
}

/** Paludisme : présent si le CDC décrit des zones de transmission. */
export function malariaStatus(v) {
  if (!v) return null;
  const s = v.sections ?? {};
  const areas = s['Transmission areas'] ?? [];
  if (!areas.length || areas.every((a) => /^none\b/i.test(a))) return null;
  return {
    areas,
    species: s.Species ?? [],
    drugResistance: s['Drug resistance'] ?? [],
    updated: v.updated,
    text: v.content,
    references: v.references,
  };
}

/** Chiens porteurs de la rage : 'common', 'sometimes', 'rare' ou null (inconnu). */
export function rabiesInDogs(v) {
  const first = lines(v)[0] ?? '';
  if (/rabies are not commonly found/.test(first)) return 'rare';
  if (/rabies are commonly found/.test(first)) return 'common';
  if (/rabies are sometimes found/.test(first)) return 'sometimes';
  return null;
}

export function derive({ page, names, packing, warn }) {
  const disease = (en) => {
    const n = names.diseases[en];
    if (!n) warn(`Maladie sans nom français (travel/cdc/names.json) : ${en}`);
    return n ?? { id: en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), fr: null };
  };
  const vaccines = page.vaccines
    .filter((v) => !/\[\[/.test(JSON.stringify(v.content)))
    .map((v) => {
      const n = disease(v.disease);
      return { id: n.id, fr: n.fr, en: v.disease, url: v.url, updated: v.updated, text: v.content, references: v.references };
    });
  const byId = (id) => page.vaccines.find((v) => disease(v.disease).id === id);
  const malaria = malariaStatus(byId('malaria'));
  const yellowFever = yellowFeverStatus(byId('yellow-fever'));

  const diseases = page.diseases.map((d) => {
    const n = disease(d.disease);
    const g = names.groups[d.group];
    if (!g) warn(`Rubrique de maladies sans nom français (travel/cdc/names.json) : ${d.group}`);
    const vector = n.vector ?? (d.spread.some((s) => /mosquito/i.test(s)) ? 'mosquito' : d.spread.some((s) => /tick/i.test(s)) ? 'tick' : d.spread.some((s) => /sand ?fly/i.test(s)) ? 'sandfly' : undefined);
    return { id: n.id, fr: n.fr, en: d.disease, group: g?.id ?? null, ...(vector ? { vector } : {}), url: d.url, spread: d.spread, advice: d.advice, references: d.references };
  });

  const seen = new Set();
  const packingList = [];
  for (const p of page.packing) {
    const item = packing.items[p.item];
    if (!item) {
      warn(`Article de la liste du CDC sans libellé français (travel/cdc/packing.json) : ${p.item}`);
      continue;
    }
    if (!packing.categories[p.category]) warn(`Rubrique de la liste du CDC inconnue (travel/cdc/packing.json) : ${p.category}`);
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    packingList.push(item.id);
  }

  const vectorOf = (id) => names.diseases[Object.keys(names.diseases).find((en) => names.diseases[en].id === id)]?.vector;
  const ids = new Set([...vaccines.map((v) => v.id), ...diseases.map((d) => d.id)]);
  const vectors = new Set([...diseases.map((d) => d.vector), ...[...ids].map(vectorOf)].filter(Boolean));
  const rabies = byId('rabies');
  const flags = {
    malaria: !!malaria,
    mosquitoes: !!malaria || vectors.has('mosquito') || yellowFever?.recommended === 'all' || yellowFever?.recommended === 'some',
    ticks: vectors.has('tick'),
    sandflies: vectors.has('sandfly'),
    foodWater: ids.has('typhoid') || ids.has('cholera'),
    freshwater: ids.has('schistosomiasis'),
    altitude: page.staySafe.some((s) => /altitude/i.test(s)),
    rabies: rabiesInDogs(rabies),
  };
  return { vaccines, malaria, yellowFever, diseases, packing: packingList, flags };
}
