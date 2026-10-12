// Keep the original schema for local validation. Anthropic's grammar compiler
// does not accept some scalar/array bounds; preserve them as instructions.
export function anthropicOutputSchema(schema:Record<string,unknown>):Record<string,unknown>{
  const bounds=new Set(['minItems','maxItems','minimum','maximum','minLength','maxLength']);
  function visit(value:unknown):unknown{
    if(Array.isArray(value))return value.map(visit);
    if(!value||typeof value!=='object')return value;
    const original=value as Record<string,unknown>,output:Record<string,unknown>={},constraints:string[]=[];
    for(const [key,item] of Object.entries(original)){
      if(bounds.has(key))constraints.push(`${key}: ${item}`);
      else if(key==='properties')output[key]=Object.fromEntries(Object.entries(item as Record<string,unknown>).map(([name,child])=>[name,visit(child)]));
      else output[key]=visit(item);
    }
    if(constraints.length)output.description=[original.description,...constraints].filter(Boolean).join('; ');
    return output;
  }
  return visit(schema) as Record<string,unknown>;
}
