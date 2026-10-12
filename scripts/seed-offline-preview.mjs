import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {isolatedModules,DATABASE_MODULES} from './isolated-modules.mjs';
const env=await isolatedModules(DATABASE_MODULES);process.chdir(env.workspace);
const db=await env.load('db'),quality=await env.load('qualityDb');
const doc=db.insertDocument({title:'Disposable offline integration fixture',kind:'course',pageCount:1});
const quote='Area equals width times height; doubling width doubles the area when height is held constant.';
db.insertPassages([{documentId:doc.id,page:1,ordinal:0,text:quote}]);
const notions=[];
for(let index=1;index<=4;index++){
  const n=db.insertNotion({label:`Offline rectangle ${index}`,domain:'Geometry',definition:quote,status:'draft',sources:[{documentId:doc.id,page:1}]});
  notions.push(n);
  quality.saveStudyCard({id:`offline-card-${index}`,cardType:'notion',notionId:n.id,question:index===1?'What is the area of a rectangle?':`For rectangle ${index}, how does doubling width change the area?`,answer:index===1?'Area equals width multiplied by height.':'Area doubles because each row contains twice as many unit squares.',example:'',kind:index===1?'definition':'mechanism',objective:`Rectangle ${index} area dependency`,status:'ready',evidence:[{documentId:doc.id,page:1,quote}],warnings:[],userEdited:true,model:'fixture',promptVersion:'fixture'});
}
for(let index=1;index<=3;index++){
  const link=db.insertLink({source:notions[index-1].id,target:notions[index].id,type:'related',description:'Both rectangles use the same width times height area rule.'});
  quality.saveStudyCard({id:`offline-link-${index}`,cardType:'link',linkId:link.id,question:'What area rule connects these rectangles?',answer:link.description,example:'',kind:'comparison',objective:`Area connection ${index}`,status:'ready',evidence:[{documentId:doc.id,page:1,quote}],warnings:[],userEdited:true,model:'fixture',promptVersion:'fixture'});
}
await writeFile(path.join(env.root,'.next/offline-preview.json'),JSON.stringify({dataDirectory:process.env.MORROW_DATA_DIR},null,2));
for(const connection of globalThis.__courseDbs?.values()??[])connection.close();
console.log('Disposable offline course ready. Configuration: .next/offline-preview.json');
