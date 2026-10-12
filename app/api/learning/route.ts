import { courseRoute } from '@/lib/courseScope';
import { getGraph, getMasteryMap } from '@/lib/db';
import { learningPath } from '@/lib/learningPath';
async function handleGET() {
  const graph = getGraph();
  return Response.json(learningPath(graph.notions, graph.links, getMasteryMap()), {headers: {'Cache-Control': 'no-store'}});
}
export const GET = courseRoute(handleGET);
