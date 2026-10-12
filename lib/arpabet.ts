import { dictionary } from "cmu-pronouncing-dictionary";

// ARPABET -> IPA, stress digit stripped (applied separately). Standard
// mapping; https://en.wikipedia.org/wiki/ARPABET
const ARPABET_TO_IPA: Record<string, string> = {
  AA: "ɑ", AE: "æ", AH: "ʌ", AO: "ɔ", AW: "aʊ", AY: "aɪ",
  B: "b", CH: "tʃ", D: "d", DH: "ð", EH: "ɛ", ER: "ɜr", EY: "eɪ",
  F: "f", G: "ɡ", HH: "h", IH: "ɪ", IY: "i", JH: "dʒ", K: "k",
  L: "l", M: "m", N: "n", NG: "ŋ", OW: "oʊ", OY: "ɔɪ", P: "p",
  R: "r", S: "s", SH: "ʃ", T: "t", TH: "θ", UH: "ʊ", UW: "u",
  V: "v", W: "w", Y: "j", Z: "z", ZH: "ʒ",
};

// Simplified phonetic respelling per ARPABET vowel, for the "syllables"
// display (e.g. "kuhm-PYOO-ter") — not IPA, meant to be readable at a
// glance without knowing phonetic notation.
const ARPABET_TO_READABLE: Record<string, string> = {
  AA: "ah", AE: "a", AH: "uh", AO: "aw", AW: "ow", AY: "eye",
  EH: "eh", ER: "er", EY: "ay", IH: "ih", IY: "ee", OW: "oh",
  OY: "oy", UH: "uu", UW: "oo",
  B: "b", CH: "ch", D: "d", DH: "th", F: "f", G: "g", HH: "h",
  JH: "j", K: "k", L: "l", M: "m", N: "n", NG: "ng", P: "p",
  R: "r", S: "s", SH: "sh", T: "t", TH: "th", V: "v", W: "w",
  Y: "y", Z: "z", ZH: "zh",
};

const VOWEL_BASES = new Set([
  "AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW",
]);

interface Phoneme {
  base: string; // e.g. "AH"
  stress: 0 | 1 | 2 | null; // null for consonants
}

function parsePhonemes(entry: string): Phoneme[] {
  return entry
    .trim()
    .split(/\s+/)
    .map((token) => {
      const match = /^([A-Z]+)([012])?$/.exec(token);
      if (!match) return { base: token, stress: null };
      const [, base, digit] = match;
      return { base, stress: digit ? (Number(digit) as 0 | 1 | 2) : null };
    });
}

// Groups a flat phoneme list into syllables, one vowel nucleus each.
// Intervocalic consonants: a single one joins the FOLLOWING syllable's
// onset (classic "a-bove" rule); with two or more, the last one joins the
// following onset and the rest stay as the current syllable's coda. Not
// linguistically perfect for every edge case, but a solid approximation of
// English phonotactics for a visual aid.
function syllabify(phonemes: Phoneme[]): Phoneme[][] {
  const vowelIndices = phonemes.reduce<number[]>((acc, p, i) => {
    if (VOWEL_BASES.has(p.base)) acc.push(i);
    return acc;
  }, []);
  if (vowelIndices.length === 0) return [phonemes];

  const syllables: Phoneme[][] = [];
  let boundary = 0;

  for (let v = 0; v < vowelIndices.length; v++) {
    const vowelIdx = vowelIndices[v];
    const nextVowelIdx = vowelIndices[v + 1];
    let end: number;
    if (nextVowelIdx === undefined) {
      end = phonemes.length;
    } else {
      const between = nextVowelIdx - vowelIdx - 1;
      // Consonants strictly between this vowel and the next one.
      end = between <= 1 ? vowelIdx + 1 : nextVowelIdx - 1;
    }
    syllables.push(phonemes.slice(boundary, end));
    boundary = end;
  }

  return syllables;
}

function readableSyllable(syllable: Phoneme[]): string {
  return syllable.map((p) => ARPABET_TO_READABLE[p.base] ?? p.base.toLowerCase()).join("");
}

function ipaSyllable(syllable: Phoneme[]): string {
  return syllable.map((p) => ARPABET_TO_IPA[p.base] ?? p.base.toLowerCase()).join("");
}

function syllableStress(syllable: Phoneme[]): 0 | 1 | 2 {
  const vowel = syllable.find((p) => VOWEL_BASES.has(p.base));
  return vowel?.stress ?? 0;
}

export interface CmuLookup {
  ipa: string; // dictionary-style IPA with ˈ/ˌ stress marks
  syllables: string; // readable respelling, e.g. "kuhm-PYOO-ter"
  primarySyllableIndex: number;
}

// Looks up a word's authoritative pronunciation from the CMU Pronouncing
// Dictionary (135k+ entries) instead of asking an LLM to guess stress
// placement — stress position is a fixed lexical fact for a given word, not
// something a language model reliably reconstructs from spelling alone.
// Returns null for out-of-vocabulary words (proper nouns, rare terms),
// which the caller falls back to the LLM's own guess for.
export function lookupCmuWord(word: string): CmuLookup | null {
  const key = word.trim();
  const entry = dictionary[key] ?? dictionary[key.toLowerCase()];
  if (!entry) return null;

  const phonemes = parsePhonemes(entry);
  const syllables = syllabify(phonemes);

  let primarySyllableIndex = syllables.findIndex((s) => syllableStress(s) === 1);
  if (primarySyllableIndex === -1) primarySyllableIndex = 0;

  const readable = syllables
    .map((s) => {
      const text = readableSyllable(s);
      return syllableStress(s) === 1 ? text.toUpperCase() : text;
    })
    .join("-");

  const ipaParts = syllables.map((s) => {
    const stress = syllableStress(s);
    const mark = stress === 1 ? "ˈ" : stress === 2 ? "ˌ" : "";
    return mark + ipaSyllable(s);
  });

  return {
    ipa: `/${ipaParts.join("")}/`,
    syllables: readable,
    primarySyllableIndex,
  };
}
