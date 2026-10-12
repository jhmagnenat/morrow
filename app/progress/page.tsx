import { getStudyCards } from "@/lib/qualityDb";
import {withRequestCourse} from '@/lib/requestCourse';
import Link from "next/link";
import {
  getDomainMastery,
  getExplainLevelCounts,
  getForecast,
  getGraph,
  getMaturityBuckets,
  getPronunciationCardCount,
  getReviewHeatmap,
  getRetentionRate,
  getVocabularyCardCount,
} from "@/lib/db";
import { colorForDomain } from "@/lib/types";

export const dynamic = "force-dynamic";

const MATURITY_COLORS = { new: "#475569", young: "#f59e0b", mature: "#10b981" } as const;
const MATURITY_ORDER: Array<keyof typeof MATURITY_COLORS> = ["new", "young", "mature"];
const MATURITY_LABELS = { new: "New", young: "Young", mature: "Mature" };

function StatTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-[#423e42] bg-[#201f21] p-4">
      <p className="text-xs uppercase tracking-wide text-[#696A61]">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold" style={{ color: accent ?? "#e5e7eb" }}>
        {value}
      </p>
    </div>
  );
}

function MaturityBar({
  title,
  buckets,
}: {
  title: string;
  buckets: { new: number; young: number; mature: number };
}) {
  const total = buckets.new + buckets.young + buckets.mature || 1;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-[#8F8978]">{title}</h3>
        <span className="text-xs text-[#696A61]">{total} cards</span>
      </div>
      <div className="flex h-5 w-full gap-0.5 overflow-hidden rounded-full bg-white/[0.03]">
        {MATURITY_ORDER.map((key) => {
          const count = buckets[key];
          if (count === 0) return null;
          const pct = (count / total) * 100;
          return (
            <div
              key={key}
              style={{ width: `${pct}%`, backgroundColor: MATURITY_COLORS[key] }}
              title={`${MATURITY_LABELS[key]}: ${count}`}
            />
          );
        })}
      </div>
    </div>
  );
}

function MaturityLegend() {
  return (
    <div className="flex items-center gap-4 text-xs text-[#696A61]">
      {MATURITY_ORDER.map((key) => (
        <span key={key} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: MATURITY_COLORS[key] }}
          />
          {MATURITY_LABELS[key]}
        </span>
      ))}
    </div>
  );
}

