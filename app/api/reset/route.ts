import { courseRoute } from "@/lib/courseScope";
import { NextResponse } from "next/server";
import { resetAllData } from "@/lib/db";
import { deleteAllPdfFiles } from "@/lib/pdfStorage";
import {createRecoveryPoint} from '@/lib/recovery';

async function handlePOST() {
  createRecoveryPoint('before-reset');
  resetAllData();
  deleteAllPdfFiles();
  return NextResponse.json({ ok: true });
}

export const POST = courseRoute(handlePOST);
