import {NextResponse} from 'next/server';
import {courseRoute} from '@/lib/courseScope';
import {schedulerDiagnostics,optimizeScheduler} from '@/lib/schedulerMaintenance';
export const GET=courseRoute(async()=>NextResponse.json(schedulerDiagnostics()));
export const POST=courseRoute(async()=>NextResponse.json({result:await optimizeScheduler(true),...schedulerDiagnostics()}));
