# MORROW : objectifs sourcés avant conception des cartes

Modification du 10 octobre 2026, après autorisation de modifier le moteur. Aucun appel fournisseur réel n'a été lancé et aucun gain pédagogique ou de vitesse n'est revendiqué.

## Comportement du parcours textuel par défaut

Le premier appel ne peut plus produire de cartes : son contrat extrait les identités minimales et les connaissances assessables, avec type, conditions et identifiants de sources. Le compilateur local `lib/knowledgeCompiler.ts` rejette les références absentes, les concepts inconnus et les objectifs sans preuve primaire. Il fusionne les références des objectifs identiques, normalise uniquement les équivalences Unicode canoniques et l'ordre des conditions, puis sélectionne au maximum 36 objectifs en parcourant les pages à tour de rôle. Les objectifs non retenus et les rejets restent enregistrés.

Un second appel conçoit les cartes depuis les unités compilées **et les extraits originaux**. Chaque carte référence une unité retenue ; son concept, son type de tâche et ses sources sont contrôlés localement. Les faits ne peuvent pas devenir des mécanismes/applications par simple choix du concepteur. Une seule carte par objectif évite les répétitions directes ; la paraphrase entre objectifs distincts reste une limite.

Les audits pédagogiques et factuels existants suivent toujours. Les unités compilées ne sont pas réputées vraies : leurs assertions peuvent provenir d'une extraction erronée, et les cartes restent vérifiées contre les sources originales. La couverture ne dépend plus uniquement du jugement global de l'auditeur : chaque unité sans carte acceptée devient une omission explicite. Une page ne devient pas complète quand des unités qui lui appartiennent sont restées sans carte acceptée, même si l'audit global est optimiste.

Chaque plan est conservé dans `quality_settings`, sous `knowledge-plan:<documentId>:<runId>`, avec empreinte des passages et données d'extraction pour une nouvelle conception. Les cartes acceptées automatiquement reçoivent une `knowledgeTrace` avec unité, plan, assertion et conditions. Les résultats en cache sauvegardent aussi leur plan pour l'exécution courante. Les cartes modifiées par l'utilisateur et les historiques FSRS restent protégés par les chemins de publication existants.

## Autres corrections structurelles

- Une page visuelle déclenche le parcours visuel pour cette page seulement. Les pages textuelles de la même section conservent leur parcours textuel.
- Les citations scientifiques sont comparées en NFC, sans effacer la casse : exposants, indices et préfixes d'unités restent distincts.
- Le catalogue préfère les fins de ligne/paragraphe puis de phrase pour les longues sources, avant le repli sur une coupure à un espace. Tous les caractères sont conservés. Un découpage arbitraire reste possible sur des lignes très longues ; il n'est pas prétendu sémantiquement parfait.
- Les versions de génération et d'exactitude ont changé pour ne pas réutiliser silencieusement des validations calculées selon l'ancien contrat de citations.

## Coût et limites

Ce changement ajoute **un appel d'écriture** au parcours textuel par défaut : extraction + conception remplacent l'appel unique combiné. Pour une section sans réparation et avec un lot factuel pour les identités et un pour les cartes, cinq appels sont prévus au lieu de quatre. Le nombre réel de lots dépend du volume. Les audits et la réparation bornée n'ont pas été supprimés pour fabriquer un résultat plus rapide. Le cache évite de refaire une extraction/conception réussie avec les mêmes sources et réglages.

L'ancien parcours riche optionnel est conservé pour les imports demandant explicitement des leçons. Le parcours des figures utilise encore le moteur visuel existant ; il n'est pas remplacé par une transcription textuelle incomplète. Ce point reste important sur le PDF réel retrouvé, dont le graphique de page 29 n'a presque aucun texte extractible. Ni l'OCR ni la compréhension réelle de ces figures n'ont été améliorés par cette étape.

Les limites de 12 concepts, 72 unités extraites et 36 unités retenues restent des bornes techniques. La liste extraite n'est pas une vérité de référence exhaustive ; le contrôle de couverture compare aussi les sources dans l'audit existant. Une sélection alternant les pages est préférable au tri par importance modèle, mais ne garantit pas une bonne couverture des thèmes. Le type de connaissance peut lui-même être mal extrait. Aucune égalité avec RemNote n'est démontrée.

## Vérifications

Les nouveaux tests ciblent fusion des preuves, permutation des conditions, références invalides, sélection 4/4 entre deux pages quand huit unités sont retenues, tâche causale interdite sur un fait, absence d'objectif cachée par un audit optimiste, traçabilité persistée et réutilisation du cache. Le test du routage mixte vérifie qu'une seule figure ne détourne pas deux pages textuelles vers le moteur visuel. Ils utilisent des doubles de modèle et des bases jetables, sans appel API ; leur réussite ne mesure pas la pédagogie.

Les scripts historiques d'audit hors ligne conservent volontairement leurs attentes sur les anciens défauts. Après ces corrections, les scripts qui affirmaient l'acceptation de citations altérées ou produisaient le patch historique peuvent échouer : ce n'est pas une régression du moteur. Les tests courants sont `scripts/test-knowledge-compiler.mjs` et `scripts/test-source-first-import.mjs`.

Validation finale de cette étape : `npm test`, `npm run lint` et `npm run build` réussis. La suite et la compilation ont été exécutées séparément, car les tests isolés utilisent `.next` et le build nettoie ce répertoire. Les contrôles techniques ne prouvent aucun progrès pédagogique mesuré. Aucun contenu réel de la bibliothèque n'a été régénéré.
