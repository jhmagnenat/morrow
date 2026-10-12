import type { Link, Notion, Passage } from "@/lib/types";

// Deterministic, non-AI checks on the graph's structure — these catch the
// class of bug that slipped through during this session's manual audits
// (a hierarchy cycle, orphaned notions, near-duplicate labels) precisely
// because they're mechanical properties of the graph, not judgment calls.
// Run automatically after generation so they never reach the user
// unnoticed, instead of relying on a one-off manual check.

function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Detects cycles in the hierarchy (sub-notion/prerequisite edges only —
// "related" is lateral and never drives tree position, so it can't produce
// the "notion invisible in the graph" failure mode a hierarchy cycle does).
// Returns which links to remove to make the hierarchy a DAG again: a
// classic DFS cycle-break, removing the back-edge that closes each loop —
// same fix this session applied by hand to the Insurance Company
// Functions/Value Chain/Product Families cycle, just automatic now.
export function detectAndBreakCycles(links: Link[]): { keep: Link[]; removed: Link[] } {
  const hierarchy = links.filter((l) => (l.type === "sub-notion" || l.type === "chapter"));
  const outgoing = new Map<string, Link[]>();
  for (const l of hierarchy) {
    const list = outgoing.get(l.source) ?? [];
    list.push(l);
    outgoing.set(l.source, list);
  }

  const removedIds = new Set<string>();
  const removed: Link[] = [];
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();

  function visit(nodeId: string) {
    color.set(nodeId, GRAY);
    for (const link of outgoing.get(nodeId) ?? []) {
      if (removedIds.has(link.id)) continue;
      const childColor = color.get(link.target) ?? WHITE;
      if (childColor === GRAY) {
        removedIds.add(link.id);
        removed.push(link);
        continue;
      }
      if (childColor === WHITE) visit(link.target);
    }
    color.set(nodeId, BLACK);
  }

  const allNodeIds = new Set<string>();
  for (const l of hierarchy) {
    allNodeIds.add(l.source);
    allNodeIds.add(l.target);
  }
  for (const id of allNodeIds) {
    if ((color.get(id) ?? WHITE) === WHITE) visit(id);
  }

  return { keep: links.filter((l) => !removedIds.has(l.id)), removed };
}

// Top-level notions — no incoming sub-notion/prerequisite link, so they
// each anchor their own disconnected tree. The map's whole point is to be
// ONE genealogy (at most two, if the subject genuinely has a separate
// organizational dimension), so a growing root count over time is a sign
// generation is sprawling sideways instead of nesting into what's there.
export function findRootNotions(notions: Notion[], links: Link[]): Notion[] {
  const hasIncoming = new Set(links.filter((l) => (l.type === "sub-notion" || l.type === "chapter")).map((l) => l.target));
  return notions.filter((n) => !hasIncoming.has(n.id));
}

// A notion with zero links of any kind — genuinely invisible context in
// the map (not reachable by browsing from anything else).
export function findOrphans(notions: Notion[], links: Link[]): Notion[] {
  const linked = new Set<string>();
  for (const l of links) {
    linked.add(l.source);
    linked.add(l.target);
  }
  return notions.filter((n) => !linked.has(n.id));
}

// Every group of 2+ notions sharing an exact normalized label — same
// conservative rule used for the "Merge duplicates" button.
export function findDuplicateGroups(notions: Notion[]): Notion[][] {
  const byNorm = new Map<string, Notion[]>();
  for (const n of notions) {
    const norm = normalizeLabel(n.label);
    if (!norm) continue;
    const list = byNorm.get(norm) ?? [];
    list.push(n);
    byNorm.set(norm, list);
  }
  return [...byNorm.values()].filter((group) => group.length > 1);
}

export interface GraphHealthReport {
  cyclesBroken: number;
  orphanCount: number;
  duplicateGroupCount: number;
}

export interface UncoveredPage {
  documentId: string;
  page: number;
  preview: string;
}

export interface CoverageReport {
  totalPages: number;
  coveredPages: number;
  coveragePercent: number;
  uncoveredPages: UncoveredPage[];
}

// What fraction of the course's actual source pages produced at least one
// grounded notion — the generation route's own auto-retry already tries to
// push this up as content is generated, but this answers it as a plain
// fact, checkable anytime against the current state (after an import, a
// manual edit, or just to see where things stand), not just mid-generation.
export function computePageCoverage(passages: Passage[], notions: Notion[]): CoverageReport {
  const citedKeys = new Set(notions.flatMap((n) => n.sources.map((s) => `${s.documentId}:${s.page}`)));

  const byPage = new Map<string, { documentId: string; page: number; text: string }>();
  for (const p of passages) {
    const key = `${p.documentId}:${p.page}`;
    const existing = byPage.get(key);
    if (existing) existing.text += " " + p.text;
    else byPage.set(key, { documentId: p.documentId, page: p.page, text: p.text });
  }

  const uncoveredPages: UncoveredPage[] = [];
  let coveredPages = 0;
  for (const [key, entry] of byPage) {
    if (citedKeys.has(key)) {
      coveredPages++;
    } else {
      uncoveredPages.push({ documentId: entry.documentId, page: entry.page, preview: entry.text.slice(0, 100) });
    }
  }

  const totalPages = byPage.size;
  return {
    totalPages,
    coveredPages,
    coveragePercent: totalPages > 0 ? Math.round((coveredPages / totalPages) * 1000) / 10 : 100,
    uncoveredPages,
  };
}
