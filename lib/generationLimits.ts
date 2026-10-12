// Limits cap paid output and duplicate work without reducing source coverage.
// Prices are operator supplied: no stale provider pricing is embedded here.
export function structuredOutputLimit(tool:string,schema:Record<string,unknown>):number{
  const properties=schema.properties as Record<string,{maxItems?:number;items?:{properties?:Record<string,{enum?:unknown[]}>}}> | undefined;
  const decisions=['assertions','cards','concepts','relations','pages'].reduce((sum,key)=>sum+(properties?.[key]?.items?.properties?.key?.enum?.length??0),0);
  const slots=Object.keys((properties?.cards as {properties?:Record<string,unknown>}|undefined)?.properties??{}).length;
  const reviews=Object.keys((properties?.decisions as {properties?:Record<string,unknown>}|undefined)?.properties??{}).length;
  const fallback=tool==='plan_direct_cards'?4096:tool==='direct_cards'?Math.max(6144,Math.min(16384,(slots||properties?.cards?.maxItems||12)*450+1024)):tool==='audit_direct_cards'?Math.max(8192,Math.min(16384,reviews*180+2048)):tool==='audit_visual_cards'?Math.max(2048,Math.min(6144,reviews*350+1024)):tool==='audit_accuracy'?16384:tool==='audit_learning_section'?Math.max(4096,decisions*100+2048):8192;
  const configured=Number(process.env.MORROW_MAX_OUTPUT_TOKENS);
  return Math.min(16384,Number.isInteger(configured)&&configured>=2048?configured:fallback);
}
export function estimatedGenerationCost(input:number,output:number):number|null{
  const inputRate=process.env.MORROW_INPUT_USD_PER_MILLION,outputRate=process.env.MORROW_OUTPUT_USD_PER_MILLION;
  if(inputRate===undefined||outputRate===undefined)return null;
  const rates=[Number(inputRate),Number(outputRate)];
  if(rates.some(rate=>!Number.isFinite(rate)||rate<0))return null;
  return (input*rates[0]+output*rates[1])/1_000_000;
}
