// Pure scoring logic for the mastery system — kept separate from lib/db.ts
// the same way lib/srs.ts holds the SM-2 math separately from persistence.
//
// Mastery is DELIBERATELY independent from the SRS system (review_state/
// review_log, lib/srs.ts): SRS answers "when should this come back up for
// review"; mastery answers "how well does the user actually know this right
// now". A notion can be due today (SRS) while already Mastered, or not due
// for weeks while still Weak — these are different axes on purpose.

export type MasteryLevel = "unknown" | "weak" | "learning" | "developing" | "mastered";

export type MasterySource = "drill" | "connect" | "explain" | "interview";
export const MASTERY_DIMENSIONS = ['definition', 'mechanism', 'relations', 'application', 'reconstruction'] as const;
export type MasteryDimension = typeof MASTERY_DIMENSIONS[number];
export interface MasterySignal {score: number; dimension?: MasteryDimension | null; source: MasterySource; unaided?: boolean;taskId?:string|null;}
export interface DimensionMastery {score: number | null; signalCount: number; level: MasteryLevel;}

export interface MasteryInfo {
  level: MasteryLevel;
  score: number | null; // null only when level is "unknown" (never tested)
  signalCount: number;
  dimensions?: Record<MasteryDimension, DimensionMastery>;
  weakestDimension?: MasteryDimension;
}

export function cardMasteryDimension(kind: string): MasteryDimension {
  return kind === 'mechanism' ? 'mechanism' : kind === 'comparison' ? 'relations' : kind === 'application' ? 'application' : 'definition';
}

export function computeMasteryProfile(signalsNewestFirst: MasterySignal[]): MasteryInfo {
  const dimensions = Object.fromEntries(MASTERY_DIMENSIONS.map(dimension => {
    const signals = signalsNewestFirst.filter(s => s.dimension === dimension).slice(0, 10);
    const info = computeMasteryFromScores(signals.map(s => s.score));
    // A recent failed task cannot be hidden by older successful repetitions.
    const score = signals[0]?.score < 0.55 ? Math.min(info.score ?? 0, signals[0].score) : info.score;
    return [dimension, {...info, score, level: score === null ? 'unknown' : scoreToLevel(score)}];
  })) as Record<MasteryDimension, DimensionMastery>;
  const observed = MASTERY_DIMENSIONS.filter(d => dimensions[d].score !== null);
  // Historical scalar scores stay in the backup, but cannot establish a
  // competence that was never assessed separately.
  if (!observed.length) return {...NEVER_TESTED, signalCount: signalsNewestFirst.length, dimensions, weakestDimension: 'mechanism'};
  let score = Math.min(...observed.map(d => dimensions[d].score!));
  if (dimensions.mechanism.score === null) score = Math.min(score, 0.54);
  const complete = MASTERY_DIMENSIONS.every(d => dimensions[d].signalCount >= 2);
  const variedApplications=new Set(signalsNewestFirst.filter(s=>s.dimension==='application'&&s.score>=0.8&&s.taskId).map(s=>s.taskId)).size>=2;
  const independentReconstruction = signalsNewestFirst.filter(s => s.dimension === 'reconstruction').slice(0, 10).some(s => s.source !== 'drill' && s.unaided === true && s.score >= 0.8);
  if (!complete || !independentReconstruction || !variedApplications) score = Math.min(score, 0.79);
  const weakestDimension = [...MASTERY_DIMENSIONS].sort((a, b) => (dimensions[a].score ?? -1) - (dimensions[b].score ?? -1))[0];
  return {level: scoreToLevel(score), score, signalCount: signalsNewestFirst.length, dimensions, weakestDimension};
}

// A notion with zero signals is "unknown", never "weak" — weak means
// "tested and struggling", not "never looked at".
const NEVER_TESTED: MasteryInfo = { level: "unknown", score: null, signalCount: 0 };

export function scoreToLevel(score: number): MasteryLevel {
  if (score < 0.3) return "weak";
  if (score < 0.55) return "learning";
  if (score < 0.8) return "developing";
  return "mastered";
}

// Recency-weighted average over the most recent signals (any mix of
// drill/connect/explain/interview) — recent performance should move the
// needle more than something from weeks ago, without fully discarding
// older history the way SRS scheduling would. Linear decay, not
// exponential: simple to reason about, and over only ~10 signals the
// difference from a "truer" decay curve isn't worth the complexity.
export function computeMasteryFromScores(scoresNewestFirst: number[]): MasteryInfo {
  if (scoresNewestFirst.length === 0) return NEVER_TESTED;

  let weightedSum = 0;
  let weightTotal = 0;
  scoresNewestFirst.forEach((score, i) => {
    const weight = scoresNewestFirst.length - i;
    weightedSum += score * weight;
    weightTotal += weight;
  });
  const avg = weightedSum / weightTotal;

  return { level: scoreToLevel(avg), score: avg, signalCount: scoresNewestFirst.length };
}

// How a given grade/verdict maps to a 0-1 mastery signal. Deliberately NOT
// the same curve as SRS's ease-factor math (lib/srs.ts) — mastery just
// wants "how well did they do", not scheduling.
export function gradeToScore(grade: "again" | "hard" | "good" | "easy"): number {
  switch (grade) {
    case "again": return 0.05;
    case "hard": return 0.4;
    case "good": return 0.75;
    case "easy": return 1.0;
  }
}

export function verdictToScore(verdict: "pass" | "retry"): number {
  return verdict === "pass" ? 0.85 : 0.25;
}
