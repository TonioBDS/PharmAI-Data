import { parse } from 'node-html-parser';

/**
 * Lecture des « Conseils aux voyageurs » de France Diplomatie (ministère de l'Europe et des
 * Affaires étrangères), sous Licence Ouverte 2.0 : rubrique « Santé » de chaque pays, reprise
 * en entier avec sa date de mise à jour (voir SOURCES.md).
 */

export const DIPLOMATIE_BASE = 'https://www.diplomatie.gouv.fr';

const clean = (s) =>
  s
    .replace(/ | /g, ' ')
    .replace(/[ \t\r\n]+/g, ' ')
    .replace(/\s+([,.)])/g, '$1')
    .replace(/\s+;/g, ' ;')
    .trim();
const text = (el) => (el ? clean(el.textContent) : '');

/** Adresse de la page d'un pays à partir de son nom tel qu'il figure dans la liste du site. */
export function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Liste déroulante des pays : noms en français, dans l'ordre du site. */
export function parseCountryList(html) {
  const root = parse(html);
  const select = root.querySelector('select[data-drupal-selector="edit-select-pays"]') ?? root.querySelector('select');
  if (!select) return [];
  return select
    .querySelectorAll('option')
    .map((o) => ({ id: o.getAttribute('value'), name: text(o) }))
    .filter((o) => o.id)
    .map((o) => ({ ...o, slug: slugify(o.name) }));
}

export const healthUrl = (slug) => `${DIPLOMATIE_BASE}/fr/information-par-pays/${slug}/conseils-aux-voyageurs-sante`;
export const adviceUrl = (slug) => `${DIPLOMATIE_BASE}/fr/information-par-pays/${slug}`;

const FRENCH_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** « 25 septembre 2026 » → « 2026-09-25 » */
export function frenchDate(s) {
  const m = /(\d{1,2})(?:er)? ([a-zéû]+) (\d{4})/i.exec(s ?? '');
  const month = m ? FRENCH_MONTHS.indexOf(m[2].toLowerCase()) + 1 : 0;
  return month ? `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}

/** Encadrés de service du site, sans rapport avec le pays. */
const SERVICE = /^(Vous voyagez à l'étranger|Donnez-nous votre avis|Vérifiez que vous êtes bien assurés)/;

/**
 * Rubrique « Santé » : suite ordonnée de blocs { h: 3|4|5, text } (intertitres), { p } et
 * { li }, telle qu'affichée sur le site, à partir du premier intertitre de niveau 3.
 */
export function parseHealthPage(html) {
  const root = parse(html);
  for (const a of root.querySelectorAll('script, style')) a.remove();
  const main = root.querySelectorAll('div.fr-col-md-8').find((d) => d.querySelector('h3'));
  if (!main) return null;
  const date = frenchDate(text(main.querySelector('.diplomatie--hdp-date--changed')));
  const blocks = [];
  let started = false;
  let skipping = false;
  for (const el of main.querySelectorAll('h3, h4, h5, p, li')) {
    const tag = el.rawTagName.toLowerCase();
    const t = text(el);
    if (!t) continue;
    if (tag[0] === 'h') {
      skipping = SERVICE.test(t);
      if (skipping) continue;
      if (tag === 'h3') started = true;
      if (started) blocks.push({ h: Number(tag[1]), text: t });
      continue;
    }
    if (!started || skipping) continue;
    // Un paragraphe dans une puce est déjà repris par la puce
    if (tag === 'p' && el.closest('li')) continue;
    if (tag === 'li' && el.querySelector('li')) {
      const own = clean(el.childNodes.filter((n) => n.rawTagName?.toLowerCase() !== 'ul' && n.rawTagName?.toLowerCase() !== 'ol').map((n) => n.textContent).join(' '));
      if (own) blocks.push({ li: own });
      continue;
    }
    blocks.push(tag === 'li' ? { li: t } : { p: t });
  }
  return blocks.length ? { updated: date, blocks } : null;
}

/** Intitulés de niveau 5 (une maladie par intertitre dans « Risques sanitaires »). */
export function healthTopics(page) {
  return page ? page.blocks.filter((b) => b.h === 5).map((b) => b.text.replace(/\s*\(.*\)$/, '')) : [];
}
