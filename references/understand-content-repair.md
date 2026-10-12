> Historical implementation report, before the teacher-course reform. For the current product and generation contract, read [PRODUCT.md](../PRODUCT.md) and [teacher-course-architecture.md](teacher-course-architecture.md). Source-only restrictions in this report do not apply to the current production pipeline.

# Correction d’Understand — 9 octobre 2026

Les exemples signalés ne relevaient pas seulement d’une ancienne génération.
La version `slides-v12-clair-reliability` avait fusionné des concepts distincts
sur une suggestion du modèle, puis remplacé définition, explication et leçon
sans changer le titre. Trois contaminations ont été constatées dans le cours
par défaut : fonction actuarielle → conception de produits ; assurance vie →
interdépendance des étapes ; dépenses des ménages → transfert de risque.

La génération détaillée et progressive exigent maintenant une identité de
titre identique pour réutiliser une notion. Une synonymie proposée par le
modèle ne suffit plus à écraser un nœud. Les leçons portent leur propre titre ;
la sauvegarde et l’affichage refusent un titre incompatible, y compris celui
des anciennes questions de reconstruction. Une ancienne leçon sans `depth`
n’est plus considérée automatiquement comme une leçon approfondie. Les
corrections de notes invalident leur ancienne leçon supplémentaire. Le cache
local d’Understand tient compte du cours et de la leçon reçue du serveur.

L’audit d’approfondissement exige des décisions individuelles pour le
contexte, la réponse, les étapes, le formalisme, les conditions, les limites,
l’exercice, chaque variante et l’analogie éventuelle. Une approbation globale
ne compense pas une décision absente ou une mauvaise page d’appui. Ces contrôles
complètent l’audit du modèle ; ils ne prouvent pas une exactitude de 90 %.

Huit notions existantes ont été réécrites contre les pages originales 22, 23,
31–36 : fonction actuarielle, actifs, passifs, capital/résultat, assurance vie,
dépenses des ménages, rôle de l’actuaire et chaîne de valeur. Elles contiennent
un problème concret, les distinctions utiles, des étapes explicatives et deux
exercices résolus aux hypothèses explicites. Les exemples numériques sont
déclarés hypothétiques. Les chiffres de dépenses proviennent de l’image
originale de la page 22 ; leur provenance visuelle est liée à l’empreinte du PDF,
pas présentée comme une citation de son titre extrait. Le diagramme de la page
32 a aussi été inspecté : il ne place pas l’actuariat sous le service juridique.

La première application a corrigé 17 cartes, ajouté 7 cartes et suspendu 2
cartes redondantes. Les identifiants existants et toutes les tables d’historique
ont été conservés. Sauvegarde avant intervention :
`data/backups/before-understand-repair-1791574243909.db`.
Le script `scripts/repair-understand-content.mjs` fournit un aperçu par défaut,
une transaction avec contrôle des sources et des modifications concurrentes,
une sauvegarde avant application, et protège les modifications manuelles.

Validation : suite `npm test`, compilation TypeScript et lint ; réparation
d’abord exercée sur une copie du cours réel, avec zéro anomalie détectée dans
ces huit leçons. La page `/study` du serveur local contient les textes corrigés.
Des régressions simulent explicitement une fusion fausse approuvée par le
modèle, une ancienne leçon sans profondeur et un audit de contexte absent.
Le reste des notions n’est pas déclaré réaudité ; aucune nouvelle note globale
ni comparaison de résultats pédagogiques n’est certifiée.

## Révision complète du cours — v17

Les 38 pages originales ont été examinées, y compris les diagrammes et
graphiques. Le cours actif contient désormais 48 notions, 144 cartes
(une distinction décisive et deux exercices résolus par notion), six groupes
de navigation et 35 connexions expliquées. Cinq sujets manquants ont été
ajoutés : tarification, besoin du client et produit, climat et risques
émergents, ressources humaines et audit. Sept notions publicitaires ou
redondantes sont archivées, sans supprimer leurs identifiants ou historiques.

Les tableaux des pages 22 et 25–30 portent une provenance visuelle liée à
l’empreinte du PDF inspecté ; leurs chiffres ne sont pas attribués à une
citation textuelle du seul titre. Les millésimes, périmètres et unités sont
explicites. Les explications de fond qui dépassent les seuls intitulés du
support et les exercices hypothétiques sont identifiés comme tels.

Application réalisée avec `scripts/apply-insurance-curriculum.mjs --apply` :
43 notions corrigées, cinq ajoutées, 100 cartes réécrites, 44 ajoutées et
69 anciennes cartes suspendues. Sauvegarde préalable :
`data/backups/before-curriculum-v17-1791580572255.db`.
Toutes les tables d’historique sont inchangées. Les contrôles de provenance,
de structure pédagogique et de calcul ne détectent aucune anomalie parmi
les 144 cartes ; ce résultat ne constitue pas une mesure indépendante de
l’exactitude ou de l’efficacité pédagogique.

Le graphe d’apprentissage exclut les archives tout en préservant Browse et
les sauvegardes. Interview accepte les leçons issues de visuels vérifiés,
et rejette cette provenance si le PDF change. La synchronisation signale
aussi les corrections de leçon sans changement de carte. La disposition de
l’interface reste inchangée.

Validation : suite de tests, lint, TypeScript et compilation de production.
Le nouveau test de migration vérifie la prévisualisation sans écriture,
le refus d’un PDF modifié ou d’une source absente, la sauvegarde, la
réapplication sans doublons, les modifications manuelles et un historique
FSRS existant. Deux régressions couvrent les visuels dans Interview et
l’invalidation du cache après une correction de leçon seule. Le serveur
local `/study` renvoie les nouvelles notions et exclut les publicités.
