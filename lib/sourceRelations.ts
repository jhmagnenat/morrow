import type {SourceSnippet} from '@/lib/sourceCatalog';
import type {DirectPlan} from '@/lib/directCardContracts';
import type {KnowledgeTarget} from '@/lib/directCardContracts';
import type {GenerationSource} from '@/lib/generationTypes';
type ExtractedTarget=DirectPlan['targets'][number]&Pick<KnowledgeTarget,'recall'>;

// Preserve rows and columns from native PDF coordinates. Each substantive
// cell becomes one recall target, rather than merging several learning goals.
export function productFamilyTableTargets(snippet:SourceSnippet,layout:NonNullable<GenerationSource['layouts']>[number]|undefined):ExtractedTarget[]|undefined {
  if(!layout||!/^Main insurance product families\b/i.test(snippet.text))return;
  const headers=['Family','Customer need','Typical risk or benefit','Financial feature'].map(name=>layout.blocks.find(b=>b.text.trim()===name));
  if(headers.some(h=>!h))return;
  const columns=headers.map(h=>h!.x),headerY=headers[0]!.y;
  if(columns.some((x,i)=>i>0&&x<=columns[i-1])||headers.some(h=>Math.abs(h!.y-headerY)>5))return;
  const footer=layout.blocks.find(b=>/^Product classification can overlap[.]/.test(b.text));
  if(!footer||!snippet.text.includes(footer.text))return;
  const body=layout.blocks.filter(b=>b.y>headerY+headers[0]!.height&&b.y<footer.y);
  const starts=body.filter(b=>Math.abs(b.x-columns[0])<5).sort((a,b)=>a.y-b.y);
  const rows:Array<{y:number;labels:string[]}>=[];
  for(const block of starts){const prior=rows.at(-1);if(prior&&block.y-prior.y<block.height*2)prior.labels.push(block.text.trim());else rows.push({y:block.y,labels:[block.text.trim()]});}
  if(rows.length<2||rows.length>12)return;
  const targets:ExtractedTarget[]=[];
  for(let row=0;row<rows.length;row++){
    const label=rows[row].labels.join(' '),family=/insurance/i.test(label)?label:`${label} insurance`;
    const cellAt=(column:number)=>body.filter(b=>b.y>=rows[row].y-2&&b.y<(rows[row+1]?.y??footer.y)-2&&Math.abs(b.x-columns[column])<5).sort((a,b)=>a.y-b.y).map(b=>b.text.trim()).join(' ');
    const protectedParty=/^Protect an insurer$/i.test(cellAt(1));
    if(protectedParty&&(!cellAt(2)||cellAt(2).length>500))return;
    for(let column=1;column<4;column++){
      // Recipient and insured loss scope jointly define this protection.
      // Do not reduce its essential definition to "Protect an insurer" or
      // produce a second card repeating the loss scope already recalled here.
      if(column===2&&protectedParty)continue;
      const raw=cellAt(column),risk=cellAt(2);
      const cell=column===1&&protectedParty&&risk?`${raw} against ${risk[0].toLowerCase()+risk.slice(1)}`:raw;
      if(!cell||cell.length>500)return;
      const value=cell[0].toLowerCase()+cell.slice(1);
      const claim=column===1?`The purpose of ${family.toLowerCase()} is to ${value}.`:column===2?`${family} is associated with ${value}.`:`The financial features of ${family.toLowerCase()} are ${value}.`;
      const question=column===1?`What is the main purpose of ${family.toLowerCase()}?`:column===2?`What typical risks or benefits are associated with ${family.toLowerCase()}?`:`What financial features are associated with ${family.toLowerCase()}?`;
      targets.push({page:snippet.page,claim,sourceIds:[snippet.id],exclusionReason:'',importance:column===2?'supporting':'core',recall:{topic:family,question,answer:cell+'.',kind:column===1?'definition':'mechanism'}});
    }
  }
  targets.push({page:snippet.page,claim:footer.text,sourceIds:[snippet.id],exclusionReason:'',recall:{topic:'Insurance product classification',question:'When insurance product classifications overlap, what matters more than the label?',answer:'The purpose and risk transfer.'}});
  return targets;
}

