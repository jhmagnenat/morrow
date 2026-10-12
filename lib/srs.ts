// FSRS-6 scheduling with short learning steps. Pure functions, no DB access.
// Historical SM-2 calculation remains available for compatibility checks.

import {scheduleFsrs,FSRS_WEIGHTS,type FsrsMemory} from '@/lib/fsrs';
export type Grade = "again" | "hard" | "good" | "easy";

export interface ReviewState {
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  fsrs?: FsrsMemory;
  retention?: number;
  weights?:readonly number[];
}

export const INITIAL_REVIEW_STATE: ReviewState = {
  intervalDays: 0,
  easeFactor: 2.5,
  repetitions: 0,
};

const GRADE_QUALITY: Record<Grade, number> = {
  again: 0,
  hard: 3,
  good: 4,
  easy: 5,
};

export function nextReviewState(state: ReviewState, grade: Grade, now=new Date()): ReviewState {
  const scheduled=scheduleFsrs(state.fsrs,grade,now,state.retention??0.9,state.weights??FSRS_WEIGHTS);
  return {intervalDays:scheduled.intervalDays,easeFactor:state.easeFactor,repetitions:scheduled.memory.reps,fsrs:scheduled.memory,retention:state.retention??0.9,weights:state.weights};
}

// Retained only for compatibility checks of historical SM-2 snapshots.
export function legacyReviewState(state: ReviewState, grade: Grade): ReviewState {
  const quality = GRADE_QUALITY[grade];

  if (quality < 3) {
    // Failed recall enters short learning/relearning steps.
    return { intervalDays: state.intervalDays >= 1 ? 10 / 1440 : 1 / 1440, easeFactor: Math.max(1.3, state.easeFactor - 0.2), repetitions: 0 };
  }

  const repetitions = state.repetitions + 1;
  let intervalDays: number;
  if (state.intervalDays < 1) {
    intervalDays = grade === "hard" ? 6 / 1440 : grade === "easy" ? 4 : state.intervalDays < 10 / 1440 ? 10 / 1440 : 1;
  } else {
    const multiplier = grade === "hard" ? 1.2 : grade === "easy" ? state.easeFactor * 1.3 : state.easeFactor;
    intervalDays = Math.max(state.intervalDays + 1, Math.round(state.intervalDays * multiplier));
  }

  const easeFactor = Math.max(
    1.3,
    state.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );

  return { intervalDays, easeFactor, repetitions };
}

export function dueDateFrom(intervalDays: number, from: Date = new Date()): string {
  const due = new Date(from.getTime() + intervalDays * 86_400_000);
  return due.toISOString();
}
