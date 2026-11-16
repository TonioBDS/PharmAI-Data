# Sources et licences

Les **scripts** de ce dépôt sont sous licence MIT (fichier `LICENSE`).
Les **données publiées** reprennent des sources officielles ; chacune garde sa licence,
rappelée ci-dessous avec l'attribution demandée.

| Donnée | Source | Licence | Attribution |
| --- | --- | --- | --- |
| Catalogue France (`catalog-fr.db.gz`) | [Base de données publique des médicaments](https://base-donnees-publique.medicaments.gouv.fr) (ANSM, HAS, Assurance maladie) | [Licence Ouverte 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/) | « Source : Base de données publique des médicaments », date de mise à jour dans la table `meta` |

Les données de voyage (dossier `travel/`) ne reprendront une source qu'après vérification
de sa licence ; une source non réutilisable est seulement citée en lien.

Note : la BDPM doit devenir « Info Médicament » en janvier 2027 (nouveaux formats sur
data.gouv.fr) ; `catalog/fr/build.mjs` sera adapté à ce moment-là. Les contrôles de
cohérence bloqueront la publication si le format change sans prévenir.
