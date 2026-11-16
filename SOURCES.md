# Sources et licences

Les **scripts** de ce dépôt sont sous licence MIT (fichier `LICENSE`).
Les **données publiées** reprennent des sources officielles ; chacune garde sa licence,
rappelée ci-dessous avec l'attribution demandée.

| Donnée | Source | Licence | Attribution |
| --- | --- | --- | --- |
| Catalogue France (`catalog-fr.db.gz`) | [Base de données publique des médicaments](https://base-donnees-publique.medicaments.gouv.fr) (ANSM, HAS, Assurance maladie) | [Licence Ouverte 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/) | « Source : Base de données publique des médicaments », date de mise à jour dans la table `meta` |
| Voyage : alertes, vaccins, paludisme, fièvre jaune, maladies, conseils propres au pays, liste de bagages | [CDC Travelers' Health](https://wwwnc.cdc.gov/travel) (pages « clinician », « traveler » et « packing list » de chaque destination) | Domaine public (gouvernement fédéral des États-Unis) | « Source : CDC Travelers' Health, disponible gratuitement sur cdc.gov » ; texte anglais repris sans modification (hors appels de note), libellés français ajoutés par PharmAI ; aucune approbation du CDC, du HHS ou du gouvernement des États-Unis ; logos non repris |
| Voyage : rubrique Santé de chaque pays, en français | [France Diplomatie, Conseils aux voyageurs](https://www.diplomatie.gouv.fr/fr/conseils-aux-voyageurs/) (ministère de l'Europe et des Affaires étrangères) | [Licence Ouverte 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/) ([mentions légales](https://www.diplomatie.gouv.fr/fr/mentions-legales)) | « Source : France Diplomatie », date de mise à jour de chaque page ; texte repris sans modification |
| Voyage : moustique tigre, *Aedes aegypti*, tique *Ixodes ricinus* par région d'Europe | [ECDC et EFSA, cartes VectorNet](https://www.ecdc.europa.eu/en/disease-vectors/surveillance-and-disease-data), via l'[atlas Environnement et santé](https://discomap.eea.europa.eu/atlas/) de l'Agence européenne pour l'environnement | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) ([conditions de l'ECDC](https://www.ecdc.europa.eu/en/copyright)) | « Source : ECDC et EFSA, cartes VectorNet » ; données réduites à la liste des régions par statut et à la date du relevé |
| Voyage : climat mois par mois (températures, pluie, humidité, UV) | [NASA POWER](https://power.larc.nasa.gov), normales 2001-2025 | Domaine public | « Données obtenues du projet POWER du NASA Langley Research Center (LaRC), financé par le programme NASA Earth Science/Applied Science » |
| Voyage : villes retenues pour le climat | [Natural Earth](https://www.naturalearthdata.com) (populated places) | Domaine public | « Made with Natural Earth » |
| Voyage : noms de pays en français | [Unicode CLDR](https://cldr.unicode.org) (fourni par Node.js) | [Unicode License v3](https://www.unicode.org/license.txt) | « Noms de pays : Unicode CLDR, Copyright © Unicode, Inc. » |

Ces mentions sont aussi dans le fichier publié (`sources`), pour que l'app les affiche.

Sources consultées mais seulement citées en lien (droits réservés) : recommandations sanitaires
aux voyageurs de Santé publique France / Haut Conseil de la santé publique (BEH), fiches
« Conseils aux voyageurs » du Cespharm.

Les données de voyage (dossier `travel/`) ne reprennent une source qu'après vérification
de sa licence ; une source non réutilisable est seulement citée en lien.

Note : la BDPM doit devenir « Info Médicament » en janvier 2027 (nouveaux formats sur
data.gouv.fr) ; `catalog/fr/build.mjs` sera adapté à ce moment-là. Les contrôles de
cohérence bloqueront la publication si le format change sans prévenir.
