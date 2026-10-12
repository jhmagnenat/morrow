# MORROW — benchmark architectural hors ligne

**Suite autorisée :** certaines corrections ont ensuite été appliquées au moteur. Voir [l'architecture de production avec objectifs compilés](morrow-knowledge-compiler-production.md). Cet audit et ses observations décrivent l'état antérieur ; les empreintes conservées dans ses résultats identifient cet état.

Audit du 10 octobre 2026. Périmètre : laboratoire `scripts/benchmark-lab`, extraction PDF réutilisée depuis `lib/pdf.ts`, et rapport architectural antérieur. Le moteur de production et le frontend n'ont pas été modifiés.

**Aucun appel OpenAI/Anthropic, aucune expérience A/B/C lancée et aucune flashcard créée, y compris synthétique.** Les fonctions de génération, leurs clients et la suite `benchmark:test` n'ont pas été exécutés. Les simulations portent exclusivement sur des connaissances prédéfinies, des contrats et un calendrier d'étapes. Aucun score pédagogique n'est attribué.

## Protocole et preuves

- **Observation du code** : contrat, branche ou dépendance directement lisible. Elle démontre l'existence du comportement, pas sa fréquence sur des réponses réelles.
- **Observation PDF** : extraction et rendu locaux exécutés sans LLM, sur six PDF contrôlés et un document existant de 38 pages.
- **Simulation** : passage de données prédéfinies dans les fonctions locales `compileKnowledge`, `selectKnowledge`, `provenanceIssues` et le validateur de schéma. Aucun modèle simulé et aucune paire question/réponse ne sont utilisés.
- **Hypothèse** : effet probable sur l'exactitude, la pertinence ou la latence réelle, impossible à mesurer ici.

Reproduction : `node scripts/benchmark-lab/offline-audit.mjs`. Le script n'importe ni `provider.mjs`, ni `runner.mjs`, ni SDK. Il désactive explicitement l'OCR externe et bloque `fetch`. Il lit ces fichiers uniquement pour conserver leurs empreintes. Les seules fonctions exécutées des méthodes sont les transformations locales de connaissances ; `generateBatch` n'est jamais appelée.

Résultats : `data/benchmark-lab/offline-audit/results.json` ; historique JSON daté dans `history/` ; PDF contrôlés et rendus PNG dans ce même dossier. Les empreintes du code et du PDF permettent de distinguer les versions. Les caches de transpilation restent dans `.next/benchmark-lab-runtime`. Le script n'accède ni aux clés API, ni à la base de données, ni aux anciens résultats de cartes.

## Architecture réellement implémentée

Préparation commune (`core.mjs:33`) : lecture PDF → extraction texte et layout → sélection des pages → rendu PNG à l'échelle 1,5 → manifeste avec empreintes PDF/images, texte et configuration → lots fixes de deux pages par défaut. Les pages sélectionnées sont identiques pour les trois méthodes. La liste humaine de connaissances essentielles est conservée à part et n'alimente pas la génération.

| Axe | A — Direct Multimodal | B — Structured Pipeline | C — Knowledge Compiler |
|---|---|---|---|
| Étapes distantes prévues par lot | 1 : conception directe | 2 : extraction puis conception | 1 extraction + 0 à 3 conceptions spécialisées |
| Séparation des responsabilités | Sources → résultat, étape unique | Connaissances → résultat, deux étapes identifiables | Connaissances → IR locale → sélection → tâches spécialisées |
| Contrat intermédiaire | Aucun | Assertions, type, conditions, importance, références | Même extraction, puis unités avec ID, tâche autorisée, unités retenues/omises |
| Traçabilité | Sources + traces d'appel | Ajoute l'extraction sauvegardée | Ajoute IR, rejets, sélection et groupes ; lien unité → résultat incomplet |
| Validation locale spécifique | Schéma de sortie ; références signalées après réception | Schéma d'extraction, mais aucune compilation avant conception | Rejet d'assertions vides ou sans provenance valide ; déduplication exacte locale |
| Couverture | Aucune garantie automatique | Plafonds de sortie, aucune allocation explicite | Sélection observable, mais priorité sans équilibre de pages/thèmes |
| Déduplication | Aucune dans ce laboratoire | Aucune dans ce laboratoire | Assertions seulement, dans un lot ; aucune déduplication des résultats finaux |
| Complexité / maintenance estimée | Faible ; peu de points de diagnostic | Moyenne ; extraction inspectable | Plus élevée ; contrats, sélection, spécialisation à maintenir |
| Avantage principal | Référence minimale de coût et de nombre d'appels | Compromis simple entre observabilité et nombre d'étapes | Contrôle explicite des omissions et de la préparation des tâches |
| Limite principale | Impossible d'inspecter séparément les connaissances retenues | L'extraction peut propager une erreur non contrôlée | IR encore peu expressive ; pertes à la déduplication ; appels spécialisés séquentiels |
| Risque probable, non mesuré | Omission ou interprétation erronée peu explicable | Ancrage sur une mauvaise extraction | Sélection erronée devenue systématique ; répétitions/coût supplémentaires |
| Usage recommandé | Baseline indispensable | Baseline structurée pragmatique | Direction la plus prometteuse pour le contrôle, après corrections ciblées |

Sources : `methods.mjs:8–46`, `core.mjs:33–71`, `provider.mjs:20–58`, `runner.mjs:28–57`. Les catégories de complexité sont une appréciation du nombre de responsabilités, pas une mesure de qualité ou un profil de performance.

Configuration commune par défaut, observée dans le code, sans requête : modèle demandé `gpt-4o-2024-11-20`, température 0, seed 17, sortie maximale 4 096 tokens, délai 60 s, zéro reprise SDK ; deux pages et huit résultats maximum par lot. Ce snapshot est la configuration du laboratoire, distincte de l'alias historique de production. Aucun modèle effectivement servi ne peut être attesté sans réponse fournisseur. Température et seed ne garantissent pas un déterminisme absolu.

Toutes les étapes distantes recevraient les PNG **et** le texte original du lot. B/C ne remplacent donc pas complètement les sources par l'extraction. En revanche, le layout présent dans le manifeste n'est pas transmis sous forme structurée : `generateBatch` réduit chaque page à `{page,text}` et le fournisseur ajoute les images. Le modèle doit retrouver visuellement les relations de lignes, colonnes et figures.

## Fidélité PDF : résultats observés

Les fixtures ont une vérité de référence limitée à leur contenu connu. Le nombre d'éléments textuels retrouvés mesure cette extraction locale, pas l'exactitude pédagogique.

| Document contrôlé | Observation | Limite démontrée |
|---|---|---|
| Paragraphe, unités et condition | 3/3 fragments attendus présents | Pas de perte sur ce cas simple |
| Formule et symboles | 4/4 : `x²`, `x2`, `%`, soustraction présents et distincts | La perte d'exposant vient ensuite du validateur NFKC, pas de ce PDF |
| Deux colonnes | 4/4 fragments présents, mais colonne droite extraite avant gauche | Ordre des objets PDF conservé ; ordre de lecture visuel non reconstruit |
| Tableau numérique | 6/6 cellules retrouvées ; deux lignes détectées comme candidates | Détection de disposition, sans contrat sémantique en-tête/cellule |
| Tableau purement textuel | 6/6 cellules retrouvées ; zéro tableau détecté | Heuristique exigeant des chiffres ; coordonnées conservées, type de tableau absent |
| Diagramme vectoriel sans texte | Texte vide ; formes présentes dans le PNG | Absence de texte ne signifie pas absence d'information visuelle |

Document réel retrouvé : PDF local de 38 pages, empreinte `438f0286f8310855dd51bcb0db76aafbea5c5551b8dcf160cbc0a5feeb4160af`. Les 38 pages ont été extraites ; les pages 1, 24 et 29 ont été rendues. Les images des pages 29 et du cas à deux colonnes ont été inspectées visuellement.

**Page 29 : le texte extrait vaut seulement `29`, alors que le rendu contient un graphique de parts de marché et ses valeurs, dont Swiss Life 41,8 % et Helvetia 11,8 %.** Il s'agit d'une perte massive dans la représentation textuelle, démontrée sur cette page, sans perte correspondante du rendu utilisé par A/B/C. Pages 24 et 30 : seulement leur numéro aussi ; leur fidélité visuelle complète n'a pas été annotée. Le document n'a pas été comparé intégralement à une transcription humaine : aucun taux global de fidélité n'est revendiqué.

Le chemin commun évite de supprimer ces images, mais les assertions tirées des figures ne peuvent pas être vérifiées par recherche textuelle. Une boîte visuelle valide suffit actuellement à passer le contrôle de provenance. La lecture correcte du graphique par un modèle reste une hypothèse à tester.

`lib/pdf.ts:39` conserve l'ordre PDF.js ; `pdfLayout.ts:14` utilise les chiffres pour repérer les tableaux ; `pdf.ts:45` ne déclenche l'OCR que si le texte est inférieur à 80 caractères et qu'un binaire est configuré. Une page riche en texte mais contenant une figure raster peut ainsi ne pas déclencher l'OCR. Dans le présent benchmark, l'OCR a été volontairement désactivé : sa précision n'a pas été évaluée. Les rotations sont signalées dans le code mais n'ont pas été testées ici.

## Problèmes prioritaires : cause, impact et correction

Les corrections ci-dessous sont des recommandations. Elles n'ont pas été appliquées au laboratoire générateur ou au moteur de production pendant cet audit.

| Priorité / statut | Fichier et cause technique | Impact probable | Correction ciblée recommandée |
|---|---|---|---|
| P0 — code + simulation | `core.mjs:64–71` : vérifie présence de citation ou géométrie de région ; pas l'implication assertion → preuve | Une assertion fausse peut passer la compilation de C avec une citation vraie mais sans rapport | Nommer ce contrôle « provenance » ; distinguer assertion, preuve et vérification de contenu. Prévoir un contrôle d'implication et des règles déterministes pour chiffres/conditions, avec revue humaine de référence. Ne pas assimiler davantage d'appels critiques à une preuve de vérité. |
| P0 — simulation | `core.mjs:68` : NFKC transforme `x²` en `x2` | Référence mathématique inexacte acceptée | Préserver exposants, signes et unités avec NFC ; autoriser uniquement une normalisation d'espaces explicitement définie. |
| P0 — PDF + code | `pdf.ts:39`, `pdfLayout.ts:14`, `methods.mjs:31` : ordre texte brut, tableaux heuristiques, layout non transmis | Relations entre cellules/colonnes ou définitions mal interprétées | Transmettre des blocs et identifiants de cellules/figures conservant leurs coordonnées ; tester les associations, conserver les images originales. Aucun remplacement global de l'extracteur n'est justifié par ces seuls cas. |
| P1 — simulation | `methods.mjs:14–18` : le premier doublon gagne ; sources, importance et type ultérieurs ignorés | C perd une page de preuve et peut classer une règle comme simple rappel | Fusionner les références vérifiées ; définir une politique explicite pour les conflits de type/importance ; journaliser chaque fusion. |
| P1 — simulation | `methods.mjs:24` : tri par importance puis préfixe de hash, sélection des huit premières unités | Une page/thématique entière peut être exclue malgré des connaissances acceptées | Sélection par objectifs et diversité des sources ; raisons d'omission ; importance humaine indépendante pour l'évaluation. Ne pas remplir artificiellement une quantité de cartes. |
| P1 — code | `methods.mjs:9–10` : strings sans longueur minimale, références et listes sans minimum ; extraction plafonnée à 32 | B peut transmettre des assertions vides ou sans preuve ; plafond non lié au volume de connaissances | Rejeter les assertions vides, valider leurs preuves avant B/C, rendre les omissions/plafonds explicites. Un résultat vide doit rester permis si la source ne permet rien d'utile. |
| P1 — code | `methods.mjs:9`, `runner.mjs:36` : sortie question/réponse/sources sans ID de connaissance ; UUID seulement après réception | Même C ne garantit pas la traçabilité unité → résultat ni le respect de la sélection | Exiger les IDs d'unités utilisées, contrôler leur appartenance et les preuves correspondantes ; signaler tout contenu extérieur aux unités retenues. |
| P1 — code | `core.mjs:60`, `methods.mjs:31` : lots fixes, aucun contexte documentaire entre lots | Définition/prérequis sur une autre page indisponible ; hors sujet possible | Conserver les frontières de sections et une petite liste explicite de prérequis sourcés. Mesurer avant d'introduire un système de recherche plus complexe. |
| P1 — code | `methods.mjs:13–20` : déduplication exacte, conditions sensibles à l'ordre ; aucune déduplication inter-lots ou des résultats | Paraphrases ou permutations conservées, répétitions dans le document | Canonicaliser les ensembles de conditions quand leur ordre n'a pas de sens, conserver les distinctions mathématiques, indexer les IDs au niveau documentaire ; tester les fusions. |
| P1 — code | `methods.mjs:43–45`, `runner.mjs:28–33` : groupes C, lots et méthodes séquentiels | Plus de dépendances d'attente que nécessaire | Paralléliser les groupes après extraction, avec concurrence et budget bornés ; conserver l'identité de chaque groupe. Les lots indépendants peuvent ensuite partager une limite commune à toutes les méthodes. |
| P2 — code | `provider.mjs:27–29` : images et texte retransmis à toutes les étapes ; B/C refont séparément la même extraction | Entrées répétées et coûts potentiellement supérieurs, surtout C | Pour les futures comparaisons, garder l'extraction indépendante si l'on mesure le coût autonome ; prévoir aussi un ablation-test à extraction commune pour isoler uniquement compilation/sélection. Ne pas supprimer les preuves originales pour gagner des tokens. |
| P2 — code | `methods.mjs:18` : IR limitée à claim/conditions/type/importance ; pas de dépendances ou de contradictions | « Compiler » ne contrôle pas réellement les prérequis et conflits | Ajouter seulement les champs démontrés utiles : unités/portée, dépendances sourcées, contradictions et décisions. Éviter une ontologie complète avant expériences. |
| P2 — code | `runner.mjs:36–46` : références invalides enregistrées et signalées, pas bloquées ; première sortie référencée ≠ valide scientifiquement | Métriques techniques facilement confondues avec qualité | Conserver les sorties brutes pour l'audit, distinguer premier résultat / première provenance valide / premier résultat accepté par humain. |
| P2 — code | `provider.mjs:7–17,29` : prévision par octets et tokens d'image estimés, sorties hypothétiques | Budget et coût prévu non calibrés ; limites peuvent interrompre des lots | Utiliser un tokenizer adapté et calibrer après autorisation ; conserver les inconnues et l'absence de reprise payante automatique. Aucun coût réel n'est mesuré ici. |
| P2 — code | `provider.mjs:46–56`, `runner.mjs:33–42` : erreur ou troncature arrête la méthode ; pas de reprise d'étape sauvegardée | Travail partiellement perdu et répétition potentielle lors d'une nouvelle expérience | Reprise explicite par étape, liée aux empreintes de configuration/source, en séparant nouveau coût et résultat réutilisé. |

### Simulations reproductibles

Le JSON contient les valeurs attendues et observées. Les principaux cas :

1. L'affirmation prédéfinie `Pressure = 900 kPa.` est acceptée dans l'IR avec la citation réellement présente `Pressure = 12 kPa.`. Cela prouve que la compilation ne vérifie pas l'implication ; cela ne démontre aucune fréquence d'hallucination du modèle.
2. La référence `x2 = 4` passe sur le texte `x² = 4` ; une référence d'un caractère passe aussi. Une citation présente neutralise le contrôle d'une région pourtant invalide. Une région dans les bornes passe même sur une page sans texte.
3. Deux assertions identiques sur deux pages sont fusionnées en conservant seulement la première référence, la première importance et le premier type. Deux listes de conditions identiques dans un ordre différent créent deux unités.
4. Dix-huit connaissances prédéfinies, toutes acceptées, donnent huit unités sélectionnées et dix omises. Les huit appartiennent à la première page ; trois groupes sont planifiés. Aucun résultat final n'est produit.
5. Le schéma accepte une assertion vide sans référence ; la compilation C la rejette. B ne passe pas par cette compilation. C améliore donc ce contrôle spécifique, sans apporter une preuve de vérité factuelle.

## Appels, dépendances et possibilités de parallélisation

Soit `N = ceil(pages sélectionnées / pagesPerBatch)` et `gᵢ` le nombre de groupes non vides de C dans le lot i, de 0 à 3.

| Méthode | Nombre prévu d'appels réussis | Dépendance actuelle | Dépendance incompressible |
|---|---|---|---|
| A | N | Un appel par lot, lots séquentiels | Source préparée avant conception |
| B | 2N | Extraction → conception, lots séquentiels | Conception dépend de son extraction |
| C | Σ(1 + gᵢ), entre N et 4N | Extraction → compilation locale → sélection locale → groupes séquentiels | Groupes dépendants de l'extraction, indépendants entre eux après sélection |

Pour 38 pages et deux pages par lot : **A 19 appels, B 38, C 19 à 76**, soit 76 à 133 pour les trois expériences complètes, selon les groupes de C. La borne basse de C peut correspondre à aucune connaissance admissible et donc aucune sortie : ce n'est pas un gain de qualité ou un scénario comparable en volume. Ces comptes n'incluent aucune validation LLM supplémentaire ; le code du laboratoire n'en possède pas. Une erreur peut arrêter plus tôt une méthode.

Simulation pure de calendrier : si chaque appel prenait arbitrairement 10 s, sans coût local, A prendrait 190 s, B 380 s et C avec trois groupes par lot 760 s dans le code actuel. Exécuter seulement ces trois groupes en parallèle ramènerait ce C à 380 s. L'étape pouvant fournir les premiers résultats serait atteinte à 10 s pour A et 20 s pour B/C. **Ce sont des hypothèses de durée identiques, pas des mesures de vitesse ni de temps jusqu'à des cartes utilisables.** Les tokens de sortie, la latence fournisseur, le cache et les différences de charge peuvent modifier ce classement.

Le rendu PDF est aussi séquentiel dans `prepareDocument` ; l'extraction texte possède déjà une concurrence bornée à quatre pages dans `lib/pdf.ts`. Un rendu borné parallèle est possible mais doit tenir compte de la mémoire des canvas. Les PNG sont partagés par toutes les méthodes : ne pas rendre à chaque appel est déjà un bon choix.

La comparaison actuelle utilise une concurrence de un pour toutes les méthodes et un ordre aléatoire, ce qui simplifie l'attribution. Un seul ordre aléatoire ne neutralise pas la charge fournisseur ou les avantages du cache. Les groupes C pourraient être parallélisés sans changer leurs contrats ; le budget réservé et la persistance des résultats devraient rester cohérents. Les lots sont actuellement indépendants, donc parallélisables, mais une future déduplication globale impose une fusion finale déterministe.

## Maintenabilité et recommandation

### Complément : intégrité des sources dans les composants de production

Une seconde vérification hors ligne a exécuté **uniquement trois fonctions pures isolées depuis leur AST TypeScript**, sans importer les modules de production : `verifiesQuote`, `sourceCatalog` et `resolveSourceIds`. Aucun générateur ou client API n'est chargé. Reproduction : `node scripts/benchmark-lab/offline-source-integrity.mjs`. Huit assertions passent ; valeurs observées, empreintes et historique dans `data/benchmark-lab/offline-audit/source-integrity.json`. Ce sont des constats sur les helpers existants, pas des corrections appliquées.

| Statut / priorité | Constat supplémentaire | Fichier, effet et recommandation |
|---|---|---|
| Démontré par simulation — P0 | Le validateur de production accepte `The formula is x2 = 4.` sur `The formula is x² = 4.` | `lib/contentQuality.ts:63–65` utilise également NFKC. Conserver NFC et les signes mathématiques dans la vérification des preuves, indépendamment des contrôles de calcul. |
| Démontré par simulation — P0 | Le même validateur accepte `The current is 12 pa.` sur `The current is 12 pA.` | `toLowerCase()` supprime une distinction de symboles/unités. Comparer la citation sans effacer la casse scientifique ; ne pas transposer les normalisations de recherche lexicale aux preuves. |
| Démontré par simulation — P1 | Un fragment source de moins de 12 caractères est refusé même quand il est présent (`41.8%`) | Le seuil empêche des citations trop vagues, mais ne convient pas seul aux valeurs de graphique. Utiliser la valeur avec son libellé, son contexte et une preuve visuelle liée au document ; ne pas supprimer simplement le seuil. |
| Démontré par simulation — P2 | Le catalogue restitue exactement tous les caractères ; une phrase longue peut néanmoins être coupée entre règle et condition | `lib/sourceCatalog.ts:5–14` découpe à 1 000 caractères, avec recherche limitée d'un espace. Conserver des limites de phrase/bloc lorsque possibles, ou fournir un voisinage explicite des extraits aux vérifications. Une phrase coupée n'est pas une perte documentaire, mais le fragment isolé peut être insuffisant. |
| Garantie technique vérifiée | Un ID source inconnu est rejeté ; une référence connue reçoit le texte original côté serveur | `lib/sourceCatalog.ts:20–27` empêche la fabrication de citation par substitution d'ID. Cela mérite d'être conservé dans toute évolution B/C ; cela ne vérifie toujours pas l'implication de l'affirmation. |

Les appels à `verifiesQuote` sont partagés entre génération textuelle/visuelle, exactitude, Q&A, leçons et lecture de cartes (`sectionGeneration.ts`, `generateSlides.ts`, `contentAccuracy.ts`, `qaGeneration.ts`, `qualityDb.ts`). L'étendue des utilisations est démontrée par recherche de code ; la fréquence des citations altérées en pratique n'a pas été mesurée. La réparation de ce helper est donc une correction transversale ciblée à envisager avant une refonte, avec vérification des cas légitimes de citation.

Le laboratoire sépare utilement préparation (`core`), orchestration des méthodes (`methods`), fournisseur (`provider`), persistance (`runner`) et évaluation humaine (`server`/`ui`). Les artefacts et empreintes facilitent le diagnostic sans réutiliser le moteur de production. Les gardes d'approbation, le plafond conservateur et l'absence de retries payants évitent les lancements implicites. L'interface en aveugle conserve les scores humains et une couverture annotée ; elle ne fournit aucune validation scientifique automatique. Son serveur ne possède pas d'endpoint de lancement payant. Le partage d'imports serveur → runner → provider est néanmoins un couplage à éviter pour un futur outil strictement d'évaluation ; notre script hors ligne l'évite déjà.

**C est la direction architecturale la plus prometteuse pour MORROW**, parce qu'elle permet de rendre inspectables les connaissances retenues, leurs sources, les rejets et les omissions avant la conception. Ce choix repose sur les possibilités de contrôle, pas sur une meilleure pédagogie démontrée. Le C actuel est un registre typé avec sélection par priorité, pas encore un compilateur complet de connaissances. Ses défauts de fusion, de sélection et de traçabilité doivent être corrigés avant une adoption. Sa spécialisation en trois appels doit rester optionnelle tant que son intérêt n'est pas mesuré.

**B reste le meilleur témoin structuré simple** pour vérifier si extraction puis conception suffisent. A reste indispensable pour savoir si les étapes ajoutées valent réellement leur coût. Il n'y a pas de justification actuelle pour une refonte globale, un framework multi-agent ou un changement aveugle de modèle. Les corrections ciblées des contrats et de la provenance peuvent être testées localement avant tout lancement autorisé.

Sans génération réelle, restent impossibles à départager : exactitude et utilité des sorties, omissions réelles, bénéfice de la spécialisation, lecture des graphiques, correction des extractions erronées par B/C, nombre de résultats exploitables, temps jusqu'au premier résultat humainement acceptable, coûts/tokens effectifs et comparaison pédagogique avec RemNote. Il faudra ultérieurement un document commun, une référence humaine validée, des répétitions et une notation en aveugle. **Aucune architecture ne peut ici recevoir une note d'exactitude de 10/10.**
