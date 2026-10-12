# Morrow

Importer des slides incomplets, reconstruire le cours expliqu?, g?n?rer des cartes Anki sur plusieurs dimensions et suivre les r?visions.

**Slides ? cours expliqu? ? cartes ? r?visions.**

Le contrat produit est dans [PRODUCT.md](PRODUCT.md). L'architecture actuelle est d?crite dans [teacher-course-architecture.md](references/teacher-course-architecture.md).

## D?marrer

Node.js 24, puis :

```powershell
npm.cmd install
npm.cmd run dev
```

Ouvrir http://localhost:3000. Copier .env.local.example vers .env.local et configurer un fournisseur. Red?marrer apr?s toute modification de configuration.

- API cloud : OPENAI_API_KEY ou ANTHROPIC_API_KEY, avec cr?dits disponibles.
- Mod?le local : LLM_PROVIDER=ollama, OLLAMA_MODEL et OLLAMA_BASE_URL. Le connecteur est d?j? int?gr?. Un mod?le capable de lire les images est n?cessaire pour les figures et slides scann?s.
- Windows : npm.cmd run ollama:setup pr?pare Ollama et t?l?charge le mod?le configur?. Consulter scripts/setup-ollama.ps1 avant installation ; le t?l?chargement initial peut occuper plusieurs Go.

Un mod?le local ?vite les cr?dits API, mais sa qualit? et sa vitesse doivent ?tre ?valu?es sur le mat?riel disponible. La plateforme ne choisit pas silencieusement un autre fournisseur en cas de panne.

## Utilisation

1. **Import slides** : importer le PDF, puis lancer Explain & create cards. Commencer par quelques slides permet de v?rifier le r?sultat.
2. **Course** : lire le cours reconstruit, avec d?finitions, pr?requis, m?canismes et exemples. Le contexte ajout? est identifiable ; les points incertains restent visibles.
3. **Cards** : v?rifier, corriger, approuver ou suspendre les cartes avec la slide originale et leur fondation p?dagogique.
4. **Review** : r?viser les cartes de d?finition, m?canisme, comparaison et application dans une m?me file. Le suivi FSRS et les ?ch?ances ne n?cessitent pas de LLM.

Les quatre dimensions ne sont pas impos?es ? chaque notion. Une page administrative peut produire z?ro carte. Le graphe et les exercices sp?cialis?s restent accessibles comme outils secondaires ; Strict/Open est un r?glage du chat.

## Ce que fait le LLM

Il apporte les connaissances disciplinaires n?cessaires pour expliquer des slides incomplets. Il distingue les affirmations du document, le contexte ajout? et les illustrations hypoth?tiques. Il ne pr?tend pas retrouver le discours exact du professeur.

Quatre ?tapes born?es : reconstruction du cours, relecture du cours, r?daction des cartes depuis les affirmations accept?es, contr?le des cartes. Les sorties sont mises en cache. Les erreurs de quota arr?tent le travail ; les contenus d?j? enregistr?s restent disponibles.

Une citation prouve la provenance d'un passage, pas la v?rit? d'un ajout. Une relecture IA ne certifie pas l'exactitude scientifique. Les cartes fond?es uniquement sur des images restent ? v?rifier humainement contre le PDF. Aucune r?f?rence externe n'est pr?sent?e comme consult?e si elle ne l'a pas ?t?.

## Donn?es et compatibilit?

Les cours utilisent SQLite et conservent les PDF originaux. La r?forme ne r?initialise ni les cartes, ni les historiques existants. Les cartes corrig?es ou ?tudi?es restent prot?g?es lors d'une r?g?n?ration. Les le?ons et leur provenance sont incluses dans les sauvegardes JSON et les transferts.

Les exports Anki TSV et APKG sont conserv?s, avec indication du contexte p?dagogique ajout?. L'APKG peut transporter l'historique disponible ; le TSV ne transporte pas les ?ch?ances. Les imports Anki conservent m?dias et pr?sentation avec les restrictions de s?curit? existantes.

MORROW_DATA_DIR et MORROW_BUILD_DIR isolent donn?es et compilation pour les tests. Ne pas lancer les scripts de seed ou de r?paration sur les donn?es personnelles pour tester une modification.

## Fournisseur indisponible

Sans mod?le, il est possible de consulter le cours enregistr?, modifier et r?viser les cartes, sauvegarder et exporter. La cr?ation d'un nouveau cours enrichi n?cessite un fournisseur utilisable. Une cl? configur?e n'implique pas des cr?dits disponibles ; les erreurs de quota sont affich?es avec les possibilit?s de reprise.

## Validation

Avant de remettre des crédits, utiliser le [pilote de comparaison Sol/Sonnet](references/model-evaluation.md). Cinq slides du cours existant sont préparées dans un espace séparé, avec attentes de relecture, cache et budget cumulé réservé de 2 $. `npm.cmd run evaluation:check` vérifie la préparation sans appel API. Les essais payants demandent explicitement `--live`; ils produisent un rapport de cours et de cartes à évaluer humainement.

```powershell
npm.cmd test
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
```

Les tests utilisent des donn?es jetables et des r?ponses simul?es. Le sc?nario central est scripts/test-professor-generation.mjs. Les rapports historiques ne prouvent pas la qualit? actuelle : les sorties r?elles doivent ?tre ?valu?es humainement sur plusieurs cours.

Mesures utiles : exactitude du cours enrichi, couverture des objectifs importants, cartes accept?es sans modification, temps de correction et co?t par carte accept?e. Aucun score de v?rit?, gain de r?tention ou avantage concurrentiel n'est d?duit d'un test simul?.

## H?bergement et outils avanc?s

Le mode local reste le d?faut. Pour un h?bergement prot?g?, provisionner un compte avec node scripts/users.mjs your-name --owner, puis MORROW_AUTH=required. Utiliser HTTPS pour un acc?s distant. Les comptes poss?dent des cours et fichiers isol?s. Cette architecture reste un h?bergement sur un seul serveur.

Les workers, sauvegardes de r?cup?ration, synchronisation hors ligne, transferts et outils de personnalisation FSRS restent disponibles. Voir [reliability-and-scheduling.md](references/reliability-and-scheduling.md) et [interoperability-and-validation.md](references/interoperability-and-validation.md).

## Documentation historique

[platform-before-teacher-reform.md](references/platform-before-teacher-reform.md) conserve le pr?c?dent README. Les documents de g?n?rations v8?v18 et de l'ancien moteur direct d?crivent des ?tapes ant?rieures, parfois contradictoires avec la direction actuelle. PRODUCT.md et teacher-course-architecture.md sont les r?f?rences pour les nouvelles modifications.
