import { courseRoute } from "@/lib/courseScope";
import { getStudyCards } from "@/lib/qualityDb";
import { getGraph } from "@/lib/db";

async function handleGET(request:Request){
  const id=new URL(request.url).searchParams.get("notionId");
  if(!id)return Response.json({error:"Specify a notion"},{status:400});
  const graph=getGraph();
  if(!graph.notions.some(n=>n.id===id))return Response.json({error:"Notion not found"},{status:404});
  const linked=new Set(graph.links.filter(l=>l.source===id || l.target===id).map(l=>l.id));
  return Response.json({cards:getStudyCards().filter(c=>c.notionId===id || (c.linkId && linked.has(c.linkId))) });
}
export const GET=courseRoute(handleGET);
