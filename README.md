# PharmAI-Data

Données publiques de l'application **PharmAI** (armoire à pharmacie de la maison), construites,
contrôlées et signées automatiquement, puis téléchargées par les téléphones. Elles se mettent
à jour sans nouvelle version de l'app.

| Donnée | Contenu | Mise à jour |
| --- | --- | --- |
| `catalog-fr.db.gz` | Catalogue des médicaments vendus en France (boîtes, codes, substances, génériques) | chaque lundi, automatique si les contrôles passent |
| `travel.json.gz` (à venir) | Points d'attention par destination et par saison | chaque mois, après relecture |

Les fichiers publiés sont dans la publication
[`donnees`](https://github.com/TonioBDS/PharmAI-Data/releases/tag/donnees), avec
`manifest.json` : version, taille, empreinte SHA-256 de chaque fichier, signé (Ed25519).
L'app vérifie la signature et l'empreinte avant d'utiliser un fichier.

## Organisation

```
catalog/
  schema.json        structure attendue par l'app (commune à tous les pays)
  fr/                France : build.mjs (construction), known.json (contrôles), fixtures/
  <pays>/            un dossier par pays ajouté, même forme
travel/              données de voyage (à venir)
scripts/             contrôles, manifeste, signature, alertes, état
status.json          date du dernier contrôle réussi de chaque donnée
```

## Contrôles avant publication

Un seul échec et rien n'est publié : les téléphones gardent la version précédente.

- base intègre, structure conforme à `catalog/schema.json` ;
- nombre de médicaments, boîtes, compositions et génériques au-dessus d'un minimum, et proche
  de la version précédente (± 5 à 15 % selon la table) ;
- boîtes connues (`known.json`) retrouvées par code, avec le bon nom et la bonne substance ;
- recherches par nom qui donnent des résultats ;
- taille du fichier compressé plausible.

## Alertes

- **Échec d'une tâche** : un ticket « Alerte : … » est ouvert (le propriétaire est mentionné,
  GitHub lui écrit), commenté aux échecs suivants, refermé à la première réussite.
- **Veille du dimanche** : alerte si une donnée n'a pas été contrôlée avec succès depuis 15 jours
  (tâche suspendue, par exemple).
- **Suspension par GitHub** : les tâches planifiées d'un dépôt public sont suspendues après
  60 jours sans activité. Chaque contrôle réussi enregistre sa date dans `status.json`, ce qui
  compte comme activité.
- **Surveillance externe (facultative)** : si le secret `HEALTHCHECK_CATALOG_FR` contient l'adresse
  d'un contrôle [healthchecks.io](https://healthchecks.io), chaque exécution s'y signale ; ce
  service écrit s'il n'a plus de nouvelles.

## Interventions manuelles

- **Variation légitime refusée** (changement de format de la source, retrait massif) : vérifier
  le journal, puis Actions › Catalogue France › Run workflow avec « Accepter une forte variation ».
- **Boîte connue retirée du marché** : la remplacer dans `catalog/fr/known.json`.
- **Clé de signature** (secret `PHARMAI_DATA_SIGNING_KEY`) : jamais copiée ailleurs. Pour en
  changer : ajouter la nouvelle clé publique à `scripts/keys.json` et à l'app, publier l'app,
  puis remplacer le secret et `KEY_ID` dans `scripts/manifest.mjs`.

## Licences

Scripts sous licence MIT ; données sous la licence de leur source (voir `SOURCES.md`).
Ce dépôt ne contient aucun code de l'app ni du serveur PharmAI.
