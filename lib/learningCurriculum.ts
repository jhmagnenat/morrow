import {getGraph,openDb} from '@/lib/db';

export function getLearningCurriculum(){
  const row=openDb().prepare("SELECT value FROM quality_settings WHERE key='course-learning-curriculum'").get();
  const empty={archivedIds:[] as string[],archivedLinkIds:[] as string[],learningOrder:[] as string[]};
  if(!row)return empty;
  try{
    const value=JSON.parse(String(row.value));
    const ids=(key:string):string[]=>Array.isArray(value?.[key])?[...new Set(value[key].filter((id:unknown):id is string=>typeof id==='string'))] as string[]:[];
    return {archivedIds:ids('archivedIds'),archivedLinkIds:ids('archivedLinkIds'),learningOrder:ids('learningOrder')};
  }catch{return empty;}
}

// Learning archives are distinct from clearing the visual map. Browse and
// backups retain every original node, card and link, including its history.
export function getLearningGraph(){
  const graph=getGraph(),curriculum=getLearningCurriculum();
  const archived=new Set(curriculum.archivedIds),archivedLinks=new Set(curriculum.archivedLinkIds);
  const notions=graph.notions.filter(n=>!archived.has(n.id)),ids=new Set(notions.map(n=>n.id));
  return {...graph,notions,links:graph.links.filter(l=>!archivedLinks.has(l.id)&&ids.has(l.source)&&ids.has(l.target)),learningOrder:curriculum.learningOrder.filter(id=>ids.has(id))};
}
