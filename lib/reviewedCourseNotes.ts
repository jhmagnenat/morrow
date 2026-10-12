import { getGraph, getPassagesForDocument, insertNotion, insertLink, openDb } from "@/lib/db";
import { attachSource, getStudyCards, saveStudyCard, setNotionMetadata, setNotionClair } from "@/lib/qualityDb";
import { verifiesQuote, type Evidence } from "@/lib/contentQuality";

export interface ReviewedNote {originalLabel:string;label:string;definition:string;explanation:string;courseContext:string;evidence:Evidence[];expectedExplanation?:string;create?:boolean;}
export interface ReviewedPlan {notes:ReviewedNote[];exclude:Array<{id:string;expectedExplanation:string}>;groups:Array<{label:string;members:string[]}>;}

// Apply a review against a frozen baseline, atomically. Scheduling is untouched.
export function applyReviewedCourseNotes(plan:ReviewedPlan) {
  const graph=getGraph(true),db=openDb();
  if(db.prepare("SELECT 1 FROM generation_claims WHERE expires_at>? LIMIT 1").get(new Date().toISOString()))throw new Error("Generation is running; wait before applying the review.");
  if(new Set(plan.notes.map(n=>n.originalLabel)).size!==plan.notes.length)throw new Error("Duplicate review entries");
  for(const note of plan.notes){
    const old=graph.notions.find(n=>n.label===note.originalLabel);
    if((!note.create && (!old || old.explanation!==note.expectedExplanation)) || (note.create && old) || old?.userEdited || old?.status==="validated")throw new Error(`Review baseline changed: ${note.originalLabel}`);
    if(!note.definition.trim() || !note.explanation.includes('Do not confuse:') || !note.explanation.includes('In the workflow:') || !note.evidence.length)throw new Error(`Incomplete learning note: ${note.originalLabel}`);
    for(const e of note.evidence){
      const passages=getPassagesForDocument(e.documentId).filter(p=>p.page===e.page);
      if(!graph.documents.some(d=>d.id===e.documentId) || !passages.length || (!e.visualDescription && !verifiesQuote(e.quote,passages.map(p=>p.text).join('\n'))))throw new Error(`Invalid reviewed evidence: ${note.originalLabel}`);
    }
  }
  for(const exclusion of plan.exclude){
    const old=graph.notions.find(n=>n.id===exclusion.id);
    if(!old || old.userEdited || old.status==='validated' || (old.explanation ?? '')!==exclusion.expectedExplanation)throw new Error("Exclusion baseline changed");
  }
  const members=plan.groups.flatMap(g=>g.members);
  if(members.length!==plan.notes.length || new Set(members).size!==members.length || members.some(m=>!plan.notes.some(n=>n.originalLabel===m)))throw new Error("Each reviewed concept needs exactly one navigation branch");
  const ids=new Map<string,string>();
  db.exec('BEGIN IMMEDIATE');
  try {
    for(const note of plan.notes){
      const old=graph.notions.find(n=>n.label===note.originalLabel);
      const id=old?.id ?? insertNotion({label:note.label,domain:'Insurance',status:'draft',definition:note.definition,sources:[]}).id;
      ids.set(note.originalLabel,id);
      db.prepare("UPDATE notions SET label=?,definition=?,explanation=?,course_context=?,grounding='grounded',mapping_visible=1 WHERE id=?").run(note.label,note.definition,note.explanation,note.courseContext,id);
      // Old snapshots retain the previous notes. The visible synthesis now has
      // its own exact references, rather than inheriting wrong old citations.
      db.prepare('DELETE FROM notion_sources WHERE notion_id=?').run(id);
      for(const e of note.evidence)attachSource(id,e.documentId,e.page);
      const first=note.evidence[0];
      setNotionMetadata(id,'course',note.evidence,'reviewed-notes-v6-intuition',[{documentId:first.documentId,page:first.page,explanation:note.explanation,courseContext:note.courseContext,version:'reviewed-notes-v6-intuition'}]);
      // A supplemental lesson derived from the old text is no longer current.
      setNotionClair(id,null);
    }
    const excluded=new Set(plan.exclude.map(n=>n.id));
    for(const id of excluded)db.prepare('UPDATE notions SET mapping_visible=0 WHERE id=?').run(id);
    // Archived material remains in Browse; retain every card ID and review.
    for(const card of getStudyCards())if(!card.userEdited && card.status!=='suspended' && (excluded.has(card.notionId ?? '') || graph.links.some(l=>l.id===card.linkId && (excluded.has(l.source)||excluded.has(l.target)))))saveStudyCard({...card,status:'draft',warnings:[...new Set([...card.warnings,'This source notion is course methodology, not insurance subject matter.'])]});
    // Old connections can resurface when an existing node is reactivated.
    // Preserve IDs/history, but replace unsupported claims and hierarchy types.
    const allowedHierarchy=new Set(['Role of Insurance in the Economy|Insurance and Economic Stability','Role of Insurance in the Economy|Insurance Contributions to Capital Market Development','Insurance Value Chain|Underwriting Function','Insurance Value Chain|Pricing Function in Insurance','Insurance Product Market Share|Life Insurance Market Share','Insurance Company Structure|Actuarial Function in Insurance']);
    for(const link of graph.links){
      const source=graph.notions.find(n=>n.id===link.source),target=graph.notions.find(n=>n.id===link.target);
      if(!source || !target || excluded.has(source.id) || excluded.has(target.id) || link.type==='chapter')continue;
      const hierarchy=allowedHierarchy.has(`${source.label}|${target.label}`);
      const description=hierarchy ? `${target.label} is a specific function, component or application within ${source.label}; see the reviewed notes for its role and limits.` : `Cross-reference between ${source.label} and ${target.label}. This is a thematic connection, not a department hierarchy or a mandatory prerequisite.`;
      db.prepare('UPDATE links SET type=?,description=? WHERE id=?').run(hierarchy?'sub-notion':'related',description,link.id);
      for(const card of getStudyCards().filter(c=>c.linkId===link.id && !c.userEdited && c.status!=='suspended'))saveStudyCard({...card,status:'draft',warnings:[...new Set([...card.warnings,'The relationship was corrected during the course review; the old card needs a source check.'])]});
    }
    const hierarchy=db.prepare("SELECT source_id,target_id FROM links WHERE type='sub-notion'").all();
    for(const group of plan.groups){
      const organizer=insertNotion({label:group.label,domain:'Course overview',status:'draft',definition:`Semantic navigation group: ${group.label}.`,sources:[]});
      setNotionMetadata(organizer.id,'organizer',[]);
      const groupIds=group.members.map(label=>ids.get(label)!);
      for(const id of groupIds)if(!hierarchy.some(l=>l.target_id===id && groupIds.includes(String(l.source_id))))insertLink({source:organizer.id,target:id,type:'chapter',description:`Navigation by subject: ${group.label}`});
    }
    // Two verified corrections to existing cards, with answer revisions kept.
    for(const card of getStudyCards().filter(c=>!c.userEdited && c.status!=='suspended')){
      if(card.notionId===ids.get('Monthly Spending Breakdown for Insurance in Switzerland') && /10,?114/.test(card.answer))saveStudyCard({...card,answer:'The chart shows insurance spending and contributions of 2,335, about 23% of the total budget shown (10,114), using the cited 2020 household data.',status:'draft',warnings:[...new Set([...card.warnings,'Corrected chart denominator; visual-only numerical source requires review.'])],evidence:plan.notes.find(n=>n.originalLabel==='Monthly Spending Breakdown for Insurance in Switzerland')!.evidence});
      if(card.notionId===ids.get('Life Insurance') && card.question==='What is Life Insurance?')saveStudyCard({...card,answer:'Life insurance products address death, longevity, retirement or savings benefits; term life death cover is one example within this broader family.',evidence:plan.notes.find(n=>n.originalLabel==='Life Insurance')!.evidence});
    }
    db.exec('COMMIT');return {reviewed:plan.notes.length,archived:plan.exclude.length,created:plan.notes.filter(n=>n.create).length,branches:plan.groups.length};
  }catch(error){db.exec('ROLLBACK');throw error;}
}
