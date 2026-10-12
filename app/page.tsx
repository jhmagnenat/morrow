import {scopedCourseId} from '@/lib/courseScope';
import {withRequestCourse} from '@/lib/requestCourse';
import { getGraph, getMasteryMap, listDocumentsWithStats } from "@/lib/db";
import { currentProviderLabel, isLlmConfigured } from "@/lib/llm";
import HomeClient from "@/components/HomeClient";

// This page reads the SQLite DB directly; it must never be statically
// prerendered or new documents/notions added at runtime wouldn't show up
// without a full rebuild.
export const dynamic = "force-dynamic";

function Home() {
  const graph = getGraph(true);
  const documents = listDocumentsWithStats();
  const mastery = getMasteryMap();

  return (
    <HomeClient
      courseId={scopedCourseId()}
      initialNotions={graph.notions}
      initialLinks={graph.links}
      initialDocuments={documents}
      initialMastery={mastery}
      llmConfigured={isLlmConfigured()}
      providerLabel={currentProviderLabel()}
    />
  );
}
export default function HomePage(){return withRequestCourse(Home);}
