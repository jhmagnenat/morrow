import dagre from "dagre";
import { Position, type Edge, type Node } from "@xyflow/react";

const NODE_WIDTH = 210;
const NODE_HEIGHT = 46;

// How deep a notion sits in the prerequisite/sub-notion hierarchy — depth 0
// is a root (foundational) notion, each hop down a "prerequisite" or
// "sub-notion" edge adds 1. "related" edges are lateral and don't count.
// Used purely for visual weight (Graph.tsx/NotionNode.tsx scale size by
// this), so every notion stops looking equally important regardless of
// where it actually sits in the course's structure.
export function computeNotionDepths(
  notionIds: string[],
  links: { source: string; target: string; type: string }[]
): Map<string, number> {
  const hierarchyLinks = links.filter((l) => (l.type === "sub-notion" || l.type === "chapter"));
  const outgoing = new Map<string, string[]>();
  const hasIncoming = new Set<string>();

  for (const l of hierarchyLinks) {
    hasIncoming.add(l.target);
    if (!outgoing.has(l.source)) outgoing.set(l.source, []);
    outgoing.get(l.source)!.push(l.target);
  }

  const depths = new Map<string, number>();
  const queue: string[] = [];
  for (const id of notionIds) {
    if (!hasIncoming.has(id)) {
      depths.set(id, 0);
      queue.push(id);
    }
  }

  let qi = 0;
  while (qi < queue.length) {
    const current = queue[qi++];
    const d = depths.get(current)!;
    for (const next of outgoing.get(current) ?? []) {
      if (!depths.has(next) || depths.get(next)! > d + 1) {
        depths.set(next, d + 1);
        queue.push(next);
      }
    }
  }

  // Anything left unreached (only possible via a pure cycle with no root)
  // defaults to top-level rather than being left undefined.
  for (const id of notionIds) {
    if (!depths.has(id)) depths.set(id, 0);
  }

  return depths;
}

export function layoutTree(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "LR" = "TB"
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, nodesep: 56, ranksep: 110 });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((node) => {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  // Only hierarchy-defining edges (prerequisite / sub-notion) drive the tree
  // layout; "related" edges are drawn afterwards without affecting position.
  edges
    .filter((edge) => (edge.data?.type === "sub-notion" || edge.data?.type === "chapter"))
    .forEach((edge) => {
      g.setEdge(edge.source, edge.target);
    });

  dagre.layout(g);

  const isHorizontal = direction === "LR";

  const laidOutNodes = nodes.map((node) => {
    const position = g.node(node.id);
    return {
      ...node,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      position: {
        x: position.x - NODE_WIDTH / 2,
        y: position.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: laidOutNodes, edges };
}
