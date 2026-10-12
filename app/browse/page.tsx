import Link from "next/link";
import { getAllCardsForBrowse } from "@/lib/db";
import BrowseClient from "@/components/BrowseClient";
import {scopedCourseId} from '@/lib/courseScope';
import {withRequestCourse} from '@/lib/requestCourse';

export const dynamic = "force-dynamic";

function BrowsePage() {
  const cards = getAllCardsForBrowse();

  return (
    <div className="min-h-full bg-[#1a1a1b]">
      <header className="flex items-center gap-4 border-b border-[#423e42] bg-[#201f21] px-5 py-3">
        <Link href="/" className="text-xs text-[#696A61] hover:text-[#8F8978]">
          ← Back to graph
        </Link>
        <Link href="/study" className="text-xs text-[#696A61] hover:text-[#8F8978]">
          Study →
        </Link>
        <Link href="/progress" className="text-xs text-[#696A61] hover:text-[#8F8978]">
          Progress →
        </Link>
        <h1 className="ml-auto font-display text-lg font-medium tracking-wide text-accent-200">Browse</h1>
      </header>
      <BrowseClient courseId={scopedCourseId()} initialCards={cards} />
    </div>
  );
}
export default function Browse(){return withRequestCourse(BrowsePage);}
