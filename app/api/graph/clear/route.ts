import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { clearMapping } from "@/lib/db";
import {createRecoveryPoint} from '@/lib/recovery';

async function handlePOST() {
  try {
    createRecoveryPoint('before-clear-mapping');
    clearMapping();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not clear the mapping. Please try again." }, { status: 500 });
  }
}

export const POST = courseRoute(handlePOST);
