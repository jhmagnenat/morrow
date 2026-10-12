import { studyCardKey } from "@/lib/studySession";
import { scopedCourseId } from "@/lib/courseScope";
import {withRequestCourse} from '@/lib/requestCourse';
import { getReviewSettings } from "@/lib/qualityDb";
import { getDueLinks, getDuePronunciationCards, getDueVocabularyCards,getMasteryMap } from "@/lib/db";
import {getLearningGraph} from '@/lib/learningCurriculum';
import { getDueDrillCards } from "@/lib/drill";
import { isLlmConfigured } from "@/lib/llm";
import { interleaveTodayQueue } from "@/lib/today";
import StudyClient from "@/components/StudyClient";
import { learningPath } from '@/lib/learningPath';
import {getTeachingLessons} from '@/lib/teachingStorage';

export const dynamic = "force-dynamic";

async function renderStudyPage() {
  const sessionLimit=getReviewSettings().sessionLimit;
  const { notions, links,learningOrder } = getLearningGraph();
  const initialCards = await getDueDrillCards(sessionLimit);
  const initialNotionCards = await getDueDrillCards(sessionLimit,'notions');
  const initialLinkCards = getDueLinks(sessionLimit);
  const initialPronunciationCards = getDuePronunciationCards(sessionLimit);
  const initialVocabularyCards = getDueVocabularyCards(sessionLimit);
  const initialTodayCards = interleaveTodayQueue(
    initialCards,
    initialLinkCards,
    initialPronunciationCards,
    initialVocabularyCards
  );

  return (
    <StudyClient
      key={scopedCourseId()}
      courseId={scopedCourseId()}
      initialLessons={getTeachingLessons()}
      validCardKeys={[...initialCards,...initialNotionCards,...initialLinkCards,...initialPronunciationCards,...initialVocabularyCards].map(studyCardKey).filter((key):key is string=>key!==null)}
      initialCards={initialCards}
      initialNotionCards={initialNotionCards}
      initialLinkCards={initialLinkCards}
      initialPronunciationCards={initialPronunciationCards}
      initialVocabularyCards={initialVocabularyCards}
      initialTodayCards={initialTodayCards.slice(0,sessionLimit)}
      allNotions={[...learningPath(notions, links,getMasteryMap(),learningOrder).topics.map(t => t.notion), ...notions.filter(n => n.layer === 'organizer')]}
      llmConfigured={isLlmConfigured()}
    />
  );
}

export default function StudyPage(){return withRequestCourse(renderStudyPage);}
