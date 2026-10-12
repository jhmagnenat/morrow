> Historical implementation report, before the teacher-course reform. For the current product and generation contract, read [PRODUCT.md](../PRODUCT.md) and [teacher-course-architecture.md](teacher-course-architecture.md). Source-only restrictions in this report do not apply to the current production pipeline.

# Comprendre avant de mémoriser dans Morrow

La méthode C.L.A.I.R. proposée pour Morrow s'inspire de l'intuition d'abord et du formalisme ensuite de [BetterExplained](https://betterexplained.com/articles/adept-method/). C.L.A.I.R. est notre adaptation, pas le nom de leur méthode.

## Architecture réutilisée

L'import PDF, les passages par slide, le plan de cours, les concepts essentiels, les liens et les audits existants restent le socle. `generateSlides` transforme les leçons intuitives auditées en données C.L.A.I.R. après sauvegarde des relations. Les détails secondaires restent dans les explications plutôt que de devenir systématiquement des concepts ou cartes indépendants. Cette structuration ne nécessite pas d'appel IA supplémentaire.

`notion_metadata.clair` contient le contexte, les étapes causales, le formalisme, les relations avec leur provenance, une situation avec hypothèses explicites et une question de reconstruction. Les relations de chapitre servent à naviguer ; elles ne deviennent pas des dépendances scientifiques. Le parcours dans `learningPath` place les prérequis avant les concepts dépendants et garde accessibles les cycles et concepts isolés.

## Utilisation

- **Study → Understand** : avancer concept par concept, puis Contexte, Logique, Articulations, Implications et Reconstruction. Les réponses aux situations et à la reconstruction sont révélées à la demande. Lire une explication ne donne aucun point de maîtrise.
- **Knowledge Map** : la couleur indique la maîtrise évaluée. Sélectionner un concept ouvre sa leçon et les slides sources dans le panneau existant.
- **Interview → Course understanding** : questions de définition, causalité, relations, application et explication sans notes. Les compétences faibles sont prioritaires. Le mode d'entretien professionnel est conservé.
- **Drills / Explain** : les résultats alimentent les mêmes dimensions. Une faiblesse évaluée en Interview ou Explain avance les cartes déjà étudiées qui testent la compétence concernée ; elle ne crée ni faux historique de révision ni récompense. Les nouvelles cartes conservent le budget quotidien partagé.

Les cours existants gardent leurs notes, cartes et historiques. Les concepts sans leçon C.L.A.I.R. affichent leur explication habituelle. Régénérer depuis les sources crée les nouvelles leçons pour les concepts générés modifiables ; les notes validées ou corrigées manuellement restent protégées. Modifier le contenu d'un concept invalide sa leçon structurée pour éviter qu'une ancienne génération masque la correction.

L’import progressif génère désormais des leçons C.L.A.I.R. compactes par section, utilisables avant la fin du cours. **Deepen understanding** dans Study enrichit un seul concept à la demande, avec un audit indépendant et des variantes de transfert. Le résultat est sauvegardé sans modifier les cartes, échéances ou historiques. Une leçon approfondie inchangée est préservée lors du réimport. Voir [les mesures et limites du pipeline](generation-performance.md).

## Maîtrise et révisions

Cinq compétences sont évaluées séparément : définition, mécanisme, relations, application et reconstruction. Chaque dimension utilise ses observations récentes, avec davantage de poids pour les dernières. Une faiblesse récente limite le score de la dimension ; les compétences non évaluées restent inconnues.

Le niveau global tient compte de la compétence observée la plus faible. Le statut « mastered » exige au moins deux observations pour chacune des cinq compétences et une reconstruction réussie évaluée sans aide. Une bonne définition seule ne suffit pas. La déclaration « sans aide » repose sur l'honnêteté de l'utilisateur, pas sur une surveillance. Les anciens scores globaux sont conservés mais ne certifient pas des compétences jamais évaluées.

La maîtrise et les intervalles de répétition sont distincts. Le planificateur utilise désormais les équations FSRS-6 et leurs paramètres publics par défaut, avec des étapes courtes de réapprentissage. La rétention cible vaut 90 %, configurable entre 70 % et 99 % via les réglages de l’API quality. Les historiques disponibles reconstruisent la mémoire sans modifier les échéances existantes ; une carte sans historique exploitable commence une nouvelle estimation au prochain rappel. Les paramètres peuvent être ajustés par cours après validation chronologique ; voir [les conditions et limites](reliability-and-scheduling.md). Aucun gain de rétention propre à Morrow n’a été mesuré.

La certification de maîtrise exige aussi deux tâches d’application distinctes réussies. Les nouvelles leçons contiennent jusqu’à trois situations de transfert auditées, avec leurs hypothèses et raisonnements. Interview privilégie les questions moins répétées parmi les compétences faibles. Les limites scientifiques sont séparées des limites de l’analogie.

## Provenance et limites

Les citations sont vérifiées contre les passages des slides. Les analogies et situations hypothétiques sont présentées comme des aides pédagogiques, avec les hypothèses de l'exercice ; elles ne sont pas attribuées au professeur. Le mode Interview de cours exige des leçons dont les citations existent dans les sources. Une banque de questions déterministe évite un appel IA pour démarrer chaque entretien ; l'évaluation de la réponse utilise l'IA. Les situations ne sont donc pas nécessairement nouvelles à chaque session.

Les contrôles bloquent notamment les citations absentes, certaines réponses circulaires et les égalités numériques explicites incorrectes. Le contrôle arithmétique couvre des expressions simples : il ne prouve pas des théorèmes et ne vérifie pas toutes les formules, unités ou hypothèses. Une citation valide et un audit IA ne garantissent pas une explication juste. La qualité sur des cours universitaires réels nécessite encore une évaluation humaine avec leurs slides, notamment pour les figures et raisonnements avancés. Aucune supériorité générale sur RemNote ou NotebookLM n'est démontrée par ces tests.

`GET /api/learning` expose le parcours et les compétences. `GET /api/reliability` expose les problèmes vérifiables de provenance et qualité, sans inventer un pourcentage de vérité.

## Sauvegarde et Anki

Les migrations sont additives ; les sauvegardes conservent les leçons, dimensions et indications de reconstruction sans aide. Les sauvegardes anciennes restent importables. Une sauvegarde invalide est rejetée avant remplacement du cours.

`GET /api/export?format=anki` exporte les cartes prêtes dont les citations et contrôles sont valides. Le TSV contient **ID, Front, Back, Sources, Tags**. Dans Anki, créer un type de note avec ces champs, **ID en premier**, et utiliser Front/Back dans le modèle ; cet identifiant permet les réimports. L'export texte ne transfère ni les intervalles ni les médias. Les cartes exclues sont comptées dans les en-têtes HTTP. L'export JSON complet reste disponible.

## Vérification

`npm test` utilise des bases jetables : structuration, génération, compétences, partage Interview/Drills, réessais idempotents, calculs, export, sauvegardes anciennes et restauration invalide. Les routes Interview sont exercées avec une évaluation simulée, sans appel payant. Lint, TypeScript et compilation production complètent ces tests.

Le scénario navigateur `--check-clair` utilise exclusivement le cours fictif de `seed-clair-preview.mjs`, un serveur isolé au port 3002 et un profil Chrome de test. Il vérifie les étapes Study, réponses masquées, sources, Drill, Map et Interview. Les évaluations sont simulées : ce test vérifie le workflow, pas la qualité d'un modèle IA.

`MORROW_DATA_DIR` et `MORROW_BUILD_DIR` permettent d'isoler les données et la compilation pour ces vérifications. Sans ces variables, les chemins habituels restent utilisés.
