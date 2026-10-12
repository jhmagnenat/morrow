import { colorForDomain, type Domain, type NotionStatus } from "@/lib/types";
import type { MasteryLevel } from "@/lib/mastery";

export interface NotionLabelProps {
  label: string;
  domain: Domain;
  status: NotionStatus;
  dimmed: boolean;
  active: boolean;
  depth: number;
  masteryLevel: MasteryLevel;
}

// ⚪🔴🟠🟡🟢 — separate from the domain-color dot inside the node (which
// identifies the CATEGORY a notion belongs to); this one is mastery: how
// well it's actually known, derived from performance across Drill/Connect/
// Explain/Interview (lib/mastery.ts), nothing to do with SRS due dates.
export const MASTERY_COLORS: Record<MasteryLevel, string> = {
  unknown: "#696A61",
  weak: "#ef4444",
  learning: "#f97316",
  developing: "#eab308",
  mastered: "#22c55e",
};

// Visual weight by hierarchy depth — depth 0 (foundational/root notions)
// reads biggest and boldest, deeper sub-notions progressively shrink and
// lighten. Without this every notion looked equally important regardless of
// where it actually sits in the course's structure.
const DEPTH_TIERS = [
  { box: "min-w-[190px] max-w-[240px] px-5 py-3", text: "text-sm font-semibold text-[#D4C6A6]", dot: "h-2.5 w-2.5" },
  { box: "min-w-[170px] max-w-[220px] px-4 py-2.5", text: "text-[13px] font-medium text-[#D4C6A6]", dot: "h-2 w-2" },
  { box: "min-w-[150px] max-w-[200px] px-3 py-2", text: "text-xs font-normal text-[#8F8978]", dot: "h-1.5 w-1.5" },
  { box: "min-w-[130px] max-w-[180px] px-2.5 py-1.5", text: "text-[11px] font-normal text-[#8F8978]", dot: "h-1.5 w-1.5" },
];

// Rendered as a node's `data.label` (a plain React node), not as a React Flow
// custom node type — registering any `nodeTypes` map currently makes all
// edges disappear in @xyflow/react 12.x (xyflow/xyflow#6042).
export default function NotionLabel({ label, domain, status, dimmed, active, depth, masteryLevel }: NotionLabelProps) {
  const color = colorForDomain(domain);
  const tier = DEPTH_TIERS[Math.min(depth, DEPTH_TIERS.length - 1)];
  const masteryColor = MASTERY_COLORS[masteryLevel];

  return (
    <div
      style={{
        opacity: dimmed ? 0.2 : 1,
        borderColor: active ? color : "rgba(255,255,255,0.08)",
        boxShadow: active
          ? `0 0 0 1px ${color}, 0 0 18px -2px ${color}99`
          : `0 1px 2px rgba(0,0,0,0.4)`,
      }}
      className={`${tier.box} relative rounded-full border bg-[#28262a] transition-all duration-200 hover:border-[color:var(--dot)]`}
    >
      <span
        title={`Mastery: ${masteryLevel}`}
        className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[#1a1a1b]"
        style={{ backgroundColor: masteryColor, boxShadow: `0 0 6px 0 ${masteryColor}99` }}
      />
      <div className="flex items-center gap-2">
        <span
          className={`${tier.dot} shrink-0 rounded-full`}
          style={{ backgroundColor: color, boxShadow: `0 0 8px 1px ${color}aa` }}
        />
        <span className={`${tier.text} truncate leading-tight`}>{label}</span>
        {status === "draft" && (
          <span className="ml-auto shrink-0 rounded border border-dashed border-[#696A61] px-1 text-[9px] uppercase tracking-wide text-[#696A61]">
            draft
          </span>
        )}
      </div>
    </div>
  );
}
