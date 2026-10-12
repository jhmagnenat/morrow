# Retired generation engines

These source files are historical snapshots, not production modules. They are kept as `.ts.txt` so Next.js and TypeScript do not import or compile them. The isolated regression harness can replay them with synthetic providers to preserve historical safety and scheduling regressions.

Production document generation has one engine: `generationEngine`, source preparation in `sourceDocument`/`sourceSections`, and persistence in `generationRepository`. Neither environment variables nor visual pages can select these retired engines.
