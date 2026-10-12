import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import {
  getDomainMastery,
  getExplainLevelCounts,
  getForecast,
  getGraph,
  getMaturityBuckets,
  getPronunciationCardCount,
  getReviewHeatmap,
  getRetentionRate,
} from "@/lib/db";

async function handleGET() {
  const { notions, links } = getGraph();
  const pronunciationCount = getPronunciationCardCount();

  return NextResponse.json({
    totals: { notions: notions.length, links: links.length, pronunciation: pronunciationCount },
    notionMaturity: getMaturityBuckets("notion", notions.length),
    linkMaturity: getMaturityBuckets("link", links.length),
    pronunciationMaturity: getMaturityBuckets("pronunciation", pronunciationCount),
    forecast: getForecast(14),
    heatmap: getReviewHeatmap(98),
    retentionRate: getRetentionRate(),
    domainMastery: getDomainMastery(),
    explainCounts: getExplainLevelCounts(),
  });
}

export const GET = courseRoute(handleGET);