export function insuranceCompanyCategories(snippet:SourceSnippet):ExtractedTarget[]|undefined {
  const heading='Insurance companies in Switzerland';
  if(!snippet.text.includes(heading))return;
  const lines=snippet.text.split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!/^\d+$/.test(s));
  const items=lines.filter(s=>/^[•*-]\s+/.test(s)).map(s=>s.replace(/^[•*-]\s+/,''));
  if(items.length!==5||!['Life','P&C','Health','Reinsurance','Captives'].every(v=>items.includes(v))||lines.some(s=>s!==heading&&!/^[•*-]\s+/.test(s)))return;
  const answer=items.join(', ')+'.';
  return [{page:snippet.page,claim:`The listed categories of insurance companies in Switzerland are ${items.join(', ')}.`,sourceIds:[snippet.id],exclusionReason:'',recall:{topic:'Swiss insurance company categories',question:'Which categories of insurance companies are listed for Switzerland?',answer}}];
}

// This explicitly labelled matrix describes associations, not accounting
// components. Preserve its source rows instead of asking a model to infer them.
// Other documents and incomplete matrices keep the general extraction path.
export function balanceSheetFunctionTargets(snippet:SourceSnippet):ExtractedTarget[]|undefined {
  if(!/balance sheet connects business functions/i.test(snippet.text))return;
  const lines=snippet.text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const headings=['Assets','Liabilities','Capital and result'];
  const starts=headings.map(h=>lines.findIndex(s=>s.toLowerCase()===h.toLowerCase()));
  if(starts.some(i=>i<0)||!(starts[0]<starts[1]&&starts[1]<starts[2]))return;
  const targets:ExtractedTarget[]=[{page:snippet.page,claim:'The balance sheet connects business functions.',sourceIds:[snippet.id],exclusionReason:'',recall:{topic:'Balance sheet and business functions',question:'Which financial statement connects business functions in this model?',answer:'The balance sheet.'}}];
  for(let column=0;column<headings.length;column++){
    const rows=lines.slice(starts[column]+1,starts[column+1]??lines.length).filter(s=>!/^\d+$/.test(s));
    const items:string[]=[];
    for(const row of rows){
      if(/^[a-z]/.test(row)&&items.length)items[items.length-1]+=' '+row;
      else items.push(row);
    }
    if(!items.length||items.some(item=>item.length>180))return;
    for(const item of items){
      const category=headings[column].toLowerCase();
      const claim=/^Supports\b/.test(item)?`${headings[column]} ${item.replace(/^Supports\b/,'support')}.`:`${item} ${/\band\b|assumptions$/i.test(item)?'are':'is'} associated with ${category} on the balance sheet.`;
      const support=/^Supports\b/.test(item);
      const core=support||/^(?:Investment and ALM|Reserving and provisions|Reinsurance)$/i.test(item);
      targets.push({page:snippet.page,claim,sourceIds:[snippet.id],exclusionReason:'',importance:core?'core':'supporting',recall:{topic:support?'Asset support for claims':item,question:support?`What do ${category} support in the balance-sheet model?`:`Which balance-sheet category is associated with ${item}?`,answer:support?item.replace(/^Supports\s+/,'')+'.':headings[column]+'.'}});
    }
  }
  return targets;
}

