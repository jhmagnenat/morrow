import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {isolatedModules} from './isolated-modules.mjs';

const env=await isolatedModules(['sourceDocument','pdf']);
const source=await env.load('sourceDocument');
const db=new DatabaseSync(':memory:');
db.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE documents(id TEXT PRIMARY KEY,page_count INTEGER);
CREATE TABLE passages(document_id TEXT,page INTEGER,ordinal INTEGER,text TEXT,generated INTEGER);
CREATE TABLE page_analysis(document_id TEXT,page INTEGER,payload TEXT);
CREATE TABLE quality_settings(key TEXT PRIMARY KEY,value TEXT);
INSERT INTO documents VALUES('test',2);`);
source.initializeSourceDocuments(db);
const text='  Énergie : x² = 4\n\nλ ≠ 0 ; unité : m·s⁻²  ';
const pages=[{page:1,text},{page:2,text:'Original second page.'}];
const pdfHash=source.originalPdfHash(Buffer.from('original PDF fixture'));
try{
  const stored=source.storeSourceDocument(db,'test',pages,pdfHash);
  assert.equal(source.loadSourceDocument(db,'test').pages[0].text,text,'No normalization, truncation or chunk reassembly');
  assert.equal(source.storeSourceDocument(db,'test',pages,pdfHash).revision,stored.revision,'Deterministic source identity');
  db.exec('BEGIN');
  source.storeSourceDocument(db,'test',[{page:1,text:'changed'},{page:2,text:'changed'}],pdfHash);
  db.exec('ROLLBACK');
  assert.equal(source.loadSourceDocument(db,'test').revision,stored.revision,'Source replacement participates in caller transaction');
  assert.throws(()=>source.storeSourceDocument(db,'test',[{page:2,text:'missing page'}],pdfHash),/consecutive/);
  db.prepare('UPDATE source_pages SET text=? WHERE page=1').run('corrupt');
  assert.throws(()=>source.loadSourceDocument(db,'test'),/changed authoritative source page/);
  source.storeSourceDocument(db,'test',pages,pdfHash);
  db.prepare('INSERT INTO passages VALUES(?,?,?,?,?)').run('test',1,0,'legacy lossy projection',1);
  assert.equal(source.loadSourceDocument(db,'test'),undefined,'Source edits invalidate authoritative snapshot');
  source.storeSourceDocument(db,'test',pages,pdfHash);
  db.exec(`UPDATE passages SET generated=1; INSERT INTO page_analysis VALUES('test',1,'{}');`);
  db.exec(`UPDATE passages SET text='edited' WHERE document_id='test';`);
  assert.equal(db.prepare('SELECT generated FROM passages').get().generated,0,'Edited source must become eligible for regeneration');
  assert.equal(db.prepare('SELECT count(*) AS n FROM page_analysis').get().n,0,'Old coverage must not survive source change');
  const restored=source.ensureSourceDocument(db,'test',Buffer.from('original PDF fixture'));
  assert.equal(restored.origin,'legacy-passages','Migration explicitly labels reconstructed, potentially lossy source');
  assert.throws(()=>source.ensureSourceDocument(db,'test',Buffer.from('replaced PDF')),/changed/);
  const engine=await readFile(new URL('../references/legacy-generation/generationEngine-pre-teacher.ts.txt',import.meta.url),'utf8');
  const sections=await env.load('sourceSections');
  const context=sections.sourceContext([5],Array.from({length:10},(_,i)=>({page:i+1,text:i===4?'Insurance value chain: see page 10.':'Insurance value chain context.'})));
  assert([3,4,5,6,7,10].every(page=>context.some(p=>p.page===page)),'Preserve surrounding explanation and explicit references, not only two lexical matches');
  assert.deepEqual(context.map(p=>p.page),context.map(p=>p.page).toSorted((a,b)=>a-b),'Context follows original document order');
  const quality=await env.load('contentQuality');
  assert(!quality.cardQuality('How does the described mechanism operate?', 'Detailed source-supported explanation. '.repeat(35),'mechanism').includes('Split this card into smaller learning objectives'),'Developed explanations are not rejected solely for exceeding 1,000 characters');
  assert(!/^import(?! type).*['"]@\/lib\/(?:db|qualityDb|llm|srs|documentGeneration)['"]/m.test(engine),'Pure engine has no persistence/provider/orchestration dependency');
  const pdf=await env.load('pdf');
  const content=['BT /F1 12 Tf 40 740 Td (x\\262 = 4; units must be preserved.) Tj ET',
    'BT /F1 12 Tf 40 700 Td (Left definition.) Tj ET\nBT /F1 12 Tf 320 700 Td (Right definition.) Tj ET\nBT /F1 12 Tf 40 680 Td (Left condition.) Tj ET\nBT /F1 12 Tf 320 680 Td (Right condition.) Tj ET'];
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    ...[6,7].map(stream=>`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 5 0 R >> >> /Contents ${stream} 0 R >>`),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    ...content.map(text=>`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`)];
  let document='%PDF-1.4\n';const offsets=[0];
  for(const [index,object] of objects.entries()){offsets.push(Buffer.byteLength(document));document+=`${index+1} 0 obj\n${object}\nendobj\n`;}
  const xref=Buffer.byteLength(document);document+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes=Buffer.from(document),ocr=process.env.MORROW_OCR_BINARY,fetch=globalThis.fetch;
  delete process.env.MORROW_OCR_BINARY;globalThis.fetch=async()=>{throw Error('Network forbidden');};
  try{
    const extracted=await pdf.extractPdfPages(Uint8Array.from(bytes).buffer);
    assert.equal(extracted.length,2);assert(extracted[0].text.includes('x² = 4'));
    assert(extracted[1].layout.requiresVisualReview,'Multi-column reading order cannot be certified as plain text');
    const images=await pdf.renderPdfPagesAsDataUrls(bytes,[1,2]);assert(images.every(i=>i.startsWith('data:image/png;base64,')));
    assert.deepEqual(await pdf.renderPdfPagesAsDataUrls(bytes,[2,1]),images.toReversed(),'Batch image cache preserves requested order');
  }finally{globalThis.fetch=fetch;if(ocr!==undefined)process.env.MORROW_OCR_BINARY=ocr;}
  console.log('PASS: exact scientific source text, hashes, corruption/rollback, source/progress invalidation, honest migration, pure engine boundary, native PDF exponent extraction, multi-column flagging and ordered batch image cache. No model calls or pedagogical score.');
}finally{db.close();}
