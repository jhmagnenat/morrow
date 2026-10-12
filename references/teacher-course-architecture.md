# Architecture actuelle : enseigner à partir de slides incomplets

Le contrat de référence est [PRODUCT.md](../PRODUCT.md). Les documents antérieurs décrivant une génération « source-only » et l'interdiction d'ajouter du contexte sont historiques.

## Chemin de production

`generationDispatch` → adaptateur de génération du cours → `professorGeneration` → publication transactionnelle dans `generationRepository`.

Le moteur générique ne sélectionne pas de règles d'assurance ou d'un autre domaine. Il effectue quatre étapes au plus pour un lot non administratif :

1. `reconstruct_teaching` : unités pédagogiques et affirmations avec origine et ancrages dans les slides.
2. `audit_teaching` : relecture distincte des affirmations des slides, du contexte disciplinaire ajouté et des illustrations. Les affirmations incertaines ou rejetées sont enregistrées comme points à clarifier et ne rejoignent pas le cours accepté.
3. `teaching_cards` : cartes courtes, sur les dimensions pertinentes, exclusivement à partir des affirmations acceptées.
4. `audit_teaching_cards` : contrôle indépendant des questions, réponses, hypothèses et couverture. Les cartes rejetées restent des brouillons.

Un lot sans affirmation pédagogique n'appelle ni relecteur de leçon ni rédacteur de cartes ; le contrôle final explicite sa classification. Les pages administratives reconnues localement ne consomment aucun appel. Il n'y a pas de boucle automatique de réparation sémantique. Les nouvelles fonctions utilisent des schémas structurés et la validation locale ; les audits peuvent utiliser un modèle distinct du même fournisseur.

Les anciens moteurs conservent leurs scripts de regression historiques, mais ne sont pas le chemin de production. Les types de cartes et certains noms internes « direct » restent compatibles avec les données et API existantes.

L'ancien moteur strict a été déplacé dans `legacy-generation/generationEngine-pre-teacher.ts.txt`. Le code de production utilise `professorGeneration.ts` et le contrat neutre `generationOutput.ts` ; il n'importe plus ses prompts ni ses extracteurs spécialisés.

## Provenance, stockage et invalidation

`teachingCourse.ts` définit les objets partagés. Une leçon est stockée dans `quality_settings` sous `teaching-lesson:<id>`, donc conservée par les sauvegardes et transferts existants. Les versions immuables permettent aux cartes anciennes de conserver leur fondation ; l'interface affiche la dernière reconstruction par groupe de pages.

Chaque carte ajoute `teaching` : identifiant et empreinte de la leçon, affirmations précises, origine, relecteur et date. Ce champ est inclus dans l'empreinte de contrôle de la carte. Toute modification des affirmations, de l'origine, du cours ou des slides invalide sa disponibilité automatique. Une correction humaine du texte retire l'ancienne provenance pédagogique au lieu de conserver une approbation obsolète.

Les citations désignent toujours des passages originaux : aucun texte généré n'est maquillé en citation du PDF. Un intitulé court peut ancrer une explication ajoutée. Une preuve visuelle seule demande une inspection humaine de la carte contre le PDF original avant publication prête. Une carte fondée sur un schéma peut donc rester brouillon même si la leçon a été relue par le modèle.

Les inputs de cache excluent les dates de relecture non pédagogiques. Une régénération inchangée réutilise les quatre sorties. Les appels sont liés à la révision des sources et protégés par les verrous et transactions existants. Les cartes étudiées, corrigées, suspendues ou issues d'une inspection humaine sont protégées.

La leçon acceptée est enregistrée dès la fin de sa relecture, après vérification des sources et du verrou. Elle reste consultable si le fournisseur échoue ensuite pendant la création des cartes. Les cartes sont publiées transactionnellement après leur propre contrôle ; une modification des sources rend les leçons précédentes indisponibles.

## Interface et révisions

Le parcours principal est Import slides → Course → Cards → Review. Les dimensions des cartes partagent la file et le planificateur FSRS ; ce ne sont pas des modes obligatoires. Les exercices historiques restent sous More practice. Le réglage Strict/Open s'applique au chat, pas à la reconstruction du cours.

Le lecteur expose les ajouts, illustrations et points non résolus. L'éditeur et les révisions affichent l'origine de la carte. L'export TSV ajoute l'origine et les affirmations au champ Sources ; l'export APKG ajoute le contexte au verso. Les exports complets préservent les leçons et les traces.

## Vérification

`node scripts/test-professor-generation.mjs` utilise exclusivement des réponses simulées et une base jetable. Il vérifie contexte absent des slides, rejection de fausses affirmations, incertitude, dimensions, provenance, cache, sauvegarde, export, sources modifiées et préservation des révisions. Les tests historiques du moteur strict ne démontrent pas la qualité de ce moteur.

La validation scientifique réelle reste à faire avec un fournisseur disponible et des slides représentatifs. Aucun appel payant ni changement de données utilisateur n'est nécessaire pour les tests de regression. La réforme n'affirme ni une meilleure rétention, ni une parité avec RemNote, ni une qualité de 10/10.

Le scénario navigateur `scripts/check-teacher-ui.mjs` vérifie le lecteur, la révision, le menu secondaire sur mobile et l'export Anki. Il exige le cours jetable créé par `scripts/seed-teacher-preview.mjs`, servi sur le port 3004, et un navigateur de test avec le port de débogage 9223. Il refuse de s'exécuter sur un cours personnel. Exécuter le seed après la compilation : Next peut nettoyer `.next` pendant le build. Les captures de la démonstration sont conservées dans `references/ui-baselines/teacher-*.png`.
