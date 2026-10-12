import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { type Snapshot } from "@/lib/db";
import { restoreWithPdfs } from "@/lib/backup";
import {importAnkiPackage} from '@/lib/ankiImport';

function isValidSnapshot(v: unknown): v is Snapshot {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    s.version === 1 &&
    Array.isArray(s.notions) &&
    Array.isArray(s.links) &&
    (s.mappingHiddenNotionIds === undefined ||
      (Array.isArray(s.mappingHiddenNotionIds) && s.mappingHiddenNotionIds.every((id) => typeof id === "string"))) &&
    Array.isArray(s.documents) &&
    Array.isArray(s.reviewState) &&
    Array.isArray(s.explainAttempts)
  );
}

async function handlePOST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if(file.size>256*1024*1024)return NextResponse.json({error:'Import exceeds 256 MiB'},{status:413});
  if(file.name.toLowerCase().endsWith('.apkg')){
    try{return NextResponse.json({ok:true,...importAnkiPackage(Buffer.from(await file.arrayBuffer()),file.name,{progress:formData.get('progress')==='true'})});}
    catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Anki import failed; current data preserved'},{status:400});}
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return NextResponse.json({ error: "That file isn't valid JSON." }, { status: 400 });
  }

  if (!isValidSnapshot(parsed)) {
    return NextResponse.json(
      { error: "That doesn't look like an encyclopedia export (missing or wrong-shaped fields)." },
      { status: 400 }
    );
  }

  try {restoreWithPdfs(parsed);} catch(error) {return NextResponse.json({error:error instanceof Error ? error.message : "Restore failed; current data preserved"},{status:400});}
  return NextResponse.json({
    ok: true,
    notions: parsed.notions.length,
    links: parsed.links.length,
    documents: parsed.documents.length,
  });
}

export const POST = courseRoute(handlePOST);
