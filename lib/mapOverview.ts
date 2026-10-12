import type { Link, Notion } from "./types";

// Only chapter/sub-notion links define navigation; cycles never hide content.
export function mapOverview(notions: Notion[], links: Link[]) {
  const byId = new Map(notions.map(n => [n.id, n]));
  const children = new Map<string, string[]>();
  const incoming = new Set<string>();
  for (const link of links) {
    if (!["chapter", "sub-notion"].includes(link.type) || !byId.has(link.source) || !byId.has(link.target)) continue;
    if (link.source === link.target) continue;
    incoming.add(link.target);
    const targets = children.get(link.source) ?? [];
    if (!targets.includes(link.target)) targets.push(link.target);
    children.set(link.source, targets);
  }
  const roots = notions.filter(n => !incoming.has(n.id)).map(n => n.id);
  const reached = new Set<string>();
  const visit = (id: string) => {
    const queue = [id];
    while (queue.length) {
      const current = queue.pop()!;
      if (reached.has(current)) continue;
      reached.add(current);
      queue.push(...(children.get(current) ?? []));
    }
  };
  roots.forEach(visit);
  for (const notion of notions) if (!reached.has(notion.id)) { roots.push(notion.id); visit(notion.id); }
  return { byId, children, roots };
}
