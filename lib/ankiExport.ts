import { reliabilityReport, type ReliabilityInput } from '@/lib/reliabilityReport';
import {teachingOriginLabel} from '@/lib/teachingCourse';

function html(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\r\n?|\n/g, '<br>').replace(/\t/g, '    ');
}
function field(value: string) { return `"${value.replace(/"/g, '""')}"`; }

export function ankiExport(input: ReliabilityInput) {
  const report = reliabilityReport(input);
  const approved = new Set(report.cards.filter(c => c.status === 'ready' && !c.issues.length && !c.warnings.length).map(c => c.id));
  const titles = new Map(input.documents.map(d => [d.id, d.title]));
  const lines = ['#separator:Tab', '#html:true', '#tags:encyclopedia', '#tags column:5', '#columns:ID\tFront\tBack\tSources\tTags'];
  for (const card of input.cards.filter(c => approved.has(c.id))) {
    const sources = (card.teaching?`${html(teachingOriginLabel(card.teaching.origin))}<br>${card.teaching.claims.map(c=>html(c.statement)).join('<br>')}<br><br>Slide anchors:<br>`:'')+card.evidence.map(e => `${html(titles.get(e.documentId) ?? e.documentId)} — page ${e.page}<br>${html(e.quote || e.visualDescription || '')}`).join('<br><br>');
    const back = html(card.answer) + (card.explanation ? `<br><br>Explanation: ${html(card.explanation)}` : '') + (card.example ? `<br><br>Example: ${html(card.example)}` : '');
    lines.push([card.id, html(card.question), back, sources, `encyclopedia::${card.kind}${card.teaching?` encyclopedia::${card.teaching.origin}`:''}`].map(field).join('\t'));
  }
  return {text: `${lines.join('\n')}\n`, exported: approved.size, excluded: input.cards.length - approved.size};
}
