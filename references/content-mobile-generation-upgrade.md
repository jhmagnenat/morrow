# Contrôles de contenu, mobilité et génération — 9 octobre 2026

Les changements renforcent des comportements vérifiables. Ils ne certifient
pas une exactitude scientifique de 90 %, une note globale de 9/10 ni une
supériorité sur les concurrents. Les cours existants ne sont pas déclarés
réaudités par le changement de version.

## Contenu

Le pipeline progressif utilise un catalogue de segments sources sans perte
de caractères. Le modèle choisit des identifiants ; le serveur fournit les
citations originales et refuse les identifiants inventés. Les sources
primaires ne sont pas tronquées pour accélérer la génération.

L'audit indépendant contrôle chaque définition, intuition, réponse, étape de
mécanisme, formulation technique, condition, limite et exercice. Il doit
fournir une décision unique et ses pages d'appui pour chaque champ. Une
approbation générale ne compense plus un champ absent, rejeté ou lié à une
page étrangère. Les champs rejetés empêchent la publication de la notion et
la page reste à reprendre. Le modèle d'audit peut être différent, mais reste
celui de génération tant qu'aucune configuration distincte n'est fournie.

Au moment de la transaction, les notes comparées sont revérifiées. Une
modification concurrente, ou une définition différente créée entre-temps,
impose une nouvelle vérification de cohérence ; le brouillon de génération
reste disponible pour éviter de le produire à nouveau.

Ces contrôles exigent des décisions plus précises ; ils n'établissent pas
eux-mêmes l'entaillement scientifique. La relecture indépendante et les
évaluations J0/J7 restent nécessaires, particulièrement pour les graphiques.
Le parcours détaillé/visuel conserve ses contrôles existants ; l'audit par
champ décrit ici concerne le pipeline textuel progressif.

## Mobile et synchronisation

Un manifeste PWA, des icônes PNG et la prise en compte des zones sûres
permettent l'installation depuis un navigateur compatible. Les champs
mobiles évitent le zoom involontaire à la saisie. L'interface conserve ses
modes ; Tools ajoute seulement « Prepare course offline ».

Ce bouton prépare les pages de cours, leurs ressources et les files de
révision ; il vérifie leur présence en cache. Les PDF ouverts, jusqu'à
32 MiB par fichier, sont conservés avec leurs accès par plages d'octets.
Les médias importés ouverts conservent leur cache existant. Préparer le
cours ne télécharge pas tous ses PDF ou tous ses médias.

Le service worker rejoue le même journal IndexedDB, avec les mêmes reçus
idempotents et l'ordre des réponses d'une carte. Background Sync peut
fonctionner lorsque la page est fermée dans les navigateurs compatibles ;
le navigateur décide du moment et du nombre de tentatives. Les autres
navigateurs reprennent à l'ouverture, au retour au premier plan et au retour
du réseau. Les sessions expirées conservent les réponses sans les marquer
comme conflits définitifs. Les conflits de contenu/progression restent
conservés pour résolution explicite.

L'inventaire distant est actualisé au premier plan et toutes les trente
secondes lorsque la page est visible. Les réponses conditionnelles ETag
évitent de retransmettre et recalculer les inventaires inchangés. Un appareil
retire les cartes révisées/suspendues/supprimées ailleurs de ses files à venir,
sans retirer les réponses locales en attente. Un changement de contenu
actualise également les données du parcours Study.

Les appareils doivent atteindre le même serveur, via HTTPS pour un téléphone
ordinaire. Il n'existe pas de nouveau service cloud hébergé ni de fusion
automatique entre installations SQLite indépendantes.

## Délai et coûts

Les citations ne sont plus recopiées dans les réponses générées. L'audit
reçoit le texte original une fois, des références de champs et des références
de citations, au lieu de répétitions intégrales. Les décisions complètes de
rejet sont également mises en cache : une reprise strictement identique ne
paie pas une nouvelle chance d'obtenir une approbation aléatoire. Les sources,
contenus, notes comparées, versions et modèle d'audit font partie de la clé.

Les sections partagent un budget par document : par défaut 120 appels et
500 000 tokens cumulés. Le budget bloque les appels suivants et conserve le
contenu déjà vérifié ; les réponses des appels en vol peuvent dépasser le
seuil de tokens. Les valeurs sont configurables dans `.env.local.example`.
Les plafonds de sortie sont adaptés à la taille des décisions d'audit et
peuvent être explicitement configurés entre 2 048 et 16 384 tokens.

Des estimations USD sont enregistrées seulement si les tarifs par million
de tokens sont configurés. Elles utilisent les tarifs fournis, sans déduire
les remises de cache ; elles ne remplacent pas la facture du fournisseur.

Sur la fixture des tests, les références de citations représentent moins
de 5 % du JSON de longues citations répétées. Cela porte uniquement sur ce
champ de la réponse, pas sur le coût total ou la latence réelle. Le scénario
de 38 pages textuelles conserve sept sections et quatorze appels initiaux.

## Vérifications

- Suite isolée complète, TypeScript, ESLint et compilation de production.
- Cas adverses : identifiant inventé, affirmation rejetée, audit de champ
  manquant, page d'appui étrangère et notes modifiées pendant l'audit.
- Budgets partagés entre appels concurrents et reprise d'un budget consommé.
- Cache PDF, plages normales/suffixes, plage invalide et séparation des cours.
- Navigateur Chrome à 390 × 844 sur un serveur de production jetable :
  préparation hors ligne, coupure réelle du transport y compris pour le
  worker, rechargement complet, reprise idempotente, mise à jour après
  révision distante, replay depuis le worker et perte d'accusé de réception.

Le script `scripts/check-mobile-sync.mjs` attend le serveur jetable sur 3006
et un Chrome de test sur 9222 ; il crée un proxy local sur 3005. Il vérifie
l'identité de la fixture avant toute écriture et utilise des données de test.
Ne pas utiliser un profil Chrome personnel pour ces vérifications.

L'essai réel du nouveau pipeline sur la page 25 du PDF présent a échoué sur
une erreur de connexion OpenAI : zéro token enregistré et zéro carte produite.
Le rapport est `.next/generation-benchmark-1791572742921.json`. Cet échec ne
valide aucun délai, coût total ou taux d'exactitude. Les benchmarks réels et
une relecture compétente restent les prochaines preuves à obtenir.
