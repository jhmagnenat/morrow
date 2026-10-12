> Historical implementation report, before the teacher-course reform. For the current product and generation contract, read [PRODUCT.md](../PRODUCT.md) and [teacher-course-architecture.md](teacher-course-architecture.md). Source-only restrictions in this report do not apply to the current production pipeline.

# Qualité du contenu et délai de génération

L'exploration reste libre : aucune progression obligatoire ni nouvelle condition
d'accès aux notions. Les changements concernent le contenu et sa production.

## Précision pédagogique

La génération compacte, les explications détaillées et leur approfondissement
distinguent faits du support, déductions conditionnelles et situations
hypothétiques. Les exercices doivent fournir une décision, une prédiction ou un
calcul avec son raisonnement, plutôt qu'un bénéfice générique. Les limites et
conditions figurent maintenant dans la formulation précise visible.

Des contrôles locaux rejettent certains corrigés vagues, réponses indéterminées
sans condition identifiée, calculs explicites incorrects et analogies confondant
provisions et trésorerie. Le contrôle couvre aussi les exercices complémentaires
des leçons C.L.A.I.R. existantes. Les audits des sections comparent un contexte
borné de notions liées, tout en gardant les sources originales comme autorité.
Ce contrôle ne détecte pas toutes les contradictions entre sections concurrentes
et ne constitue pas une certification scientifique.

## Coût et rapidité

- La petite section textuelle passe en premier dans la file ; les sections
  indépendantes démarrent en parallèle, selon la concurrence configurée.
- Une reconstruction entièrement rejetée par les contrôles locaux ne déclenche
  pas d'audit IA payant.
- Un audit indépendant intégralement accepté est mémorisé avec une empreinte
  de son prompt, des sources fournies, des cartes, des notions liées, de la
  version et du modèle d'audit. Une modification invalide sa réutilisation.
  Les rejets et audits incomplets ne sont pas réutilisés comme approbation.
- Les mêmes contrôles locaux et vérifications de sources restent exécutés
  lors de la réutilisation. Une reprise identique peut donc ne faire aucun
  nouvel appel IA ; une nouvelle section nécessite toujours sa génération
  et son audit.
- Les champs compacts évitent les répétitions ; les motifs détaillés de l'audit
  sont réservés aux rejets. Aucun plafond de délai ne publie du contenu non audité.

## Mesurer l'objectif de 30 secondes

```powershell
node scripts/benchmark-generation.mjs --pdf "chemin/cours.pdf" --pages 19,20 --live
node scripts/audit-learning-content.mjs
```

Le premier script consomme les crédits du fournisseur configuré, dans une base
jetable. Il distingue première carte utilisable et génération complète, indique
les tokens, appels, avertissements et dépassements du seuil de 30 secondes.
Un échec ne reçoit jamais un résultat positif sur ce seuil. Le temps total du
benchmark inclut sa préparation ; ce n'est pas une mesure du parcours navigateur.
Le second lit la base réelle sans migration ni écriture de contenu, sans appel
IA, et écrit un rapport des anomalies détectées.

Validation locale : le scénario simulé de 38 slides garde sept sections et
quatorze appels initiaux ; trois sections peuvent commencer avant le premier
audit terminé. La reprise strictement identique d'une section auditée ne fait
aucun appel. Ces tests démontrent concurrence et réutilisation, pas la vitesse
ou la justesse d'un fournisseur réel.

Essai réel sur deux pages du PDF de 38 pages : erreur de connexion OpenAI,
zéro token enregistré, zéro carte produite. Le plafond de 30 secondes reste
non validé. Il dépend de la taille du cours, des images, du modèle et du réseau.

Une correction ciblée de la leçon et d'une carte « Reserving » a été appliquée
avec sauvegarde SQLite préalable et conservation vérifiée des états de révision.
Le rapport est dans `data/reports/reserving-correction-v14.json`. Les autres
contenus ne sont pas déclarés réaudités par ce changement de version.

## Revue des sources visuelles et évaluation réelle

Les sept pages originales 19, 20, 24, 27, 29, 30 et 36 ont ensuite été inspectées.
Douze leçons et trois cartes ont été corrigées : séparation primes/sinistres,
fonctions et liquidité, fréquence/sévérité, dénominateurs et années des graphiques,
et distinction entre image publicitaire et intention ou effet supposés.
Le rapport `data/reports/source-image-review-v15.json` conserve le périmètre,
les transcriptions, la sauvegarde et l'empreinte du PDF. Cette relecture par
Codex n'est pas une validation indépendante par un enseignant.

Une référence visuelle inspectée reste liée à la description examinée et aux
octets du PDF. Changer la description, remplacer ou perdre le PDF invalide sa
vérification dans le rapport de fiabilité. Vérification visuelle et citation
textuelle sont comptées séparément ; aucune déclaration de vérité scientifique
n'est déduite de cette provenance.

`node scripts/prepare-local-learning-evaluation.mjs` prépare tous les concepts
de cours visibles, sans modifier le cours. Les cartes non prêtes restent
explicitement comptées à part. Le paquet actuel contient 50 cas, avec les
notes d'évaluation et erreurs critiques non renseignées. Les observations
réelles, les douze questions J0/J7 et leurs règles de jugement sont décrites dans
[le protocole](evaluation/protocole.md). La note reste absente tant que les
preuves nécessaires n'ont pas été observées.
