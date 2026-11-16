# Données de voyage

Informations santé par destination, reprises des sources officielles (liste, licences et
mentions dans `SOURCES.md`), relevées chaque mois et publiées après relecture.

## Contenu de `data/destinations/<destination>.json`

| Champ | Contenu | Source |
| --- | --- | --- |
| `id`, `iso2`, `region`, `name` | identifiant du CDC, code ISO 3166 (région : ISO 3166-2), nom français et anglais | CDC, CLDR |
| `places` | une à quatre villes éloignées d'au moins 600 km, avec 12 mois de températures (moyenne, extrêmes moyens), pluie (mm/j), humidité, indice UV moyen sur 24 h | Natural Earth, NASA POWER |
| `flags` | repères : paludisme, moustiques, tiques, phlébotomes, eau et aliments, eau douce (bilharziose), altitude, rage chez les chiens (`common`, `sometimes`, `rare`) | dérivés des pages du CDC et des cartes de l'ECDC |
| `cdc.notices` | alertes sanitaires en cours (niveau, titre, date, résumé) | CDC |
| `cdc.vaccines` | une entrée par maladie : nom français, texte complet du CDC, date, références | CDC |
| `cdc.malaria` | zones de transmission, espèces, résistances, date (les noms de médicaments restent dans le texte complet, jamais mis en avant) | CDC |
| `cdc.yellowFever` | `recommended` (`all`, `some`, `generally-not`, `no`) et `entry` (`all`, `from-risk`, `no`, `unknown`), texte complet | CDC |
| `cdc.diseases` | maladies non évitables par un vaccin : groupe (`food-water`, `insects`, `animals`, `airborne`…), vecteur, modes de transmission, conseils | CDC |
| `cdc.staySafe` | conseils propres à la destination (altitude, baignade, numéros d'urgence…) | CDC |
| `cdc.packing` | articles de la liste de bagages santé du CDC pour cette destination (libellés dans `common.json`) | CDC |
| `diplomatie` | rubrique Santé complète, en français, avec sa date de mise à jour et la liste des maladies traitées | France Diplomatie |
| `vectors` | moustique tigre, *Aedes aegypti*, tique *Ixodes ricinus* : régions où présents ou introduits | ECDC |

`common.json` : libellés français des articles de la liste de bagages (avec les étiquettes de
l'app qui permettent de proposer les produits de l'armoire), des maladies, des groupes et des
vecteurs. `sources.json` : date du relevé et mentions des sources.

## Fichiers tenus à la main

- `cdc/destinations.json` : destination du CDC → code ISO (et région pour les archipels).
- `cdc/names.json`, `cdc/packing.json` : libellés français. Un intitulé nouveau chez le CDC est
  signalé dans la pull request mensuelle ; il suffit de l'ajouter ici.
- `diplomatie/countries.json` : noms de France Diplomatie que CLDR ne reconnaît pas.
- `climate/places.json` : villes des petits territoires et des régions publiées à part ;
  `climate/cache.json` : normales déjà relevées (elles ne changent pas).

## Ce que ces données ne font pas

Elles ne recommandent aucun traitement ni aucune dose : les textes officiels sont repris tels
quels, avec leur date et leur adresse, et l'app renvoie vers un médecin ou un centre de
vaccinations internationales pour tout ce qui relève d'une prescription (paludisme, vaccins,
antibiotiques, mal d'altitude).

## Relancer à la main

```bash
node travel/build.mjs --download --cache build/travel-cache   # relevé complet (~45 min)
node travel/publish.mjs --out build/travel.json.gz && node travel/check.mjs --gz build/travel.json.gz
```
