// Conservative deterministic checks complement source/model review. They do
// not establish semantic correctness, and never execute generated expressions.
export function arithmeticIssues(text: string): string[] {
  const issues: string[] = [];
  // Parse numeric expressions with a small grammar, never eval/Function or a
  // shell. Parentheses, precedence, unary signs, powers and explicit percentage
  // products are supported. Symbolic algebra and ambiguous separators are not
  // claimed as verified. Do not validate a suffix of a symbolic expression.
  const normalized=text.replace(/[−–]/g,'-').replace(/\u00a0/g,' ');
  const number='(?:\\d+(?:[.,]\\d+)?(?:[eE][+-]?\\d+)?)';
  const pattern=new RegExp(`(?<![\\p{L}\\p{N}.,%/×*^])([+\\-]?(?:\\(${number}|${number})[\\d\\s.,eE+\\-×*÷/^()%]*?)\\s*=\\s*([+\\-]?${number})(\\s*%)?(?![\\p{L}\\p{N},]|[.]\\d)`,'gu');
  for(const match of normalized.matchAll(pattern)) {
    const expression=match[1].trim();
    if(!/[+\-×*÷/^]/.test(expression.replace(/^[+-]/,'')))continue;
    if(/[)*/×÷^]\s*$/.test(normalized.slice(0,match.index))||/^\s*[+\-*/×÷^=]/.test(normalized.slice(match.index!+match[0].length)))continue;
    // 1,000 / 1.000 may mean either a decimal or grouped thousands. Never
    // invent the convention. Repeated punctuation is likewise unsupported.
    if(/\d[.,]\d{3}(?!\d)/.test(expression+' '+match[2]))continue;
    // A percentage added to a bare number can be a relative change in prose.
    if(expression.includes('%')&&/[+\-]/.test(expression.replace(/^[+-]/,'')))continue;
    const actual=numericExpression(expression);
    if(actual===undefined)continue;
    // In a percentage calculation, “ratio × 100 = 20%” expresses a result
    // in percent units. “3 / 4 = 75%” instead expresses the ratio itself.
    const resultText=match[2].replace(',','.'),scale=match[3]&&!/[×*]\s*100(?:\.0+)?\s*$/.test(expression)?0.01:1;
    const claimed=Number(resultText)*scale;
    const mantissa=resultText.split(/[eE]/)[0],exponent=Number(resultText.split(/[eE]/)[1]??0);
    const decimals=mantissa.split('.')[1]?.length??0;
    const tolerance=(decimals?0.5*10**(exponent-decimals)*scale:0)+Number.EPSILON*8*Math.max(1,Math.abs(actual));
    if(!Number.isFinite(actual)||!Number.isFinite(claimed)||Math.abs(actual-claimed)>tolerance)issues.push(`Numeric equality needs correction: ${match[0].trim()}.`);
  }
  return [...new Set(issues)];
}

function numericExpression(expression:string):number|undefined {
  const tokens=expression.replace(/×/g,'*').replace(/÷/g,'/').replace(/,/g,'.').match(/\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[()+\-*/^%]/g);
  if(!tokens||tokens.length>100||tokens.join('')!==expression.replace(/\s/g,'').replace(/×/g,'*').replace(/÷/g,'/').replace(/,/g,'.'))return;
  let index=0,depth=0;
  const primary=():number=>{
    if(++depth>30)throw Error('Numeric expression too deep');
    let value:number;
    if(tokens[index]==='('){index++;value=sum();if(tokens[index++]!==')')throw Error('Unclosed parentheses');}
    else{const token=tokens[index++];if(!token||!/^[0-9]/.test(token))throw Error('Expected number');value=Number(token);}
    depth--;if(tokens[index]==='%'){index++;value/=100;}return value;
  };
  const power=():number=>{const left=primary();if(tokens[index]==='^'){index++;return left**unary();}return left;};
  const unary=():number=>{if(tokens[index]==='+'||tokens[index]==='-'){const sign=tokens[index++];return(sign==='-'?-1:1)*unary();}return power();};
  const product=():number=>{let value=unary();while(tokens[index]==='*'||tokens[index]==='/'){const op=tokens[index++],next=unary();value=op==='*'?value*next:value/next;}return value;};
  const sum=():number=>{let value=product();while(tokens[index]==='+'||tokens[index]==='-'){const op=tokens[index++],next=product();value=op==='+'?value+next:value-next;}return value;};
  try{const value=sum();return index===tokens.length?value:undefined;}catch{return;}
}

export function reasoningCardIssues(question: string, answer: string, kind?: string): string[] {
  const issues: string[] = [];
  const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const q = normalize(question), a = normalize(answer);
  const distinctAnswer=[...new Set(answer.split(/[.!?\n]+/).map(normalize).filter(Boolean))].join(' ');
  if ((kind === 'mechanism' || kind === 'application') &&
      /^(?:it |this |they )?(?:helps?|supports?|improves?|enables?|ensures?|promotes?) (?:better |effective |efficient |financial |strategic |the )*(?:management|stability|efficiency|decision making|risk reduction|alignment|understanding)(?: and (?:profitability|growth|stability))?$/.test(distinctAnswer)) {
    issues.push('Give the specific decision or causal change and its reason, rather than a generic benefit.');
  }
  if (kind === 'application' && /\b(?:depends on|it depends|cannot be determined|insufficient information)\b/.test(a) &&
      !/\b(?:because|unless|whether|which|missing|specified|given|assum|need|without|criteria|costs?|claims|such as)\w*/.test(a)) {
    issues.push('An indeterminate answer must identify the missing input or condition.');
  }
  if(/\bduration\b/.test(q)&&/\binvestment\b/.test(q)&&
      (!/\b(?:duration|term|maturity|horizon|long term|short term|years)\b/.test(a)||! /\b(?:invest|returns?|assets?|interest|savings|capital|market)\w*/.test(a))) {
    issues.push('The answer must address both the requested duration and investment considerations.');
  }
  if(kind!=='mechanism')return issues;
  const proposition = q.replace(/^(?:why|how) (?:does|do|is|are|can|will) /, '').replace(/\?$/, '');
  if (proposition.length > 20 && (a === proposition || a === `${proposition} because ${proposition}`)) {
    issues.push('The mechanism answer repeats the question instead of explaining it.');
  }
  if (/\b(?:important|crucial|essential|vital)\b/.test(a) &&
      /\b(?:for|to) (?:understand|assess|manage|ensure|improve|achieve|price|pricing)\b/.test(a) &&
      !/\b(?:because|therefore|since|when|if|increases?|decreases?|multipl|depend|changes?|leads?|causes?|determines?)\b|[=×]|\d/.test(a)) {
    issues.push('The answer states importance but does not explain the requested mechanism.');
  }
  // Observed failure: repeating the source attribute is not a why explanation.
  if (/life insurance/.test(q) && /investment sensitivit/.test(q) &&
      !/\b(?:assets?|returns?|interest|rates?|discount|valu(?:e|ation)|cash|future|payouts?|obligations?|liabilities)\b/.test(a)) {
    issues.push('Explain how future obligations and invested assets create investment sensitivity; repeating the attribute does not answer why.');
  }
  return issues;
}
