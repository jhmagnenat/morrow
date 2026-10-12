import assert from 'node:assert/strict';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const env=await isolatedModules(DATABASE_MODULES);process.chdir(env.workspace);
const auth=await env.load('auth'),identity=await env.load('identityScope'),courses=await env.load('courses'),scope=await env.load('courseScope'),db=await env.load('db'),pdf=await env.load('pdfStorage');
try{
  const existing=db.insertNotion({label:'Existing owner work',domain:'Private',definition:'This must remain in the original workspace.',sources:[],status:'draft'});
  const owner=await auth.provisionUser('owner','Owner password with fourteen characters',true);
  const guest=await auth.provisionUser('second-user','Second password with fourteen characters');
  const ownerLogin=await auth.login(owner.name,'Owner password with fourteen characters'),guestLogin=await auth.login(guest.name,'Second password with fourteen characters');
  assert.equal(auth.sessionUser(ownerLogin.token).id,owner.id);assert.equal(auth.sessionUser(guestLogin.token).id,guest.id);
  let guestCourse;
  await identity.withUser(guest,async()=>{
    guestCourse=courses.listCourses()[0];assert.notEqual(guestCourse.id,'default');
    assert.equal(db.getGraph().notions.length,0,'Another account cannot inherit owner content');
    db.insertNotion({label:'Guest-only work',domain:'Private',definition:'This belongs to the second account.',sources:[],status:'draft'});
    // Same internal ID still resolves to a different SQLite connection/path.
    scope.withCourse('default',()=>assert.equal(db.getGraph().notions.length,0));
    pdf.savePdfFile('same-document',new TextEncoder().encode('%PDF-guest').buffer);
  });
  identity.withUser(owner,()=>{
    assert.equal(db.getGraph().notions[0].id,existing.id);assert.equal(pdf.readPdfFile('same-document'),null);
    scope.withCourse(guestCourse.id,()=>assert.equal(db.getGraph().notions.length,0,'Knowing a foreign course ID cannot open its database'));
  });
  process.env.MORROW_AUTH='required';
  const graph=scope.courseRoute(async()=>Response.json(db.getGraph()));
  assert.equal((await graph(new Request('http://localhost/api/graph'))).status,401);
  const request=(token,course)=>new Request('http://localhost/api/graph',{headers:{Cookie:`morrow-session=${token}`,...(course?{'X-Course-Id':course}:{})}});
  assert.equal((await graph(request(guestLogin.token,'default'))).status,409);
  assert.equal((await graph(request(ownerLogin.token,guestCourse.id))).status,409);
  assert.equal((await(await graph(request(guestLogin.token,guestCourse.id))).json()).notions[0].label,'Guest-only work');
  assert.equal((await(await graph(request(ownerLogin.token,'default'))).json()).notions[0].label,'Existing owner work');
  await assert.rejects(()=>auth.login('second-user','wrong password'),/Invalid account/);
  auth.logout(guestLogin.token);assert.equal((await graph(request(guestLogin.token,guestCourse.id))).status,401);
  console.log('PASS: salted password verification, hashed revocable sessions, owner preservation, isolated registries/SQLite/PDFs, foreign-ID rejection and anonymous denial. No model calls.');
}finally{delete process.env.MORROW_AUTH;for(const conn of globalThis.__courseDbs?.values()??[])conn.close();for(const conn of globalThis.__authDbs?.values()??[])conn.close();process.chdir(env.root);}
