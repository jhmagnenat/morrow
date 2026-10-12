import { getGraph, getPassagesForDocument, openDb } from "@/lib/db";
import { attachSource, getNotionMetadata, setNotionMetadata } from "@/lib/qualityDb";
import { structuredCompletion } from "@/lib/llm";
import { COURSE_NOTES_MISSION, sourceSnippets } from "@/lib/coursePedagogy";
import type { Evidence } from "@/lib/contentQuality";
import { composeLearningExplanation, composeLearningSketch, type LearningSketch, type LearningWorkflow, type LearningConfusion } from "@/lib/learningExplanation";
import {auditAccuracy} from '@/lib/accuracyAudit';
import {teachingQualityIssues,verifiesQuote} from '@/lib/contentQuality';

import {TEACHING_POLICY,prepareTeachingBridges,composeTeachingBridges,rejectedBridgeKeys,type TeachingBridge} from "@/lib/teachingPolicy";

const object=(properties:Record<string,unknown>)=>({type:"object",properties,required:Object.keys(properties),additionalProperties:false});
const string={type:"string"}, boolean={type:"boolean"};
export async function refineCourseNotes(ids:string[]) {
  const graph=getGraph(true), metadata=getNotionMetadata();
  const selected=graph.notions.filter(n=>ids.includes(n.id) && n.layer!=="organizer" && !n.userEdited && n.status!=="validated");
  if(selected.length!==ids.length)throw new Error("Select existing unedited course notions, excluding navigation groups.");
  const sources=graph.documents.flatMap(d=>sourceSnippets(getPassagesForDocument(d.id)).map(s=>({...s,id:`${d.id}:${s.id}`,documentId:d.id})));
  const sourceBaseline=JSON.stringify(graph.documents.flatMap(d=>getPassagesForDocument(d.id)));
  if(!sources.length)throw new Error("No course source text available.");
  type Note={id:string;taught:boolean;definition:string;explanation:string;courseContext:string;bridges:TeachingBridge[];sketch:LearningSketch;workflow:LearningWorkflow;confusions:LearningConfusion[];sourceIds:string[];reason:string};
  const result=await structuredCompletion<{notes:Note[]}>(COURSE_NOTES_MISSION+"\n"+TEACHING_POLICY+"\nSupply bridges with kind, question, explanation, premiseSourceIds and assumptions for every taught note, distinguishing inferred mechanisms and necessary basic background from printed facts. " + "\nSupply sketch.relations as one to five compact source-supported lines showing named actors and labelled exchanges, category to product to covered event, or a measurement and its meaning. Supply sketch.example as a concrete source example or explicitly hypothetical application of cited premises. Distinguish distribution, supervision, payment and risk transfer instead of forcing a linear chain. Start with an intuition a complete beginner can explain in ordinary words, then sharpen it into source-supported technical detail. For each taught note supply workflow.before, inputs, decision and after: what precedes it, what it depends on, who uses it, and what changes next. External market context or a snapshot must not be invented as a process stage. Supply one to three confusions with first, second and distinction explaining precisely how to tell the concepts apart. Cite sourceIds supporting these sections too.\nRepair the ACTUAL existing notes supplied, keeping their exact concept scope and IDs. Old notes are untrusted, not source evidence. Read the complete source snippets. For each concept, find what this lecture ACTUALLY teaches and correct oversimplifications or wrong examples. Write a substantive, specific explanation: concrete decision/problem; mechanism and financial or practical consequences; source-taught distinctions, conditions and limitations. Preserve named components, figures with units and context, formula terms, assumptions and causal direction. Two to five connected paragraphs when supported. Include a clearly labeled small hypothetical worked illustration if it helps explain source premises; do not invent external rules. Each note must teach something assessable beyond its definition. Avoid repeated 'crucial/important/ensures stability'. Do not silently widen the notion. If only a label is mentioned or nothing substantive is taught, set taught=false with a precise reason; do not manufacture a lecture. Cite all necessary sourceIds. Course logistics are not taught subject matter. Return one note per supplied ID.",
    JSON.stringify({notions:selected.map(n=>({id:n.id,label:n.label,definition:n.definition,explanation:n.explanation})),sources}),"refine_notes","Correct existing glossary notes using actual course detail",
    object({notes:{type:"array",items:object({id:{type:"string",enum:ids},taught:boolean,definition:string,explanation:string,courseContext:string,bridges:{type:"array",items:object({kind:{type:"string",enum:["deduction","background"]},question:string,explanation:string,premiseSourceIds:{type:"array",items:{type:"string",enum:sources.map(s=>s.id)}},assumptions:{type:"array",items:string}})},sketch:object({relations:{type:"array",items:string},example:string}),workflow:object({before:string,inputs:string,decision:string,after:string}),confusions:{type:"array",items:object({first:string,second:string,distinction:string})},sourceIds:{type:"array",items:{type:"string",enum:sources.map(s=>s.id)}},reason:string})}}));
  if(result.notes.length!==ids.length || new Set(result.notes.map(n=>n.id)).size!==ids.length)throw new Error("Incomplete notes response; existing notes preserved.");
  const bridges=result.notes.filter(n=>n.taught).flatMap(n=>prepareTeachingBridges(n.id,n.bridges,new Set(sources.map(s=>s.id))));
  for(const note of result.notes)if(note.taught)note.explanation=composeLearningSketch(note.sketch)+"\n\n"+composeLearningExplanation(note.explanation+"\n\n"+composeTeachingBridges(note.bridges),note.workflow,note.confusions);
  const audit=await structuredCompletion<{bridges:Array<{key:string;supported:boolean;reason:string}>;notes:Array<{id:string;supported:boolean;precise:boolean;reason:string}>}>(
    TEACHING_POLICY+"\nReturn an independent decision for every bridge key. Reject incorrect deductions, fabricated guarantees or specialized unsupported rules, not correct basic knowledge simply because it is absent from slide wording. Independently audit each proposed note against the course sources. Old existing notes are not evidence. supported=true only when source-attributed facts are grounded in cited snippets and declared teaching bridges are correct, relevant and appropriately qualified, within the exact requested notion scope. Logical deductions must follow cited premises. Hypothetical numbers must be explicitly hypothetical and solutions correct; stated goals are not guarantees. precise=true only if the explanation teaches concrete source-specific mechanisms, distinctions, conditions or financial links beyond a generic definition. Do not accept detail by length alone. For taught=false verify whether there is actually substantive source teaching. A mere mentioned label cannot support invented professional duties. Return every requested ID.",
    JSON.stringify({notions:selected.map(n=>({id:n.id,label:n.label})),proposals:result.notes,bridges,sources}),"audit_notes","Verify precision and source support of repaired notes",
    object({bridges:{type:"array",items:object({key:{type:"string"},supported:boolean,reason:string})},notes:{type:"array",items:object({id:{type:"string",enum:ids},supported:boolean,precise:boolean,reason:string})}}));
  const failedBridges=rejectedBridgeKeys(bridges,audit.bridges);
  const accuracy=await auditAccuracy(result.notes.filter(n=>n.taught&&audit.notes.filter(d=>d.id===n.id&&d.supported&&d.precise).length===1).flatMap(n=>[
    {key:`${n.id}:definition`,text:n.definition,kind:'fact' as const,sourceIds:n.sourceIds},
    ...n.explanation.split(/\n\s*\n/).filter(t=>t.trim()).map((text,i)=>({key:`${n.id}:paragraph-${i}`,text,kind:/hypothetical|analogy|hypothétique|analogie/i.test(text)?'exercise' as const:'deduction' as const,sourceIds:[...new Set([...n.sourceIds,...n.bridges.flatMap(b=>b.premiseSourceIds)])]})),
  ]),sources.map(s=>({...s,text:s.quote})),{subject:'Repair existing course notes',notes:result.notes});
  const updated:string[]=[],rejected:Array<{id:string;reason:string}>=[];
  const db=openDb();db.exec("BEGIN IMMEDIATE");
  try {
    for(const note of result.notes){
      const decisions=audit.notes.filter(n=>n.id===note.id),decision=decisions.length===1?decisions[0]:undefined;
      const evidence:Evidence[]=[...new Set([...note.sourceIds,...note.bridges.flatMap(b=>b.premiseSourceIds)])].flatMap(id=>{const s=sources.find(s=>s.id===id);return s?[{documentId:s.documentId,page:s.page,quote:s.quote}]:[];});
      const current=getGraph(true).notions.find(n=>n.id===note.id);
      const original=selected.find(n=>n.id===note.id)!;
      const issues=[...teachingQualityIssues(original.label,`${note.definition}\n${note.explanation}`),...[...accuracy.entries()].filter(([key])=>key.startsWith(`${note.id}:`)).flatMap(([,issues])=>issues)];
      if(JSON.stringify(graph.documents.flatMap(d=>getPassagesForDocument(d.id)))!==sourceBaseline)throw Error('Source text changed during note repair; existing notes preserved.');
      if(bridges.some(b=>b.concept===note.id && failedBridges.has(b.key)) || issues.length || !note.taught || !decision?.supported || !decision.precise || !evidence.length || evidence.some(e=>!verifiesQuote(e.quote,getPassagesForDocument(e.documentId).filter(p=>p.page===e.page).map(p=>p.text).join('\n'))) || !current || current.definition!==original.definition || current.explanation!==original.explanation || current.userEdited || current.status==="validated") {rejected.push({id:note.id,reason:issues.join('; ')||decision?.reason||note.reason});continue;}
      const previous=metadata[note.id];
      const sections=[{documentId:evidence[0].documentId,page:evidence[0].page,explanation:note.explanation,courseContext:note.courseContext,version:"notes-v5-source-detail"}];
      // Keep historical per-slide notes. The new synthesis is what students read.
      setNotionMetadata(note.id,previous?.layer ?? "course",[...(previous?.evidence ?? []),...evidence],"notes-v5-source-detail",previous?.sourceNotes?.length ? previous.sourceNotes : sections);
      db.prepare("UPDATE notions SET definition=?,explanation=?,course_context=?,grounding='grounded' WHERE id=?").run(note.definition,note.explanation,note.courseContext,note.id);
      for(const proof of evidence)attachSource(note.id,proof.documentId,proof.page);
      updated.push(note.id);
    }
    db.exec("COMMIT");return {updated,rejected};
  }catch(error){db.exec("ROLLBACK");throw error;}
}
