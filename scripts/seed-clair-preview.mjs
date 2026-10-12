import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
// Explicit disposable browser fixture. Never opens the user's data directory.
const env=await isolatedModules(DATABASE_MODULES);
process.chdir(env.workspace);
const db=await env.load('db'), quality=await env.load('qualityDb'), storage=await env.load('pdfStorage'), {clairFromLesson}=await env.load('clair');
const source='A rectangle has area equal to width multiplied by height. Holding height fixed, doubling width doubles area. For width 3 and height 4, area is 12 square units. Perimeter measures boundary length, not area.';
const doc=db.insertDocument({title:'Geometry preview',kind:'course',filename:'geometry-preview.pdf',pageCount:1});
db.insertPassages([{documentId:doc.id,page:1,ordinal:0,text:source}]);
const evidence=[{documentId:doc.id,page:1,quote:source}];
const notion=db.insertNotion({label:'Rectangle area',domain:'Geometry',status:'draft',definition:'Area measures the surface covered in square units.',explanation:'Count squares in each row, then multiply by the number of rows.',sources:[{documentId:doc.id,page:1}]});
const other=db.insertNotion({label:'Perimeter',domain:'Geometry',status:'draft',definition:'Perimeter measures boundary length.',sources:[{documentId:doc.id,page:1}]});
quality.setNotionMetadata(notion.id,'course',evidence);quality.setNotionMetadata(other.id,'course',evidence);
const relation=db.insertLink({source:notion.id,target:other.id,type:'related',description:'Area measures surface; perimeter measures boundary length.'});quality.setLinkEvidence(relation.id,evidence);
quality.setNotionClair(notion.id,clairFromLesson(notion.label,{intuition:'How much surface does a rectangle cover?',goalAnswer:'Width counts squares per row and height counts rows, so their product counts all squares.',analogy:{model:'',mapping:'',limit:''},mechanism:['Count the unit squares in one row.','Multiply by the number of rows.'],experiment:{setup:'Hypothetically, a rectangle is 3 units wide and 4 units high.',rule:'Area equals width times height. Double width while height remains 4.',question:'What is the new area and why?',answer:'24 square units.',why:'6 × 4 = 24; twice as many columns means twice as many squares.'},technical:'A = width × height for a rectangle; area has squared length units.'},evidence,[{notionId:other.id,label:other.label,type:'related',direction:'outgoing',explanation:relation.description,evidence}]));
quality.saveStudyCard({id:'preview-mechanism',cardType:'notion',notionId:notion.id,question:'How do width and height determine rectangle area?',answer:'Width counts squares per row and height counts rows; their product counts all squares.',example:'',kind:'mechanism',status:'ready',evidence,objective:'Mechanism of rectangle area',warnings:[],userEdited:false,model:'fixture',promptVersion:'fixture'});
db.recordMasterySignal(notion.id,'interview',0.2,'mechanism');
quality.setNotionClair(notion.id,{...db.getNotionById(notion.id).clair,depth:'overview'});
// A small valid PDF supplies a real source link for the browser check.
const stream='BT /F1 12 Tf 40 760 Td (Rectangle area = width times height.) Tj ET';
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
let pdf='%PDF-1.4\n', offsets=[0];objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;});const start=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
const bytes=new TextEncoder().encode(pdf);storage.savePdfFile(doc.id,bytes.buffer);
const result={dataDirectory:process.env.MORROW_DATA_DIR,notionId:notion.id,documentId:doc.id};
await writeFile(path.join(env.root,'.next/clair-preview.json'),JSON.stringify(result,null,2));
for(const connection of globalThis.__courseDbs?.values()??[])connection.close();
console.log('Disposable C.L.A.I.R. preview configured in .next/clair-preview.json');
