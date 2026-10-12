import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
// Human-authored demonstration in a new temporary workspace; no model calls.
const env=await isolatedModules(DATABASE_MODULES);
process.chdir(env.workspace);
const db=await env.load('db'),q=await env.load('qualityDb'),pdf=await env.load('pdfStorage');
const source=await env.load('sourceDocument'),teaching=await env.load('teachingStorage'),review=await env.load('contentReview');
const text='Rectangle\nArea and perimeter\nWidth and height\nUnit squares\nCompare surface coverage and boundary length\nWorked example: a rectangle 3 units wide and 4 units high';
const doc=db.insertDocument({title:'Disposable teacher-course preview',kind:'course',filename:'teacher-preview.pdf',pageCount:1});
db.insertPassages([{documentId:doc.id,page:1,ordinal:0,text}]);
const stream='BT /F1 14 Tf 40 760 Td '+text.split('\n').map((line,index)=>(index?'0 -32 Td ':'')+`(${line}) Tj`).join(' ')+' ET';
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
let bytes='%PDF-1.4\n';const offsets=[0];
objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(bytes));bytes+=`${i+1} 0 obj\n${o}\nendobj\n`;});
const xref=Buffer.byteLength(bytes);bytes+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
const buffer=Buffer.from(bytes);pdf.savePdfFile(doc.id,Uint8Array.from(buffer).buffer);
const original=source.storeSourceDocument(db.openDb(),doc.id,[{page:1,text}],source.originalPdfHash(buffer));
const claims=[
  {id:'area',statement:'For a rectangle, area equals width times height. Both lengths use the same unit; the result uses square units. Width counts unit squares per row and height counts the rows.',origin:'background',sourceIds:['p1s0'],uncertainty:''},
  {id:'perimeter',statement:'Perimeter measures boundary length, whereas area measures surface coverage. A rectangle has perimeter 2 times the sum of width and height, in length units.',origin:'background',sourceIds:['p1s0'],uncertainty:''},
  {id:'example',statement:'For a hypothetical rectangle 3 metres wide and 4 metres high, area is 12 square metres. Its perimeter is 14 metres.',origin:'illustration',sourceIds:['p1s0'],uncertainty:''},
];
const lesson={id:'teacher-course-v1:disposable-preview',version:'teacher-course-v1',documentId:doc.id,title:doc.title,pages:[1],sourceRevision:original.revision,units:[{id:'rectangle',title:'Understand area before memorising the formula',explanation:claims.map(c=>c.statement).join('\n\n'),claims}],unresolved:[{statement:'Which of these concepts will the lecturer test in the examination?',reason:'The incomplete slides do not establish the examination scope.'}],reviewer:'Human-authored demonstration, not a live model evaluation',reviewedAt:new Date().toISOString()};
teaching.saveTeachingLesson(lesson);
const notion=db.insertNotion({label:'Rectangle area and perimeter',domain:'Geometry',status:'draft',definition:claims[0].statement,explanation:lesson.units[0].explanation,sources:[{documentId:doc.id,page:1}]});
const evidence=[{documentId:doc.id,page:1,quote:text}];q.setNotionMetadata(notion.id,'course',evidence,'direct-cards-v9-teacher-course',[]);
const drafts=[
  {id:'preview-understanding',question:'Why does multiplying width by height give the area of a rectangle?',answer:'Width counts unit squares in each row and height counts the rows; their product counts all unit squares.',kind:'mechanism',claimIds:['area']},
  {id:'preview-distinction',question:'What is the difference between area and perimeter?',answer:'Area measures surface coverage in square units; perimeter measures boundary length in length units.',kind:'comparison',claimIds:['perimeter']},
  {id:'preview-application',question:'A rectangle is 3 metres wide and 4 metres high. What is its area?',answer:'12 square metres.',kind:'application',claimIds:['area','example']},
];
for(const draft of drafts){const relevant=claims.filter(c=>draft.claimIds.includes(c.id)),origins=new Set(relevant.map(c=>c.origin));const card={...draft,notionId:notion.id,cardType:'notion',objective:draft.question,example:'',explanation:'',status:'ready',evidence,warnings:[],userEdited:false,model:'demonstration',promptVersion:'direct-cards-v9-teacher-course',teaching:{lessonId:lesson.id,lessonHash:teaching.teachingLessonHash(lesson),claimIds:draft.claimIds,origin:origins.size===1?[...origins][0]:'mixed',claims:relevant,reviewer:lesson.reviewer,reviewedAt:lesson.reviewedAt}};card.accuracyReview=review.createCardReview(card,new Map([[`${doc.id}:1`,text]]),new Map([[doc.id,original.revision]]));q.saveStudyCard(card);}
const dataDir=path.join(env.workspace,'data');await writeFile(path.join(env.root,'.next','teacher-preview.json'),JSON.stringify({dataDir,documentId:doc.id},null,2));
for(const connection of globalThis.__courseDbs?.values()??[])connection.close();
console.log(JSON.stringify({dataDir,fixture:'Disposable teacher-course preview',modelCalls:0}));
