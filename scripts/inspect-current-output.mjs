import {DatabaseSync} from 'node:sqlite';
import {writeFileSync} from 'node:fs';
const db=new DatabaseSync('data/encyclopedia.db',{readOnly:true});
const result={};
for(const table of ['documents','passages','notions','notion_sources','notion_metadata','links','study_cards','page_analysis','generation_runs']) {
  result[table]=db.prepare(`SELECT * FROM ${table}`).all().map(row=>{
    if(row.payload)row.payload=JSON.parse(row.payload);
    if(row.evidence)row.evidence=JSON.parse(row.evidence);
    return row;
  });
}
db.close();
writeFileSync('data/reports/current-output-audit-snapshot.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({counts:Object.fromEntries(Object.entries(result).map(([k,v])=>[k,v.length])),documents:result.documents,notions:result.notions.map(n=>({id:n.id,label:n.label,definition:n.definition})),runs:result.generation_runs.slice(-3)},null,2));
