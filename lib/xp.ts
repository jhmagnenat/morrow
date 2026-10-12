import type { Grade } from "@/lib/srs";

// Flat-ish XP per review, regardless of card type — a small bonus for
// genuine recall quality, but never zero for "Again": showing up and
// grading yourself honestly should never be worth less than gaming the
// system by always clicking "Easy".
export function xpForGrade(grade: Grade): number {
  switch (grade) {
    case "again":
      return 5;
    case "hard":
      return 8;
    case "good":
      return 10;
    case "easy":
      return 12;
  }
}

// XP needed to go from `level` to `level + 1` — grows linearly so later
// levels take meaningfully longer without ever becoming unreachable.
export function xpToNextLevel(level: number): number {
  return 100 + (level - 1) * 25;
}

export interface LevelProgress {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  totalXp: number;
}

export function levelFromXp(totalXp: number): LevelProgress {
  let level = 1;
  let remaining = totalXp;
  while (remaining >= xpToNextLevel(level)) {
    remaining -= xpToNextLevel(level);
    level++;
  }
  return { level, xpIntoLevel: remaining, xpForNextLevel: xpToNextLevel(level), totalXp };
}
