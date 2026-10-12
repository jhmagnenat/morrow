"use client";
import { useState } from 'react';
import type { ClairLesson } from '@/lib/clair';
import {clairMatchesConcept,clairQualityIssues} from '@/lib/contentQuality';

const STEPS = ['Context', 'Logic', 'Connections', 'Implications', 'Reconstruction'] as const;
export default function ClairReader({lesson, conceptLabel, onSelect}: {lesson: ClairLesson; conceptLabel?: string; onSelect?: (id: string) => void}) {
  const [step, setStep] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const move = (index: number) => {setStep(index); setRevealed(false);};
  if(conceptLabel&&!clairMatchesConcept(conceptLabel,lesson))return <p role="alert">This lesson belongs to another concept. Generate a corrected explanation from the source.</p>;
  const issues=clairQualityIssues(conceptLabel??lesson.conceptLabel??'',lesson);
  if(issues.length)return <div role="alert"><p>This explanation needs correction before it can be used for learning. Check the original course sources.</p><ul>{issues.map(issue=><li key={issue}>{issue}</li>)}</ul>{lesson.sources.map((source,i)=><a key={i} className="block text-accent-400" href={`/api/documents/${encodeURIComponent(source.documentId)}/file#page=${source.page}`} target="_blank" rel="noreferrer">Slide {source.page} ↗</a>)}</div>;
  return <div className="space-y-3 text-sm leading-relaxed text-[#8F8978]" data-testid="clair-reader">
    <nav aria-label="C.L.A.I.R. dimensions" className="flex flex-wrap gap-2 text-xs">
      {STEPS.map((label, index) => <button key={label} aria-current={step === index ? 'step' : undefined} onClick={() => move(index)} className={step === index ? 'text-accent-400' : 'text-[#696A61] hover:text-[#8F8978]'}>{label}</button>)}
    </nav>
    {step === 0 && <p className="whitespace-pre-line">{lesson.context}</p>}
    {step === 1 && <>
      <p>{lesson.logic.answer}</p>
      <ol className="list-decimal space-y-2 pl-5">{lesson.logic.steps.map((text, index) => <li key={index}>{text}</li>)}</ol>
      {lesson.logic.analogy.model && <p><span className="text-[#696A61]">Teaching analogy: </span>{lesson.logic.analogy.model} {lesson.logic.analogy.mapping} Limit: {lesson.logic.analogy.limit}</p>}
      <details><summary className="cursor-pointer text-accent-400">Precise formulation and conditions</summary><p className="mt-2 whitespace-pre-line">{lesson.logic.formalism}</p></details>
    </>}
    {step === 2 && (lesson.articulations.length ? <ul className="space-y-3">{lesson.articulations.map((connection, index) => <li key={`${connection.notionId}:${index}`}>
      {onSelect ? <button className="text-accent-400" onClick={() => onSelect(connection.notionId)}>{connection.label}</button> : <span className="text-accent-400">{connection.label}</span>}
      <span className="ml-2 text-xs text-[#696A61]">{connection.type === 'prerequisite' ? connection.direction === 'incoming' ? 'Prerequisite for this idea' : 'Builds on this idea' : connection.type}</span>
      <p>{connection.explanation}</p>
    </li>)}</ul> : <p>No source-supported relationship has been established for this concept yet.</p>)}
    {step === 3 && <>
      <p className="text-xs text-[#696A61]">{lesson.implications.origin === 'source' ? 'Situation quoted from the course' : 'Generated practice situation · not attributed to the lecturer'}</p>
      <p>{lesson.implications.setup}</p><p><span className="text-[#696A61]">Assume: </span>{lesson.implications.assumptions}</p>
      <p className="text-[#D4C6A6]">{lesson.implications.question}</p>
      {!revealed ? <button onClick={() => setRevealed(true)} className="text-accent-400">Compare your reasoning</button> : <p>{lesson.implications.answer} {lesson.implications.why}</p>}
      {lesson.implications.limits && <p>Limit: {lesson.implications.limits}</p>}
    </>}
    {step === 4 && <>
      <p className="text-[#D4C6A6]">{lesson.reconstruction.question}</p>
      <p className="text-xs text-[#696A61]">Explain it aloud or in your own words before revealing the reasoning. Reading a lesson does not change mastery.</p>
      {!revealed ? <button onClick={() => setRevealed(true)} className="text-accent-400">Show the reasoning to reconstruct</button> : <p className="whitespace-pre-line">{lesson.reconstruction.expectedAnswer}</p>}
      <a href="/interview" className="block text-xs text-accent-400">Test your understanding in Interview →</a>
    </>}
    <div className="flex justify-between border-t border-[#423e42] pt-2 text-xs">
      <button disabled={step === 0} onClick={() => move(step - 1)} className="disabled:opacity-30">← Previous</button>
      <span>C.L.A.I.R. · {step + 1} / 5</span>
      <button disabled={step === 4} onClick={() => move(step + 1)} className="disabled:opacity-30">Next →</button>
    </div>
    <details className="text-xs"><summary className="cursor-pointer text-[#696A61]">Course sources · analogies and hypothetical examples are teaching aids</summary>
      {lesson.sources.map((source, index) => <div key={index} className="mt-2"><a className="text-accent-400" href={`/api/documents/${encodeURIComponent(source.documentId)}/file#page=${source.page}`} target="_blank" rel="noreferrer">Slide {source.page} ↗</a><p className="mt-1">{source.quote || source.visualDescription}</p></div>)}
    </details>
  </div>;
}
