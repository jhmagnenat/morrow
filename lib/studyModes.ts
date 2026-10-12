import type {DueCard} from '@/components/StudyClient';
// A second presentation of an existing definition, never a second card or
// schedule. Imported templates and mechanism/application questions stay Q&A.
export function notionRecallCards(cards:DueCard[]){
  return cards.filter(card=>card.card.kind==='definition'&&!card.card.presentation&&card.notion.domain!=='Archived');
}
