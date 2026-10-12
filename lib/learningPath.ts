import type { Link, Notion } from '@/lib/types';
import type { MasteryInfo } from '@/lib/mastery';

export function learningPath(notions: Notion[], links: Link[], mastery: Record<string, MasteryInfo> = {}, learningOrder:string[] = []) {
  const topics = notions.filter(n => n.layer !== 'organizer');
  const byId = new Map(topics.map(n => [n.id, n]));
  const prerequisites = new Map(topics.map(n => [n.id, [...new Set(links.filter(l => l.type === 'prerequisite' && l.target === n.id && byId.has(l.source) && l.source !== n.id).map(l => l.source))]]));
  const pending = new Set(topics.map(n => n.id)), ordered: string[] = [], cycles: string[] = [];
  const difficulty=(id:string)=>mastery[id]?.score??.55;
  const position=new Map(learningOrder.map((id,index)=>[id,index]));
  while (pending.size) {
    let next = topics.filter(n => pending.has(n.id) && prerequisites.get(n.id)!.every(id => !pending.has(id)));
    if (!next.length) {
      cycles.push(...pending);
      // Keep cyclic/disconnected material accessible without asserting a
      // fabricated prerequisite order for it.
      next = topics.filter(n => pending.has(n.id));
    }
    next.sort((a, b) => Number(b.clair?.importance === 'foundation') - Number(a.clair?.importance === 'foundation') || difficulty(a.id)-difficulty(b.id) || (position.get(a.id)??Number.MAX_SAFE_INTEGER)-(position.get(b.id)??Number.MAX_SAFE_INTEGER) || a.label.localeCompare(b.label));
    for (const notion of next) {ordered.push(notion.id); pending.delete(notion.id);}
  }
  return {
    topics: ordered.map(id => ({notion: byId.get(id)!, prerequisiteIds: prerequisites.get(id)!, suggestedPreparation: prerequisites.get(id)!.filter(p => (mastery[p]?.dimensions?.mechanism.score ?? 0) < 0.55), mastery: mastery[id]})),
    cycles: [...new Set(cycles)],
  };
}
