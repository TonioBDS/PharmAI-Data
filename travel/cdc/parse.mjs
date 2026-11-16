import { parse } from 'node-html-parser';

/**
 * Lecture des pages « Travelers' Health » du CDC (domaine public, voir SOURCES.md).
 * Le texte est repris tel quel (en anglais) : seules la structure et quelques indicateurs
 * dérivés (présence de paludisme, moustiques, eau…) sont ajoutés, pour que l'app puisse
 * afficher des repères en français et renvoyer au texte officiel.
 */

export const CDC_BASE = 'https://wwwnc.cdc.gov';

const clean = (s) =>
  s
    // Balises laissées en texte par le site (« <p">Examples… »)
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/ /g, ' ')
    .replace(/[ \t\r\n]+/g, ' ')
    .replace(/\s+([,.;:)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .trim();

const text = (el) => (el ? clean(el.textContent) : '');
const absolute = (href) => (!href ? null : href.startsWith('http') ? href.replace(/^http:/, 'https:') : href.startsWith('/') ? CDC_BASE + href : null);

const MONTHS = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 };
/** « April 23, 2025 » → « 2025-04-23 » */
export function isoDate(s) {
  const m = /([A-Z][a-z]+)\.? (\d{1,2}), (\d{4})/.exec(s ?? '');
  if (!m || !MONTHS[m[1]]) return null;
  return `${m[3]}-${String(MONTHS[m[1]]).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

/** Liste des destinations : slug → nom affiché par le CDC. */
export function parseDestinationList(html) {
  const out = new Map();
  for (const m of html.matchAll(/href="\/travel\/destinations\/traveler\/none\/([a-z0-9-]+)"[^>]*>([^<]+)</g)) {
    out.set(m[1], clean(parse(m[2]).textContent));
  }
  return out;
}

/** Paragraphes et puces d'une cellule, dans l'ordre, sans les liens « See footnotes ». */
function blocks(cell) {
  const out = [];
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType !== 1) continue;
      const tag = child.rawTagName?.toLowerCase();
      if (tag === 'ul' || tag === 'ol') {
        for (const li of child.querySelectorAll('li')) {
          const t = text(li);
          if (t) out.push({ bullet: t });
        }
      } else if (tag === 'strong' && node.rawTagName?.toLowerCase() === 'p') {
        const t = text(child);
        if (t) out.push({ heading: t });
      } else if (tag === 'p' || tag === 'div') {
        if (child.querySelector('ul, ol, p')) walk(child);
        else {
          const t = text(child);
          if (t && !/^See footnotes$/i.test(t)) out.push(child.querySelector('strong') && text(child.querySelector('strong')) === t ? { heading: t } : { text: t });
        }
      }
    }
  };
  walk(cell);
  // Texte nu (sans balise de paragraphe)
  if (!out.length) {
    const t = text(cell);
    if (t) out.push({ text: t });
  }
  return out;
}

/** Découpe une suite de blocs en rubriques à intertitre (« Transmission areas », …). */
function headed(list) {
  const sections = {};
  let current = '_';
  for (const b of list) {
    if (b.heading) {
      current = b.heading.replace(/\d+$/, '').replace(/:$/, '').trim();
      sections[current] = sections[current] ?? [];
    } else {
      (sections[current] = sections[current] ?? []).push(b.bullet ?? b.text);
    }
  }
  return sections;
}

function updated(list) {
  for (const b of list) {
    const t = b.text ?? b.bullet ?? '';
    if (/^Updated /.test(t)) return isoDate(t);
  }
  return null;
}

const without = (list) => list.filter((b) => !/^Updated /.test(b.text ?? b.bullet ?? ''));

function links(cell) {
  return cell
    .querySelectorAll('a')
    .map((a) => ({ title: text(a), url: absolute(a.getAttribute('href')) }))
    .filter((l) => l.title && l.url);
}

function section(root, id) {
  return root.querySelector(`#${id}`);
}

export function parseNotices(root) {
  const sec = section(root, 'travel-notices');
  if (!sec) return [];
  const out = [];
  let level = null;
  for (const el of sec.querySelectorAll('h4, li')) {
    if (el.rawTagName.toLowerCase() === 'h4') {
      const m = /Level (\d)/.exec(text(el));
      level = m ? Number(m[1]) : null;
      continue;
    }
    const a = el.querySelector('a');
    if (!a) continue;
    out.push({
      level,
      title: text(a),
      url: absolute(a.getAttribute('href')),
      date: isoDate(text(el.querySelector('.date'))),
      summary: text(el.querySelector('.summary')),
    });
  }
  return out;
}

/** Tableau « Vaccines and Medicines » : une ligne par maladie, texte complet. */
export function parseVaccines(root) {
  const sec = section(root, 'vaccines-and-medicines');
  if (!sec) return [];
  const out = [];
  for (const tr of sec.querySelectorAll('table tbody tr')) {
    const name = tr.querySelector('.clinician-disease');
    const reco = tr.querySelector('.clinician-recomendations');
    if (!name || !reco) continue;
    const content = blocks(reco);
    const guidance = tr.querySelector('.clinician-guidance');
    const a = name.querySelector('a');
    out.push({
      disease: text(name),
      url: absolute(a?.getAttribute('href')),
      updated: updated(content),
      content: without(content),
      sections: headed(without(content)),
      references: guidance ? links(guidance) : [],
    });
  }
  return out;
}

/** Tableau « Non-Vaccine-Preventable Diseases », regroupé comme sur le site. */
export function parseDiseases(root) {
  const sec = section(root, 'non-vaccine-preventable-diseases');
  const table = sec?.querySelector('table.disease');
  if (!table) return [];
  const out = [];
  let group = null;
  for (const tr of table.querySelectorAll('tbody tr')) {
    const h = tr.querySelector('h4');
    if (h) {
      group = text(h);
      continue;
    }
    const name = tr.querySelector('.other-clinician-disease');
    if (!name) continue;
    const list = (cls) => {
      const cell = tr.querySelector(cls);
      return cell ? blocks(cell).map((b) => b.bullet ?? b.text ?? b.heading) : [];
    };
    const a = name.querySelector('a');
    const guidance = tr.querySelector('.other-clinician-guidance');
    out.push({
      group,
      disease: text(name),
      url: absolute(a?.getAttribute('href')),
      spread: list('.other-clinician-notes'),
      advice: list('.other-clinician-patienteduction'),
      references: guidance ? links(guidance) : [],
    });
  }
  return out;
}

/**
 * Rubrique « Stay Healthy and Safe » (vue voyageur) : la plupart des conseils sont communs à
 * toutes les destinations ; on ne garde que les phrases qui nomment la destination (altitude,
 * baignade, paludisme…), le reste étant le même partout.
 */
export function parseStaySafe(root, name) {
  const sec = section(root, 'stay-healthy-and-safe');
  if (!sec || !name) return [];
  const short = name.replace(/\s*\(.*\)$/, '').replace(/^(.*), The$/, '$1');
  const out = [];
  for (const el of sec.querySelectorAll('p, li')) {
    const t = text(el);
    if (!t || !t.includes(short)) continue;
    if (/^(Learn actions|Bugs \(like mosquitoes|If your travel plans in|Food and water standards)/.test(t)) continue;
    if (/(embassy to verify|country-specific information for|Department of State|street lighting in certain parts|traffic safety and road conditions)/.test(t)) continue;
    if (out.includes(t)) continue;
    out.push(t);
  }
  return out;
}

/** Les appels de note (exposants) renvoient à la page source : on les retire du texte. */
function withoutFootnotes(root) {
  for (const sup of root.querySelectorAll('sup')) sup.remove();
  return root;
}

export function parseDestinationPage(html, name) {
  const root = withoutFootnotes(parse(html));
  return {
    notices: parseNotices(root),
    vaccines: parseVaccines(root),
    diseases: parseDiseases(root),
    staySafe: parseStaySafe(root, name),
  };
}

/** Liste « Healthy Travel Packing List » propre à la destination. */
export function parsePackingList(html) {
  const root = parse(html);
  const box = root.querySelector('#packing-list');
  if (!box) return [];
  const out = [];
  let category = null;
  for (const el of box.querySelectorAll('h4, ul.packing > li')) {
    if (el.rawTagName.toLowerCase() === 'h4') {
      category = text(el);
      continue;
    }
    const spans = el.querySelectorAll(':scope > span');
    const item = text(spans[0] ?? el);
    if (!item) continue;
    const note = spans
      .slice(1)
      .map(text)
      .filter(Boolean)
      .join(' ');
    const sub = el.querySelectorAll('li').map(text).filter(Boolean);
    out.push({ category, item, note: note || null, ...(sub.length ? { list: sub } : {}) });
  }
  return out;
}