function Heatmap({ data }: { data: Array<{ date: string; count: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const weeks: Array<Array<{ date: string; count: number }>> = [];
  for (let i = 0; i < data.length; i += 7) weeks.push(data.slice(i, i + 7));

  const colorFor = (count: number) => {
    if (count === 0) return "#28262a";
    const t = Math.min(1, count / max);
    const lightness = 22 + t * 38;
    return `hsl(33, 45%, ${lightness}%)`;
  };

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-[3px]" style={{ minWidth: weeks.length * 14 }}>
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((day) => (
              <div
                key={day.date}
                title={`${day.date}: ${day.count} review${day.count === 1 ? "" : "s"}`}
                className="h-[11px] w-[11px] rounded-[2px]"
                style={{ backgroundColor: colorFor(day.count) }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ForecastChart({ data }: { data: Array<{ date: string; count: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const width = 560;
  const height = 110;
  const barGap = 4;
  const barWidth = (width - barGap * (data.length - 1)) / data.length;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxWidth: width }}>
      {data.map((d, i) => {
        const h = d.count === 0 ? 0 : Math.max(3, (d.count / max) * (height - 20));
        const x = i * (barWidth + barGap);
        const y = height - 16 - h;
        const dayLabel = new Date(d.date).toLocaleDateString(undefined, { weekday: "short" });
        return (
          <g key={d.date}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={h}
              rx={2}
              fill="#b8864b"
              opacity={0.85}
            >
              <title>{`${d.date}: ${d.count} due`}</title>
            </rect>
            {i % 2 === 0 && (
              <text
                x={x + barWidth / 2}
                y={height - 4}
                textAnchor="middle"
                fontSize="8"
                fill="#4b5563"
              >
                {dayLabel[0]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function DomainMasteryBars({ data }: { data: Array<{ domain: string; total: number; mature: number }> }) {
  const sorted = [...data].sort((a, b) => b.total - a.total);
  return (
    <div className="flex flex-col gap-2.5">
      {sorted.map((d) => {
        const color = colorForDomain(d.domain);
        const pct = d.total === 0 ? 0 : (d.mature / d.total) * 100;
        return (
          <div key={d.domain}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-[#8F8978]">{d.domain}</span>
              <span className="text-[#696A61]">
                {d.mature}/{d.total} mature
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#28262a]">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ExplainLevelBars({ counts }: { counts: Record<"child" | "nonexpert" | "expert", number> }) {
  const rows: Array<{ key: "child" | "nonexpert" | "expert"; label: string; color: string }> = [
    { key: "child", label: "Child level", color: "#d6a968" },
    { key: "nonexpert", label: "Non-expert level", color: "#b8864b" },
    { key: "expert", label: "Expert level", color: "#7d5830" },
  ];
  const max = Math.max(1, ...rows.map((r) => counts[r.key]));
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => {
        const count = counts[r.key];
        const pct = (count / max) * 100;
        return (
          <div key={r.key}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-[#8F8978]">{r.label}</span>
              <span className="text-[#696A61]">{count} passed</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[#28262a]">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: r.color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function retentionColor(rate: number | null) {
  if (rate === null) return "#6b7280";
  if (rate >= 0.8) return "#10b981";
  if (rate >= 0.6) return "#f59e0b";
  return "#ef4444";
}

function ProgressPage() {
  const { notions, links } = getGraph();
  const studyCards=getStudyCards().filter(c=>c.status==="ready");
  const notionMaturity = getMaturityBuckets("notion", studyCards.filter(c=>c.cardType==="notion").length);
  const linkMaturity = getMaturityBuckets("link", studyCards.filter(c=>c.cardType==="link").length);
  const pronunciationCount = getPronunciationCardCount();
  const pronunciationMaturity = getMaturityBuckets("pronunciation", pronunciationCount);
  const vocabularyCount = getVocabularyCardCount();
  const vocabularyMaturity = getMaturityBuckets("vocabulary", vocabularyCount);
  const forecast = getForecast(14);
  const heatmap = getReviewHeatmap(98);
  const retentionRate = getRetentionRate();
  const domainMastery = getDomainMastery();
  const explainCounts = getExplainLevelCounts();

  return (
    <div className="min-h-full bg-[#1a1a1b] pb-16">
      <header className="flex items-center gap-4 border-b border-[#423e42] bg-[#201f21] px-5 py-3">
        <Link href="/" className="text-xs text-[#696A61] hover:text-[#8F8978]">
          ← Back to graph
        </Link>
        <Link href="/study" className="text-xs text-[#696A61] hover:text-[#8F8978]">
          Study →
        </Link>
        <Link href="/browse" className="text-xs text-[#696A61] hover:text-[#8F8978]">
          Browse →
        </Link>
        <h1 className="ml-auto font-display text-lg font-medium tracking-wide text-accent-200">Progress</h1>
      </header>

      <div className="mx-auto flex max-w-3xl flex-col gap-10 px-6 py-8">
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Notions" value={String(notions.length)} />
          <StatTile label="Connections" value={String(links.length)} />
          <StatTile
            label="Retention"
            value={retentionRate === null ? "—" : `${Math.round(retentionRate * 100)}%`}
            accent={retentionColor(retentionRate)}
          />
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#D4C6A6]">Deck maturity</h2>
            <MaturityLegend />
          </div>
          <div className="flex flex-col gap-4 rounded-lg border border-[#423e42] bg-[#201f21] p-4">
            <MaturityBar title="Notions (Drill)" buckets={notionMaturity} />
            <MaturityBar title="Connections (Connect)" buckets={linkMaturity} />
            {pronunciationCount > 0 && (
              <MaturityBar title="Pronunciation (Pronounce)" buckets={pronunciationMaturity} />
            )}
            {vocabularyCount > 0 && <MaturityBar title="Vocabulary (Vocab)" buckets={vocabularyMaturity} />}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-[#D4C6A6]">Review activity (last 14 weeks)</h2>
          <div className="rounded-lg border border-[#423e42] bg-[#201f21] p-4">
            <Heatmap data={heatmap} />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-[#D4C6A6]">Upcoming (next 14 days)</h2>
          <div className="rounded-lg border border-[#423e42] bg-[#201f21] p-4">
            <ForecastChart data={forecast} />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-[#D4C6A6]">Mastery by domain</h2>
          <div className="rounded-lg border border-[#423e42] bg-[#201f21] p-4">
            {domainMastery.length === 0 ? (
              <p className="text-sm text-[#696A61]">No notions yet.</p>
            ) : (
              <DomainMasteryBars data={domainMastery} />
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-[#D4C6A6]">Explain mode — levels passed</h2>
          <div className="rounded-lg border border-[#423e42] bg-[#201f21] p-4">
            <ExplainLevelBars counts={explainCounts} />
          </div>
        </section>
      </div>
    </div>
  );
}
export default function Progress(){return withRequestCourse(ProgressPage);}