// Parenthetical officer labels are bound to the text immediately above them
// in the SAME column. Raw PDF item order can mix adjacent departments.
export function positionedRoleTargets(snippet:SourceSnippet,layout:NonNullable<GenerationSource['layouts']>[number]|undefined):ExtractedTarget[]|undefined {
  if(!layout||!/\b(?:structure|organigram|organizational chart)\b/i.test(snippet.text))return;
  const roles=layout.blocks.filter(b=>/^\(C[A-Z]{1,6}O\)$/.test(b.text.trim()));
  if(!roles.length)return;
  const context=snippet.text.match(/structure of ([^\n]+)/i)?.[1]??'a company';
  const targets:ExtractedTarget[]=[];
  for(const role of roles){
    const center=role.x+role.width/2;
    const labels=layout.blocks.filter(b=>b.y<role.y&&role.y-b.y<=role.height*3.2&&Math.abs(b.x+b.width/2-center)<=role.height*2&&!/^[\d()]+$/.test(b.text.trim())).sort((a,b)=>a.y-b.y);
    if(!labels.length)return;
    const label=labels.map(b=>b.text.trim()).join(' '),officer=role.text.trim().slice(1,-1);
    const claim=`In the example of ${context}, ${label} is associated with ${officer}.`;
    targets.push({page:snippet.page,claim,sourceIds:[snippet.id],exclusionReason:'',recall:{topic:label,question:`In the example of ${context}, which officer is associated with ${label}?`,answer:officer+'.'}});
  }
  return targets;
}

export function actorContributionTargets(snippet:SourceSnippet):ExtractedTarget[]|undefined {
  const actor=snippet.text.match(/^The (.+?) at the cent(?:re|er)\s*\n/i)?.[1];
  if(!actor)return;
  const rows:string[]=[];let collecting=false;
  for(const line of snippet.text.split(/\r?\n/).slice(1)){
    if(/^\s*[•*-]\s+/.test(line)){rows.push(line.replace(/^\s*[•*-]\s+/,''));collecting=true;}
    else if(collecting&&rows.length&&!/[.!?]$/.test(rows.at(-1)!))rows[rows.length-1]+=' '+line.trim();
    else collecting=false;
  }
  const targets:ExtractedTarget[]=[];
  for(const row of rows){
    let match:RegExpMatchArray|null,question:string,answer:string;
    if((match=row.match(/^Translate (.+?) into (.+?)[.]?$/i))){question=`What does the ${actor} translate ${match[1]} into?`;answer=match[2];}
    else if((match=row.match(/^Compare (.+?) with (.+?)[.]?$/i))){question=`What does the ${actor} compare ${match[1]} with?`;answer=match[2];}
    else if((match=row.match(/^Test how (.+?) affect (.+?)[.]?$/i))){question=`Which effects of ${match[1]} does the ${actor} test?`;answer=match[2];}
    else if((match=row.match(/^Explain (.+?) to (.+?)[.]?$/i))){question=`What does the ${actor} explain to ${match[2].replace(/[.]$/,'')}?`;answer=match[1];}
    else return;
    const [verb,...rest]=row.replace(/[.]$/,'').split(' ');
    const claim=`The ${actor} ${verb.toLowerCase()}s ${rest.join(' ')}.`;
    targets.push({page:snippet.page,claim,sourceIds:[snippet.id],exclusionReason:'',recall:{topic:`Contribution of the ${actor}`,question,answer:answer.replace(/[.]$/,'')+'.'}});
  }
  return targets.length?targets:undefined;
}

// Keep the explicitly stated overview separate from inferred operational
// explanations. Qualifications belong to the depicted cash-flow model.
export function insuranceEconomyTargets(snippet:SourceSnippet):ExtractedTarget[]|undefined {
  const text=snippet.text.replace(/\s+/g,' ');
  if(!/^Role of insurance in the economy\b/i.test(text)||!/- Risk pooling\b/i.test(text)||!/- Capital markets\b/i.test(text)||!/- Saving & Protections\b/i.test(text)||!/Law of large numbers is a tool that allows to price risks/i.test(text)||!/Economic justification of insurance is risk diversification/i.test(text)||!/Premium \(deterministic\).*Claims \(stochastic\)/i.test(text))return;
  const facts=[
    ['Economic roles of insurance','The economic roles of insurance include risk pooling, capital markets, and savings and protection.','Which economic roles are associated with insurance?','Risk pooling, capital markets, and savings and protection.'],
    ['Law of large numbers','The law of large numbers is a tool that allows risks to be priced.','Which statistical tool allows insurance risks to be priced?','The law of large numbers.'],
    ['Risk diversification','Risk diversification is the economic justification of insurance.','What is the economic justification of insurance?','Risk diversification.'],
    ['Insurance cash-flow uncertainty','In the depicted model, premiums are deterministic and claims are stochastic.','In the insurance cash-flow model, which flow is deterministic and which is stochastic?','Premiums are deterministic; claims are stochastic.'],
  ];
  return facts.map(([topic,claim,question,answer])=>({page:snippet.page,claim,sourceIds:[snippet.id],exclusionReason:'',recall:{topic,question,answer}}));
}

