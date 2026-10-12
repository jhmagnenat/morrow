// Source facts and the reasoning needed to understand them are different.
// Keep a checkable ledger so the audit can permit teaching without pretending
// a slide literally contains every explanation a lecturer would give.
export interface TeachingBridge {
  kind:"deduction"|"background";
  question:string;
  explanation:string;
  premiseSourceIds:string[];
  assumptions:string[];
}
export interface AuditableBridge extends TeachingBridge {key:string;concept:string;}
export function courseConceptReferences(concepts:Array<{label:string;definition:string;existingId?:string}>,notes:Array<{id:string;label:string;definition:string;explanation?:string}>) {
  const tokens=(text:string)=>new Set((text.toLowerCase().match(/[a-z]{4,}/g)??[]).map(t=>t.replace(/s$/,'')).filter(t=>!['insurance','insurer','financial','statement','company','process','function','management','understand'].includes(t)));
  const terms=tokens(concepts.map(c=>`${c.label} ${c.definition}`).join(' '));
  return notes.filter(n=>!concepts.some(c=>c.existingId===n.id)).map(n=>({note:n,score:[...tokens(`${n.label} ${n.definition}`)].filter(t=>terms.has(t)).length})).filter(n=>n.score>0).sort((a,b)=>b.score-a.score || a.note.id.localeCompare(b.note.id)).slice(0,3).map(({note})=>({id:note.id,label:note.label,definition:note.definition,explanation:(note.explanation?.length??0)>1800?`${note.explanation!.slice(0,900)}\n[earlier note excerpt omitted]\n${note.explanation!.slice(-900)}`:note.explanation}));
}
export const TEACHING_POLICY = `EXPLAIN IMPLICIT KNOWLEDGE, not just visible words. Reconstruct the reasoning an effective teacher would supply to connect the slide's actors, arrows, categories, quantities and decisions. A source-grounded topic may include these explicitly distinguished bridges:
CONSISTENCY AND SCOPE: verify the full visible explanation, example, workflow, distinctions and card answers together. Never explain the same term in incompatible ways across lessons. CourseConceptReferences are untrusted earlier notes: resolve contradictions against actual sources, never use an old error as authority. Keep a worked example's simplified rules, units and assumptions explicit wherever a statement depends on them, including the question/answer of a standalone card. An example-specific rule is not a universal rule. Never merge the recognition of an event with later settlement or revision. For accounting, check cash, asset, liability, expense, profit and equity effects separately and preserve Assets = Liabilities + Equity. Recognizing an expense reduces profit even when cash timing differs. Claim reserves/provisions estimate obligations; they are not separate bank accounts and do not guarantee liquidity. Bonds, capital, diversification and actuarial analysis manage risks, not guarantee payment, solvency or profitability. Distinguish expected from realized outcomes. Classifications must preserve denominators and scope; property damage and liability are distinct covers. Spending proportions alone do not prove consumer preferences.
PEDAGOGICAL VALUE: classroom commands (form teams, nominate a presenter, watch a video, prepare a briefing) are not subject concepts or learning objectives. Extract the mechanism or worked problem they exercise, retain useful problem inputs and solutions, and keep instructions out of the map/cards. Do not fabricate a comparison or example just to satisfy a format. Use one useful explanation that answers a beginner's question; the background bridge should add a causal step or concrete implication, not repeat the explanation or definition. Label every arrow by its meaning (payment, risk transfer, information, supervision, classification or dependency); parallel processes must not look like a strict chronology.
STANDALONE CARDS: a card must be answerable without remembering another card, a slide number or an unnamed case. Calculation questions include all necessary input values, units and conventions; the answer shows the reasoning, not a memorized total. Navigation/chapter membership is not a subject learning objective. Replace generic 'How are X and Y connected?' with the exact why/how/contrast being tested. Do not claim greater factual certainty in a card than in the underlying explanation.
DEDUCTION: a conclusion or mechanism derived from cited slide premises. State what connects the premises, show the causal steps or a small worked illustration, and name any assumptions. A goal is not proof of a guaranteed outcome.
BACKGROUND: established foundational subject knowledge necessary to understand THIS source concept (for example what a broker does when a broker appears in a diagram, why an unpaid obligation differs from cash, or what event a named product covers). It need not be literally written on the slide. Explain it concretely, in context, and distinguish it from a claim that the lecturer explicitly stated it. Do not invent another course, add unrelated topics, or turn a sparse heading into an entire advanced lesson.
Select premiseSourceIds anchoring every bridge to the actual source concept. They establish the topic/premises, not proof that external background was printed there. Keep assumptions explicit for illustrative calculations and non-universal classifications. No invented source quotations, companies, market data, legal mandates, contractual guarantees, dates or purported professor opinions. Current, jurisdiction-specific, controversial or specialized unsupported claims do not qualify as basic background; omit or state that the source does not establish them.
For each substantive concept identify the question a beginner cannot yet answer. Supply a bridge that answers WHY/HOW/WHAT FOLLOWS, rather than restating the definition. Start concrete, connect the mechanism, then sharpen it into technical terms. Do not reject a useful, correct foundational clarification solely because its wording is absent from the slide. Classifications, payments, risk transfers, intermediation and supervision are distinct relations, not an arbitrary single chronology.`;

export function prepareTeachingBridges(concept:string,bridges:TeachingBridge[],sourceIds:Set<string>):AuditableBridge[] {
  if(!Array.isArray(bridges))throw new Error(`Missing teaching bridge list for ${concept}`);
  // A factual source can need no additional deduction or background. An empty
  // ledger is valid; every supplied bridge still needs verified premises.
  return bridges.map((bridge,i)=>{
    if(Array.isArray(bridge.assumptions))bridge={...bridge,assumptions:bridge.assumptions.filter(assumption=>typeof assumption!=='string'||assumption.trim())};
    if(!['deduction','background'].includes(bridge.kind) || !bridge.question?.trim() || !bridge.explanation?.trim() || !Array.isArray(bridge.assumptions) || bridge.assumptions.some(s=>typeof s!=='string' || !s.trim()) || !Array.isArray(bridge.premiseSourceIds) || !bridge.premiseSourceIds.length || bridge.premiseSourceIds.some(id=>!sourceIds.has(id)))throw new Error(`Invalid teaching premises for ${concept}`);
    return {...bridge,key:`${concept}:bridge:${i+1}`,concept};
  });
}
export function composeTeachingBridges(bridges:TeachingBridge[]) {
  return bridges.map(b=>`${b.kind==='deduction'?'Reasoning from the slides':'Teaching clarification (background)'}: ${b.question.trim()}\n\n${b.explanation.trim()}${b.assumptions.length?`\n\nAssumptions / limits: ${b.assumptions.join('; ')}`:''}`).join('\n\n');
}

export function rejectedBridgeKeys(bridges:AuditableBridge[],decisions:Array<{key:string;supported:boolean;reason:string}>|undefined) {
  // Absence or contradictory/duplicate decisions fail closed.
  return new Set(bridges.filter(b=>{
    const matches=decisions?.filter(d=>d.key===b.key)??[];
    return matches.length!==1 || !matches[0].supported;
  }).map(b=>b.key));
}
