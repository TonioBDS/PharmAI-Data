/**
 * Cartes des vecteurs de l'ECDC (moustique tigre, Aedes aegypti, tique Ixodes ricinus) par
 * région européenne (NUTS), publiées sur l'atlas Environnement et santé de l'Agence
 * européenne pour l'environnement. Licence CC BY 4.0, attribution à l'ECDC (voir SOURCES.md).
 */

const BASE = 'https://air.discomap.eea.europa.eu/arcgis/rest/services/EnvHealthAtlas';

export const VECTORS = [
  { id: 'aedes-albopictus', service: 'ECDC_Aedes_albopictus', fr: 'Moustique tigre (Aedes albopictus)' },
  { id: 'aedes-aegypti', service: 'ECDC_Aedes_aegypti', fr: 'Moustique Aedes aegypti' },
  { id: 'ixodes-ricinus', service: 'ECDC_Ixode_ricinus', fr: 'Tique Ixodes ricinus' },
];

export const vectorUrls = (v) => ({
  legend: `${BASE}/${v.service}/MapServer/legend?f=json`,
  query: `${BASE}/${v.service}/MapServer/0/query?where=1%3D1&outFields=CNTR_CODE,LocationCode,LocationName,NUTS_NAME,AssessedDistributionStatus,DateSelected&returnGeometry=false&f=json`,
});

/** Libellés de la légende → statut normalisé. */
const STATUS = {
  established: 'present',
  present: 'present',
  introduced: 'introduced',
  absent: 'absent',
  'antic. absent': 'absent',
  'obs. absent': 'absent',
  'no data': 'unknown',
  unknown: 'unknown',
};

/** Légende ArcGIS → { code: statut }. Un libellé inconnu fait échouer la construction. */
export function parseLegend(json) {
  const out = {};
  for (const layer of json.layers ?? []) {
    for (const entry of layer.legend ?? []) {
      const status = STATUS[String(entry.label).trim().toLowerCase()];
      if (!status) throw new Error(`légende ECDC inconnue : ${entry.label}`);
      for (const code of entry.values ?? []) out[code] = status;
    }
  }
  if (!Object.keys(out).length) throw new Error('légende ECDC vide');
  return out;
}

/** Codes pays de l'atlas (Eurostat) → ISO 3166. */
const COUNTRY = { EL: 'GR', UK: 'GB' };
/** Régions éloignées publiées à part (outre-mer, archipels) : préfixe NUTS → destination. */
const REMOTE = { FRY1: 'GP', FRY2: 'MQ', FRY3: 'GF', FRY4: 'RE', FRY5: 'YT', PT20: 'PT-20', PT30: 'PT-30', ES70: 'ES-CN' };
const destinationOf = (a) => {
  const code = String(a.LocationCode ?? '');
  for (const [prefix, dest] of Object.entries(REMOTE)) if (code.startsWith(prefix)) return dest;
  return COUNTRY[a.CNTR_CODE] ?? a.CNTR_CODE;
};

/**
 * Table de l'atlas → par destination (code ISO du pays, ou de la région éloignée) : régions où le vecteur est présent (installé) ou introduit,
 * et date du relevé. Les régions absentes ou sans donnée ne sont que comptées.
 */
export function parseVectorTable(json, legend) {
  if (json.exceededTransferLimit) throw new Error('table ECDC tronquée');
  const out = {};
  for (const { attributes: a } of json.features ?? []) {
    if (!a?.CNTR_CODE || !a.AssessedDistributionStatus) continue;
    const status = legend[a.AssessedDistributionStatus];
    if (!status) throw new Error(`statut ECDC inconnu : ${a.AssessedDistributionStatus}`);
    const iso = destinationOf(a);
    const c = (out[iso] = out[iso] ?? { present: [], introduced: [], absent: 0, unknown: 0, date: null });
    if (status === 'present' || status === 'introduced') {
      const name = a.NUTS_NAME || a.LocationName;
      if (name && !c[status].includes(name)) c[status].push(name);
    } else c[status]++;
    const d = a.DateSelected && /^\d{8}$/.test(a.DateSelected) ? `${a.DateSelected.slice(0, 4)}-${a.DateSelected.slice(4, 6)}-${a.DateSelected.slice(6)}` : null;
    if (d && (!c.date || d > c.date)) c.date = d;
  }
  for (const c of Object.values(out)) {
    c.present.sort((x, y) => x.localeCompare(y, 'fr'));
    c.introduced.sort((x, y) => x.localeCompare(y, 'fr'));
  }
  return out;
}