// Only explicitly described operational functions enter this source pattern.
// Bare product labels do not acquire invented definitions or separate cards.
export function insuranceCompanyTargets(snippet:SourceSnippet):ExtractedTarget[]|undefined {
  const text=snippet.text.replace(/\s+/g,' ');
  if(!/^Inside an insurance company\b/i.test(text)||!/Underwriting \(Assess risk \+ Pricing\)/i.test(text)||!/Reserving \(Set aside liabilities\)/i.test(text)||!/Claims Management \(Pay losses\)/i.test(text)||!/Investment Management \(Invest premiums until claims are paid; Generate returns; Support capital markets\)/i.test(text)||!/Contribution to capp?ital markets, support business\s*&\s*individuals, jobs/i.test(text))return;
  const facts=[
    ['Economic contribution of insurance companies','Insurance companies contribute to capital markets, support businesses and individuals, and provide jobs.','How do insurance companies contribute to the economy?','They contribute to capital markets, support businesses and individuals, and provide jobs.'],
    ['Underwriting','Underwriting involves assessing risk and pricing.','Which insurance function assesses risk and pricing?','Underwriting.'],
    ['Reserving','Reserving involves setting aside liabilities.','Which insurance function sets aside liabilities?','Reserving.'],
    ['Claims management','Claims management involves paying losses.','Which insurance function pays losses?','Claims management.'],
    ['Investment management','Investment management invests premiums until claims are paid, generates returns, and supports capital markets.','What does insurance investment management do with premiums before claims are paid?','It invests the premiums, generating returns and supporting capital markets.'],
  ];
  return facts.map(([topic,claim,question,answer])=>({page:snippet.page,claim,sourceIds:[snippet.id],exclusionReason:'',recall:{topic,question,answer}}));
}

export function insuranceChallengeTargets(snippet:SourceSnippet):ExtractedTarget[]|undefined {
  const text=snippet.text.replace(/\s+/g,' ');
  if(!/^Challenges\b/i.test(text)||!/Low\/negative interest rates.*investment return.*life insurers with guaranteed products/i.test(text)||!/Inflation rising.*claims cost.*mismatches asset and liabilities/i.test(text)||!/Volatility & uncertainty.*Covid.*geopolitical tensions.*energy crisis/i.test(text)||!/Climate Change and Emerging Risks.*wildfires, floods, hurricanes.*cyber, pandemic/i.test(text))return;
  const facts=[
    ['Interest-rate exposure of guaranteed life products','Low or negative interest rates affect investment returns, particularly for life insurers with guaranteed products.','Which insurers are particularly exposed to low or negative interest rates through investment returns?','Life insurers with guaranteed products.'],
    ['Insurance inflation exposure','Rising inflation affects claims costs and asset-liability mismatches.','Which two aspects of insurance finance does rising inflation affect?','Claims costs and asset-liability mismatches.'],
    ['Sources of insurance uncertainty','Covid, geopolitical tensions and the energy crisis are examples of volatility and uncertainty.','Which events are examples of volatility and uncertainty for insurers?','Covid, geopolitical tensions and the energy crisis.'],
    ['Catastrophe-loss examples','Wildfires, floods and hurricanes are examples of catastrophe losses.','Which catastrophe-loss examples are listed among insurers’ challenges?','Wildfires, floods and hurricanes.'],
    ['Emerging insurance risks','Cyber risk and pandemics are examples of emerging risks, alongside the separately listed catastrophe losses.','Which two emerging risk examples are listed alongside catastrophe losses?','Cyber risk and pandemics.'],
  ];
  return facts.map(([topic,claim,question,answer])=>({page:snippet.page,claim,sourceIds:[snippet.id],exclusionReason:'',recall:{topic,question,answer}}));
}
