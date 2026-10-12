import {createHash} from 'node:crypto';
import type {DatabaseSync} from 'node:sqlite';
import type {ExtractedPage} from '@/lib/pdf';
import type {PdfPageLayout} from '@/lib/pdfLayout';

export const SOURCE_FORMAT_VERSION='source-document-v1';
export interface SourceDocument {documentId:string;revision:string;pdfSha256:string|null;origin:'pdf'|'legacy-passages';pages:Array<{page:number;text:string;layout?:PdfPageLayout}>;}
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const originalPdfHash=(pdf:Buffer|null)=>pdf?createHash('sha256').update(pdf).digest('hex'):null;
export function initializeSourceDocuments(db:DatabaseSync){
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_documents(document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,revision TEXT NOT NULL,pdf_sha256 TEXT,origin TEXT NOT NULL,format_version TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS source_pages(document_id TEXT NOT NULL REFERENCES source_documents(document_id) ON DELETE CASCADE,page INTEGER NOT NULL CHECK(page>0),text TEXT NOT NULL,layout TEXT,sha256 TEXT NOT NULL,PRIMARY KEY(document_id,page));
    CREATE TRIGGER IF NOT EXISTS invalidate_projection_after_source_delete AFTER DELETE ON source_documents BEGIN
      UPDATE passages SET generated=0 WHERE document_id=OLD.document_id;
      DELETE FROM page_analysis WHERE document_id=OLD.document_id;
    END;
    CREATE TRIGGER IF NOT EXISTS invalidate_source_after_passage_insert AFTER INSERT ON passages BEGIN DELETE FROM source_documents WHERE document_id=NEW.document_id; END;
    CREATE TRIGGER IF NOT EXISTS invalidate_source_after_passage_update AFTER UPDATE OF text,page,ordinal,document_id ON passages BEGIN DELETE FROM source_documents WHERE document_id=OLD.document_id OR document_id=NEW.document_id; END;
    CREATE TRIGGER IF NOT EXISTS invalidate_source_after_passage_delete AFTER DELETE ON passages BEGIN DELETE FROM source_documents WHERE document_id=OLD.document_id; END;
    CREATE TRIGGER IF NOT EXISTS invalidate_source_after_layout_update AFTER UPDATE OF value ON quality_settings WHEN NEW.key LIKE 'pdf-layout:%' AND OLD.value IS NOT NEW.value BEGIN DELETE FROM source_documents WHERE document_id=substr(NEW.key,12); END;
    CREATE TRIGGER IF NOT EXISTS invalidate_source_after_layout_delete AFTER DELETE ON quality_settings WHEN OLD.key LIKE 'pdf-layout:%' BEGIN DELETE FROM source_documents WHERE document_id=substr(OLD.key,12); END;
  `);
}
export function storeSourceDocument(db:DatabaseSync,documentId:string,pages:ExtractedPage[],pdfSha256:string|null,origin:SourceDocument['origin']='pdf'):SourceDocument {
  if(!pages.length||pages.some((p,i)=>p.page!==i+1||typeof p.text!=='string'))throw Error('Source pages must preserve complete, consecutive original pages');
  if(pdfSha256!==null&&!/^[a-f0-9]{64}$/.test(pdfSha256))throw Error('Invalid original PDF identity');
  const body={documentId,pdfSha256,origin,pages:pages.map(p=>({page:p.page,text:p.text,...(p.layout?{layout:p.layout}:{})}))};
  const revision=hash({format:SOURCE_FORMAT_VERSION,...body});
  const owned=!db.isTransaction;if(owned)db.exec('BEGIN IMMEDIATE');
  try{
    db.prepare('DELETE FROM source_documents WHERE document_id=?').run(documentId);
    db.prepare('INSERT INTO source_documents VALUES(?,?,?,?,?)').run(documentId,revision,pdfSha256,origin,SOURCE_FORMAT_VERSION);
    const insert=db.prepare('INSERT INTO source_pages VALUES(?,?,?,?,?)');
    for(const page of body.pages)insert.run(documentId,page.page,page.text,page.layout?JSON.stringify(page.layout):null,hash(page));
    if(owned)db.exec('COMMIT');return {...body,revision};
  }catch(error){if(owned&&db.isTransaction)db.exec('ROLLBACK');throw error;}
}
export function loadSourceDocument(db:DatabaseSync,documentId:string):SourceDocument|undefined {
  const row=db.prepare('SELECT * FROM source_documents WHERE document_id=?').get(documentId);if(!row)return;
  const pages=db.prepare('SELECT * FROM source_pages WHERE document_id=? ORDER BY page').all(documentId).map(p=>{
    const page={page:Number(p.page),text:String(p.text),...(p.layout?{layout:JSON.parse(String(p.layout)) as PdfPageLayout}:{})};
    if(p.sha256!==hash(page))throw Error('Invalid or changed authoritative source page');return page;
  });
  const body={documentId,pdfSha256:row.pdf_sha256?String(row.pdf_sha256):null,origin:row.origin as SourceDocument['origin'],pages};
  if(row.format_version!==SOURCE_FORMAT_VERSION||!pages.length||pages.some((p,i)=>p.page!==i+1)||hash({format:SOURCE_FORMAT_VERSION,...body})!==row.revision)throw Error('Invalid or changed authoritative source document');
  return {...body,revision:String(row.revision)};
}
export function ensureSourceDocument(db:DatabaseSync,documentId:string,pdf:Buffer|null):SourceDocument {
  const stored=loadSourceDocument(db,documentId);
  if(stored){if(stored.pdfSha256!==originalPdfHash(pdf))throw Error('Original PDF changed; re-extract the source before generating');return stored;}
  const document=db.prepare('SELECT page_count FROM documents WHERE id=?').get(documentId);if(!document)throw Error('Document not found in this course');
  const text=new Map<number,string>();
  for(const p of db.prepare('SELECT page,text FROM passages WHERE document_id=? ORDER BY page,ordinal').all(documentId))text.set(Number(p.page),[text.get(Number(p.page)),String(p.text)].filter(Boolean).join('\n'));
  const record=db.prepare('SELECT value FROM quality_settings WHERE key=?').get(`pdf-layout:${documentId}`);
  const layouts=record?JSON.parse(String(record.value)) as Array<{page:number;layout?:PdfPageLayout}>:[];
  const count=Number(document.page_count)||Math.max(0,...text.keys());
  return storeSourceDocument(db,documentId,Array.from({length:count},(_,i)=>({page:i+1,text:text.get(i+1)??'',layout:layouts.find(l=>l.page===i+1)?.layout})),originalPdfHash(pdf),'legacy-passages');
}
