import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {LAB,experimentDir,readJson,writeJson,validateGold} from './core.mjs';
import {latestRun,reviewSummary} from './runner.mjs';

export async function startServer({port=4177}={}){
  if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid port');
  let mutations=Promise.resolve();
  const server=http.createServer(async(req,res)=>{
    const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
    try{
      if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host))return json({error:'Invalid host'},403);
      const pathname=new URL(req.url,`http://127.0.0.1:${port}`).pathname;
      if(req.method==='GET'&&pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-src 'self'; object-src 'none'; connect-src 'self'",'Cache-Control':'no-store'});return res.end(await fs.readFile(path.join(import.meta.dirname,'ui.html')));}
      if(req.method==='GET'&&pathname==='/api/experiments'){
        const entries=await fs.readdir(path.join(LAB,'experiments'),{withFileTypes:true}).catch(()=>[]),out=[];
        for(const entry of entries.filter(e=>e.isDirectory())){const manifest=await readJson(path.join(experimentDir(entry.name),'manifest.json'));out.push({id:manifest.id,name:manifest.document.name,createdAt:manifest.createdAt,pages:manifest.document.pages.map(p=>p.page)});}
        return json(out.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));
      }
      const match=pathname.match(/^\/api\/experiments\/([a-z0-9-]+)\/(.+)$/);if(!match)return json({error:'Not found'},404);
      const [,id,action]=match,directory=experimentDir(id),manifest=await readJson(path.join(directory,'manifest.json'));
      if(req.method==='GET'&&(action==='source.pdf'||/^images\/\d+\.png$/.test(action))){
        if(action!=='source.pdf'&&!manifest.document.pages.some(p=>p.page===Number(action.match(/\d+/)[0])))return json({error:'Page is not part of this experiment'},404);
        res.writeHead(200,{'Content-Type':action==='source.pdf'?'application/pdf':'image/png','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(await fs.readFile(path.join(directory,action)));
      }
      if(action==='gold'&&req.method==='GET')return json(await readJson(path.join(directory,'gold.json')));
      if(action==='runs'&&req.method==='GET')return json((await latestRun(directory)).map(({report})=>({id:report.runId,date:report.createdAt,status:report.status,simulated:report.simulated})));
      const runMatch=action.match(/^runs\/([a-f0-9-]{36})\/(blind|reviews|reveal|summary)$/);
      let runDirectory,report,blind,reviews;
      if(runMatch){runDirectory=path.join(directory,'runs',runMatch[1]);report=await readJson(path.join(runDirectory,'results.json'));blind=await readJson(path.join(runDirectory,'blind-private.json'));reviews=await readJson(path.join(runDirectory,'reviews.json'));}
      if(runMatch&&req.method==='GET'){
        if(runMatch[2]==='blind')return json({runId:report.runId,simulated:report.simulated,status:report.status,revealed:reviews.revealed,gold:report.goldSnapshot,cards:blind.map(b=>{const card=report.methods[b.method].cards.find(c=>c.id===b.cardId);return {id:b.blindId,question:card.question,answer:card.answer,sources:card.sources,referenceIssues:card.referenceIssues};}),reviews:reviews.cards,reviewer:reviews.reviewer});
        if(runMatch[2]==='summary'){if(!reviews.revealed)return json({error:'Methods remain blinded until explicit reveal'},403);return json({runId:report.runId,simulated:report.simulated,documentSha256:report.documentSha256,model:report.config.model,sameResolvedModel:report.sameResolvedModel,resolvedModels:report.resolvedModels,preparationMs:manifest.preparationMs,methods:reviewSummary(report,blind,reviews),unblindedReviews:Object.values(reviews.cards).filter(r=>!r.blindAtReview).length});}
      }
      if(req.method!=='POST')return json({error:'Not found'},404);
      if(req.headers.origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(req.headers.origin))return json({error:'Cross-origin changes rejected'},403);
      if(!req.headers['content-type']?.startsWith('application/json'))return json({error:'JSON required'},415);
      const body=await readBody(req);
      const mutate=async()=>{
        if(action==='gold'){
          validateGold(body,manifest);await writeJson(path.join(directory,'gold.json'),{...body,version:1,updatedAt:new Date().toISOString()});return {saved:true};
        }
        if(!runMatch)throw Error('Unknown mutation');
        // Re-read inside the serialized write queue to preserve concurrent reviewers.
        reviews=await readJson(path.join(runDirectory,'reviews.json'));
        if(runMatch[2]==='reveal'){if(body.confirm!==true)throw Error('Explicit reveal confirmation required');reviews.revealed=true;reviews.revealedAt??=new Date().toISOString();}
        else if(runMatch[2]==='reviews'){
          if(!blind.some(b=>b.blindId===body.cardId))throw Error('Unknown blind card');
          if(typeof body.reviewer!=='string'||!body.reviewer.trim()||body.reviewer.length>100)throw Error('Reviewer name required');
          for(const key of ['relevance','accuracy','usability'])if(!Number.isInteger(body[key])||body[key]<1||body[key]>5)throw Error('Each score must be between 1 and 5');
          if(typeof body.criticalError!=='boolean'||typeof body.comment!=='string'||body.comment.length>5000||!Array.isArray(body.coveredKnowledge)||body.coveredKnowledge.some(k=>!report.goldSnapshot.items.some(i=>i.id===k)))throw Error('Invalid critical-error or coverage annotation');
          const review={relevance:body.relevance,accuracy:body.accuracy,usability:body.usability,criticalError:body.criticalError,comment:body.comment,coveredKnowledge:[...new Set(body.coveredKnowledge)],at:new Date().toISOString(),blindAtReview:!reviews.revealed,reviewer:body.reviewer};
          await fs.appendFile(path.join(runDirectory,'review-history.jsonl'),JSON.stringify({cardId:body.cardId,previous:reviews.cards[body.cardId]??null,next:review})+'\n');
          reviews.reviewer=body.reviewer;reviews.cards[body.cardId]=review;
        }else throw Error('Unknown mutation');
        await writeJson(path.join(runDirectory,'reviews.json'),reviews);return {saved:true};
      };
      const work=mutations.then(mutate);mutations=work.catch(()=>{});return json(await work);
    }catch(error){return json({error:error.code==='ENOENT'?'Not found':error.message},error.code==='ENOENT'?404:400);}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  console.log(`Benchmark lab: http://127.0.0.1:${port} — evaluation only, no paid launch endpoint.`);return server;
}
async function readBody(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>1024*1024)throw Error('Request too large');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
