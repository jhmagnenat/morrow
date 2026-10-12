import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { getExplainAttemptById, getNotionById, insertPronunciationCard, type PronunciationWord } from "@/lib/db";
import { LlmNotConfiguredError, LlmProviderError, structuredCompletion } from "@/lib/llm";
import { KNOWN_LIAISONS } from "@/lib/pronunciation";
import { lookupCmuWord } from "@/lib/arpabet";

interface GenerateResult {
  words: PronunciationWord[];
  fullIpa: string;
}

async function handlePOST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    text?: string;
    notionId?: string;
    sourceAttemptId?: string;
  };

  const text = (body.text ?? "").trim();
  if (text.length < 3) {
    return NextResponse.json({ error: "Text is too short to practice." }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: "Text is too long for one pronunciation card — keep it to a paragraph or less." }, { status: 400 });
  }

  if (body.notionId && !getNotionById(body.notionId)) {
    return NextResponse.json({ error: "Notion not found" }, { status: 404 });
  }
  if (body.sourceAttemptId && !getExplainAttemptById(body.sourceAttemptId)) {
    return NextResponse.json({ error: "Explain attempt not found" }, { status: 404 });
  }

  const system =
    "You are an English pronunciation coach. Given a piece of English text, break it into its words " +
    "(skip pure punctuation tokens) and, for each one, give: the dictionary IPA transcription including " +
    "the stress mark (ˈ) placed right before the stressed syllable; a readable syllable breakdown with the " +
    "stressed syllable capitalized (e.g. \"com-PU-ter\") — a best-effort guess, since word-level stress for " +
    "known words is corrected afterward against a pronunciation dictionary, so don't agonize over it.\n\n" +
    "What actually matters here is sentenceStress (primary/secondary/none per word), which nothing else can " +
    "correct for you. Rule of thumb for a plain, non-contrastive sentence: exactly ONE word is \"primary\" — " +
    "the single most important new piece of information (usually the final content word, or whatever the " +
    "sentence is really ABOUT) — a handful of other content words (nouns, main verbs, adjectives, adverbs, " +
    "negations) are \"secondary\", and function words (a, the, is, of, to, and, that, it) are \"none\" unless " +
    "one of them is itself the contrasted word (e.g. \"I said THE book, not A book\"). Worked example for " +
    "\"I didn't say she stole the money\": \"didn't\"=secondary, \"say\"=secondary, \"she\"=secondary, " +
    "\"stole\"=primary (the actual point being made), \"money\"=secondary, everything else=none. Don't mark " +
    "more than 1 word primary and don't leave content words at \"none\" by default — the goal is a sentence " +
    "that's clearly contoured when read aloud, not one where everything or nothing is emphasized.\n\n" +
    "Also flag connected speech: in natural fluent English, adjacent words often blend together " +
    "(linking, elision, assimilation) — e.g. \"let me\" -> \"lemme\", \"want to\" -> \"wanna\", \"going to\" " +
    "-> \"gonna\", \"did you\" -> \"didja\", a consonant linking into a following vowel like \"an apple\" " +
    "running together. The field is attached to the FIRST word of the pair and describes exactly that word " +
    "plus the one immediately after it — nothing else. Worked example for the sentence \"Let me go\": the " +
    "word \"Let\" gets linksToNext=true and blendWithNext=\"lemme\" (because \"Let\"+\"me\" -> \"lemme\"); " +
    "the word \"me\" gets linksToNext=false (it already blended INTO \"Let\"'s entry — don't also attach a " +
    "blend to \"me\" itself, and don't attach \"gonna\" to \"go\" just because \"go\" is followed by another " +
    "word — \"gonna\" only applies to an actual \"going to\"/\"gonna\" pair). Before setting linksToNext, " +
    "say the two literal adjacent words out loud in your head and confirm THEY SPECIFICALLY produce the " +
    "blend you're about to write — never reuse a well-known blended phrase unless these exact two words are " +
    "it. Most word boundaries have no linking at all; leave linksToNext false and blendWithNext empty by " +
    "default. Finally, give fullIpa: a single connected-speech IPA transcription of the ENTIRE sentence as " +
    "a fluent native speaker would actually say it, not just the citation-form words stuck together — only " +
    "place a tie bar ‿ between two words if you also set linksToNext=true on the first one for that exact " +
    "pair (e.g. \"let‿me\" as /lɛ‿mi/ only alongside \"Let\".linksToNext=true, \"Let\".blendWithNext=\"lemme\").";

  const userPrompt = `Text to break down for pronunciation practice:\n\n${text}`;

  let result: GenerateResult;
  try {
    result = await structuredCompletion<GenerateResult>(
      system,
      userPrompt,
      "break_down_pronunciation",
      "Break the text into words with IPA, syllable stress, sentence-level emphasis, and connected-speech linking.",
      {
        type: "object",
        properties: {
          words: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                word: { type: "string" },
                ipa: { type: "string", description: "Dictionary IPA with the stress mark, e.g. /kəmˈpjuːtər/" },
                syllables: { type: "string", description: "e.g. com-PU-ter" },
                sentenceStress: { type: "string", enum: ["primary", "secondary", "none"] },
                note: { type: "string", description: "A short rule name, only if one genuinely applies" },
                linksToNext: {
                  type: "boolean",
                  description: "True only if this word genuinely blends into the next one in fluent speech",
                },
                blendWithNext: {
                  type: "string",
                  description: "The blended colloquial form, e.g. \"lemme\" — empty when linksToNext is false",
                },
              },
              required: ["word", "ipa", "syllables", "sentenceStress", "note", "linksToNext", "blendWithNext"],
            },
          },
          fullIpa: {
            type: "string",
            description: "One connected-speech IPA transcription of the whole sentence, tie bar ‿ between linked words",
          },
        },
        required: ["words", "fullIpa"],
      }
    );
  } catch (error) {
    if (error instanceof LlmNotConfiguredError || error instanceof LlmProviderError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }

  // The model is instructed to skip punctuation-only tokens but doesn't
  // always comply — drop anything without a letter rather than storing a
  // card with an empty/invalid entry (e.g. a bare "." with no IPA).
  const words = result.words.filter((w) => /[a-zA-Z]/.test(w.word));

  // Lexical stress (which syllable of a WORD is stressed) is a fixed fact
  // for a given word, not something that should be guessed per request — an
  // LLM is unreliable here, visible as the capitalization/underline landing
  // on the wrong syllable. Override with the CMU Pronouncing Dictionary
  // (135k+ entries) whenever the word is in it; keep the model's own guess
  // only for out-of-vocabulary words (proper nouns, rare/invented terms).
  // sentenceStress is untouched — that's genuinely context-dependent and
  // stays the model's call.
  for (const w of words) {
    const cleanWord = w.word.replace(/^[^a-zA-Z']+|[^a-zA-Z']+$/g, "");
    const cmu = lookupCmuWord(cleanWord);
    if (cmu) {
      w.ipa = cmu.ipa;
      w.syllables = cmu.syllables;
    }
  }

  // The model is unreliable at judging which exact word pair a well-known
  // blend belongs to (e.g. it'll tag "go check" with "gonna"). Cross-check
  // every claimed link against a curated whitelist rather than trusting it
  // outright — better to under-detect liaisons than draw a wrong one.
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = words[i + 1];
    if (!w.linksToNext || !next) {
      w.linksToNext = false;
      w.blendWithNext = "";
      continue;
    }
    const known = KNOWN_LIAISONS[`${w.word.toLowerCase()} ${next.word.toLowerCase()}`];
    if (known) {
      w.blendWithNext = known;
    } else {
      w.linksToNext = false;
      w.blendWithNext = "";
    }
  }

  const card = insertPronunciationCard({
    notionId: body.notionId,
    sourceAttemptId: body.sourceAttemptId,
    text,
    words,
    fullIpa: result.fullIpa,
  });

  return NextResponse.json({ card });
}

export const POST = courseRoute(handlePOST);
