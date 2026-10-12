import { observeLlm, addLlmTokens } from "@/lib/llmTelemetry";
import { findSchemaViolations } from "@/lib/structuredSchema";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {fastGeneration} from '@/lib/generationPolicy';
import {structuredOutputLimit} from '@/lib/generationLimits';
import {budgetedModelCall} from '@/lib/modelExperimentBudget';
import {anthropicOutputSchema} from '@/lib/providerStructuredOutput';

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
// Existing installations keep the economical default; evaluation chooses models
// explicitly rather than silently spending more on a new default.
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen3.5:4b";
// Local structured-output calls on modest hardware have been observed taking
// up to ~3 minutes each; this bounds a hung request instead of letting the
// UI spin forever if Ollama locks up (e.g. the machine went to sleep).
const configuredTimeout=Number(process.env.MORROW_LLM_TIMEOUT_MS);
const CALL_TIMEOUT_MS=Number.isFinite(configuredTimeout)&&configuredTimeout>=10000&&configuredTimeout<=600000?configuredTimeout:60000;
const OLLAMA_TIMEOUT_MS = Number.isFinite(configuredTimeout)&&configuredTimeout>=10000&&configuredTimeout<=600000?configuredTimeout:300000;

// Keep one model resident across generation and review calls.
function ollamaOptions(numPredict: number) {
  const context = Number(process.env.OLLAMA_NUM_CTX ?? 32768);
  return {num_predict:numPredict, temperature:0,
    num_ctx:Number.isInteger(context)&&context>=4096&&context<=65536?context:32768};
}

// Shared tone/depth instruction for every content-generating prompt (decompose,
// PDF generation, chat). Keeps notions from reading like dictionary entries.
// Deliberately subject-agnostic — this app covers whatever the user uploads,
// not just one field.
export const MENTOR_VOICE_INSTRUCTIONS =
  "Write the way a sharp practitioner would explain it out loud to a colleague — brief, direct, " +
  "no essay padding, no filler phrases ('it's worth noting that', 'in today's world', 'in essence'). " +
  "Short sentences over long ones. The reader is C2-level English but not a native speaker, so don't " +
  "dumb down vocabulary or over-explain common words — just cut the fluff and keep every real technical " +
  "term exactly as the field uses it. For every notion: say why it matters, where it shows up in real " +
  "practice, and give one concrete, specific example (with realistic made-up numbers if the subject is " +
  "quantitative) — then stop, don't pad it out further. Flag a common mistake or pitfall only when there's " +
  "a genuinely useful one. Precise and pragmatic, not a glossary entry and not a lecture.";

type Provider = "anthropic" | "openai" | "ollama";

function getProvider(): Provider | null {
  const explicit = process.env.LLM_PROVIDER;
  if (explicit === "ollama") return "ollama";
  if (explicit === "anthropic") return process.env.ANTHROPIC_API_KEY ? "anthropic" : null;
  if (explicit === "openai") return process.env.OPENAI_API_KEY ? "openai" : null;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.OLLAMA_MODEL) return "ollama";
  return null;
}

export function isLlmConfigured(): boolean {
  return getProvider() !== null;
}

export function currentProviderLabel(audit:boolean|'accuracy'=false): string {
  const provider = getProvider();
  if (provider === "anthropic") return `Claude (${audit==='accuracy' ? process.env.ANTHROPIC_ACCURACY_MODEL ?? process.env.ANTHROPIC_AUDIT_MODEL ?? ANTHROPIC_MODEL : audit ? process.env.ANTHROPIC_AUDIT_MODEL ?? ANTHROPIC_MODEL : ANTHROPIC_MODEL})`;
  if (provider === "openai") return `OpenAI (${audit==='accuracy' ? process.env.OPENAI_ACCURACY_MODEL ?? process.env.OPENAI_AUDIT_MODEL ?? OPENAI_MODEL : audit ? process.env.OPENAI_AUDIT_MODEL ?? OPENAI_MODEL : OPENAI_MODEL})`;
  if (provider === "ollama") return `Ollama (${audit==='accuracy' ? process.env.OLLAMA_ACCURACY_MODEL ?? process.env.OLLAMA_AUDIT_MODEL ?? OLLAMA_MODEL : audit ? process.env.OLLAMA_AUDIT_MODEL ?? OLLAMA_MODEL : OLLAMA_MODEL})`;
  return "not configured";
}

export class LlmNotConfiguredError extends Error {
  constructor() {
    super(
      "No LLM configured. Create a .env.local file in the project root with one of: " +
        "OPENAI_API_KEY=sk-... (OpenAI, pay-per-use), ANTHROPIC_API_KEY=sk-ant-... (Claude API, pay-per-use), " +
        "or OLLAMA_MODEL=llama3.1:8b (free, local — requires Ollama running on this machine), then restart the dev server."
    );
    this.name = "LlmNotConfiguredError";
  }
}

export class LlmProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmProviderError";
  }
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  sources?:Array<{documentId:string;page:number;quote?:string;visualDescription?:string}>;
  outsideKnowledge?:boolean;
}

let anthropicClient: Anthropic | null = null;
function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout:CALL_TIMEOUT_MS, maxRetries:0 });
  }
  return anthropicClient;
}

let openaiClient: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout:CALL_TIMEOUT_MS, maxRetries:0 });
  }
  return openaiClient;
}

function openaiErrorMessage(error: unknown): string {
  const cause=(error as {cause?:{code?:string;cause?:{code?:string}}}|null)?.cause;
  const code=cause?.code??cause?.cause?.code;
  if(code==='EACCES'||code==='EPERM')return `OpenAI network access denied (${code}). Check the execution environment, firewall or proxy; no response was received.`;
  if (error instanceof OpenAI.APIError) {
    return error.status===undefined?`Could not reach OpenAI: ${error.message}. Check network access and proxy settings.`:`OpenAI request failed (${error.status}): ${error.message}`;
  }
  return `Could not reach OpenAI: ${error instanceof Error ? error.message : String(error)}`;
}

export async function chatCompletion(system: string, turns: ChatTurn[]): Promise<string> {
  const provider = getProvider();
  if (!provider) throw new LlmNotConfiguredError();

  if (provider === "anthropic") {
    const request = {
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system,
      messages: turns.map((t) => ({ role: t.role, content: t.content })),
    };
    const response = await budgetedModelCall({model:ANTHROPIC_MODEL,tool:'chat',maxOutput:1024},
      async()=> (await getAnthropicClient().messages.countTokens({model:request.model,system:request.system,messages:request.messages})).input_tokens,
      ()=>getAnthropicClient().messages.create(request),r=>({input:r.usage.input_tokens,output:r.usage.output_tokens}));
    const textBlock = response.content.find((block) => block.type === "text");
    return textBlock && textBlock.type === "text" ? textBlock.text : "";
  }

  if (provider === "openai") {
    if(/^gpt-6/.test(OPENAI_MODEL)||process.env.MORROW_LLM_MAX_USD!==undefined){
      const request={model:OPENAI_MODEL,instructions:system,input:turns.map(t=>({role:t.role,content:t.content})),max_output_tokens:2048,store:false};
      const response=await budgetedModelCall({model:OPENAI_MODEL,tool:'chat',maxOutput:2048},
        async()=> (await getOpenAIClient().responses.inputTokens.count({model:request.model,instructions:system,input:request.input})).input_tokens,
        ()=>getOpenAIClient().responses.create(request),r=>({input:r.usage?.input_tokens??NaN,output:r.usage?.output_tokens??NaN}));
      if(response.status!=='completed')throw new LlmProviderError('OpenAI chat did not complete.');
      return response.output_text;
    }
    try {
      const response = await getOpenAIClient().chat.completions.create({
        model: OPENAI_MODEL,
        max_completion_tokens: 1024,
        messages: [
          { role: "system", content: system },
          ...turns.map((t) => ({ role: t.role, content: t.content })),
        ],
      });
      return response.choices[0]?.message?.content ?? "";
    } catch (error) {
      throw new LlmProviderError(openaiErrorMessage(error));
    }
  }

  return ollamaChat(system, turns);
}

// Data-URL images (e.g. a rendered PDF page) to show a vision-capable model
// alongside the text — Claude and OpenAI both support this; Ollama only if
// the configured model happens to be multimodal (e.g. llava), so it's
// passed through there too rather than silently dropped.
function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new LlmProviderError("Expected a base64 data URL image.");
  return { mediaType: match[1], base64: match[2] };
}

// Structured output uses provider-native schemas and local validation.
export async function structuredCompletion<T>(
  system: string,
  userPrompt: string,
  toolName: string,
  toolDescription: string,
  inputSchema: Record<string, unknown>,
  images: string[] = []
): Promise<T> {
  const provider = getProvider();
  if (!provider) throw new LlmNotConfiguredError();

  if (provider === "anthropic") {
    const model=toolName==='audit_accuracy' ? process.env.ANTHROPIC_ACCURACY_MODEL ?? process.env.ANTHROPIC_AUDIT_MODEL ?? ANTHROPIC_MODEL : toolName.startsWith('audit_') ? process.env.ANTHROPIC_AUDIT_MODEL ?? ANTHROPIC_MODEL : ANTHROPIC_MODEL;
    if(/claude-(?:sonnet|opus|haiku)-5/.test(model)||process.env.MORROW_LLM_MAX_USD!==undefined){
      return anthropicStructured<T>(model,system,userPrompt,toolName,toolDescription,inputSchema,images);
    }
    const content: Anthropic.ContentBlockParam[] = [
      ...images.map((dataUrl): Anthropic.ImageBlockParam => {
        const { mediaType, base64 } = parseDataUrl(dataUrl);
        return {
          type: "image",
          source: { type: "base64", media_type: mediaType as "image/png", data: base64 },
        };
      }),
      { type: "text", text: userPrompt },
    ];
    const response = await observeLlm(()=>getAnthropicClient().messages.create({
      model: toolName==='audit_accuracy' ? process.env.ANTHROPIC_ACCURACY_MODEL ?? process.env.ANTHROPIC_AUDIT_MODEL ?? ANTHROPIC_MODEL : toolName.startsWith("audit_") ? process.env.ANTHROPIC_AUDIT_MODEL ?? ANTHROPIC_MODEL : ANTHROPIC_MODEL,
      // Mentor-style multi-paragraph explanations use a lot more output
      // tokens per notion than a one-line definition did.
      max_tokens: structuredOutputLimit(toolName,inputSchema),
      system,
      messages: [{ role: "user", content }],
      tools: [
        {
          name: toolName,
          description: toolDescription,
          input_schema: inputSchema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: toolName },
    }),response=>({input:response.usage.input_tokens,output:response.usage.output_tokens,model:response.model}),{tool:toolName,model:currentProviderLabel(toolName==='audit_accuracy'?'accuracy':toolName.startsWith('audit_'))});
    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );
    if (!toolUse) throw new LlmProviderError("Model did not return structured output");
    if(response.stop_reason === "max_tokens") throw new LlmProviderError("Structured response was truncated; retry a smaller page batch");
    const violations=findSchemaViolations(toolUse.input,inputSchema);
    if(violations.length)throw new LlmProviderError(`Response violates schema: ${violations.join(", ")}`);
    return toolUse.input as T;
  }

  if (provider === "openai") {
    return openaiStructured<T>(system, userPrompt, toolName, toolDescription, inputSchema, images);
  }

  return ollamaStructured<T>(system, userPrompt, toolName, toolDescription, inputSchema, images);
}

// OpenAI's forced function tool-choice is as reliable as Claude's forced tool
// use, but we still run the same shape-validation used for Ollama — cheap
// insurance against a field coming back the wrong type and crashing whatever
// code trusts the declared schema (e.g. a SQLite bind).
async function openaiStructured<T>(
  system: string,
  userPrompt: string,
  toolName: string,
  toolDescription: string,
  inputSchema: Record<string, unknown>,
  images: string[] = []
): Promise<T> {
  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: userPrompt },
    ...images.map((url): OpenAI.Chat.Completions.ChatCompletionContentPart => ({ type: "image_url", image_url: { url } })),
  ];
  let response;
  const model=toolName==='audit_accuracy' ? process.env.OPENAI_ACCURACY_MODEL ?? process.env.OPENAI_AUDIT_MODEL ?? OPENAI_MODEL : toolName.startsWith('audit_') ? process.env.OPENAI_AUDIT_MODEL ?? OPENAI_MODEL : OPENAI_MODEL;
  if(/^gpt-6/.test(model)||process.env.MORROW_LLM_MAX_USD!==undefined)return openaiResponsesStructured<T>(model,system,userPrompt,toolName,toolDescription,inputSchema,images);
  try {
    response = await observeLlm(()=>getOpenAIClient().chat.completions.create({
      model,
      ...(/^gpt-4(?:o|\.1)(?:-|$)/.test(model)?{temperature:0}:{}),
      max_completion_tokens: structuredOutputLimit(toolName,inputSchema),
      messages: [
        { role: "system", content: system },
        { role: "user", content: images.length > 0 ? userContent : userPrompt },
      ],
      tools: [
        {
          type: "function",
          function: { name: toolName, description: toolDescription, parameters: inputSchema,
            strict: ["reconstruct_teaching","audit_teaching","teaching_cards","audit_teaching_cards","plan_direct_cards","direct_cards","audit_direct_cards","audit_visual_cards","repair_course_cards","audit_card_design","audit_accuracy","learn_section","audit_learning_section","deepen_concept","audit_concept_lesson","plan_course", "inventory_section", "reconstruct_section", "extract_slide", "teach_notes", "draft_cards", "audit_slide", "audit_classification", "organize_mapping", "refine_notes", "audit_notes"].includes(toolName) ? true : undefined },
        },
      ],
      tool_choice: { type: "function", function: { name: toolName } },
    }),response=>({input:response.usage?.prompt_tokens ?? 0,output:response.usage?.completion_tokens ?? 0,model:response.model}),{tool:toolName,model:currentProviderLabel(toolName==='audit_accuracy'?'accuracy':toolName.startsWith('audit_'))});
  } catch (error) {
    throw new LlmProviderError(openaiErrorMessage(error));
  }

  if(response.choices[0]?.finish_reason === "length")throw new LlmProviderError("Structured response was truncated; no content was committed");
  const call = response.choices[0]?.message?.tool_calls?.[0];
  if (!call || call.type !== "function") {
    throw new LlmProviderError("OpenAI did not return a tool call.");
  }

  const parsed = safeJsonParse(call.function.arguments);
  if (parsed === undefined) {
    throw new LlmProviderError("OpenAI's tool call arguments weren't valid JSON.");
  }

  const violations = findSchemaViolations(parsed, inputSchema);
  if (violations.length > 0) {
    throw new LlmProviderError(`OpenAI's response didn't match the expected shape: ${violations.join(", ")}.`);
  }

  return parsed as T;
}

function checkedJson<T>(raw:string,schema:Record<string,unknown>):T{
  const parsed=safeJsonParse(raw);
  if(parsed===undefined)throw new LlmProviderError('Provider did not return valid JSON; no content committed.');
  const issues=findSchemaViolations(parsed,schema);
  if(issues.length)throw new LlmProviderError(`Response violates schema: ${issues.join(', ')}`);
  return parsed as T;
}
function experimentEffort(): 'low'|'medium'|'high'{
  const value=process.env.MORROW_REASONING_EFFORT??'medium';
  if(value!=='low'&&value!=='medium'&&value!=='high')throw new LlmProviderError('MORROW_REASONING_EFFORT must be low, medium or high.');
  return value;
}
async function openaiResponsesStructured<T>(model:string,system:string,prompt:string,tool:string,description:string,schema:Record<string,unknown>,images:string[]):Promise<T>{
  const maxOutput=structuredOutputLimit(tool,schema);
  const input:OpenAI.Responses.ResponseInput=[{role:'user',content:[{type:'input_text',text:prompt},...images.map(image_url=>({type:'input_image' as const,image_url,detail:'auto' as const}))]}];
  const format={type:'json_schema' as const,name:tool,strict:true,schema};
  const request={model,instructions:system+'\n'+description,input,text:{format},max_output_tokens:maxOutput,store:false,
    ...(/^gpt-6/.test(model)?{reasoning:{effort:experimentEffort()}}:{})};
  const readUsage=(r:OpenAI.Responses.Response)=>({input:r.usage?.input_tokens??NaN,output:r.usage?.output_tokens??NaN,model:r.model,
    cachedInput:r.usage?.input_tokens_details?.cached_tokens??0,reasoningOutput:r.usage?.output_tokens_details?.reasoning_tokens??0});
  const response=await observeLlm(()=>budgetedModelCall({model,tool,maxOutput},
    async()=> (await getOpenAIClient().responses.inputTokens.count({model,instructions:request.instructions,input,text:request.text,...(request.reasoning?{reasoning:request.reasoning}:{})})).input_tokens,
    ()=>getOpenAIClient().responses.create(request),readUsage),readUsage,{tool,model:currentProviderLabel(tool.startsWith('audit_'))});
  if(response.status!=='completed')throw new LlmProviderError(`OpenAI structured response incomplete (${response.incomplete_details?.reason??response.status}); no automatic repair.`);
  if(response.output.some(item=>item.type==='message'&&item.content.some(c=>c.type==='refusal')))throw new LlmProviderError('OpenAI refused the structured request.');
  return checkedJson<T>(response.output_text,schema);
}
async function anthropicStructured<T>(model:string,system:string,prompt:string,tool:string,description:string,schema:Record<string,unknown>,images:string[]):Promise<T>{
  const maxOutput=structuredOutputLimit(tool,schema);
  const content:Anthropic.MessageParam['content']=[...images.map(url=>{
    const image=parseDataUrl(url);return {type:'image' as const,source:{type:'base64' as const,media_type:image.mediaType as 'image/png',data:image.base64}};
  }),{type:'text',text:prompt}];
  const request={model,max_tokens:maxOutput,system:system+'\n'+description,messages:[{role:'user' as const,content}],
    output_config:{format:{type:'json_schema' as const,schema:anthropicOutputSchema(schema)},effort:experimentEffort()}};
  const readUsage=(r:Anthropic.Message)=>({input:r.usage.input_tokens+(r.usage.cache_read_input_tokens??0)+(r.usage.cache_creation_input_tokens??0),output:r.usage.output_tokens,model:r.model,cachedInput:r.usage.cache_read_input_tokens??0});
  const response=await observeLlm(()=>budgetedModelCall({model,tool,maxOutput},
    async()=> (await getAnthropicClient().messages.countTokens({model,system:request.system,messages:request.messages,output_config:request.output_config})).input_tokens,
    ()=>getAnthropicClient().messages.create(request),readUsage),readUsage,{tool,model:currentProviderLabel(tool.startsWith('audit_'))});
  if(response.stop_reason!=='end_turn')throw new LlmProviderError(`Claude structured response incomplete (${response.stop_reason}); no automatic repair.`);
  return checkedJson<T>(response.content.filter(b=>b.type==='text').map(b=>b.text).join(''),schema);
}

async function ollamaFetch(body: Record<string, unknown>): Promise<Response> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new LlmProviderError(`Ollama request failed (${res.status}): ${await res.text()}`);
    }
    return res;
  } catch (error) {
    if (error instanceof LlmProviderError) throw error;
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new LlmProviderError(
        `Ollama didn't respond within ${OLLAMA_TIMEOUT_MS / 1000}s. The model may be stuck — try restarting "ollama serve".`
      );
    }
    throw new LlmProviderError(
      `Could not reach Ollama at ${OLLAMA_BASE_URL}. Is "ollama serve" running and is the model pulled (ollama pull ${OLLAMA_MODEL})?`
    );
  }
}

async function ollamaChat(system: string, turns: ChatTurn[]): Promise<string> {
  const res = await ollamaFetch({
    model: OLLAMA_MODEL,
    stream: false,
    think: false,
    keep_alive: "10m",
    options: ollamaOptions(2048),
    messages: [{ role: "system", content: system }, ...turns],
  });
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? "";
}

interface OllamaStructuredResponse {
  message?: {content?: string};
  prompt_eval_count?: number;
  eval_count?: number;
  done_reason?: string;
}

// Ollama enforces the supplied JSON schema directly, including vision calls.
// Validate again before handing content to the generation pipeline.
async function ollamaStructured<T>(
  system: string,
  userPrompt: string,
  toolName: string,
  toolDescription: string,
  inputSchema: Record<string, unknown>,
  images: string[] = []
): Promise<T> {
  let lastError: LlmProviderError | null = null;
  // Main card stages make one attempt; retries stay bounded elsewhere.
  const MAX_ATTEMPTS = ['reconstruct_teaching','audit_teaching','teaching_cards','audit_teaching_cards','plan_direct_cards','direct_cards','audit_direct_cards','audit_visual_cards'].includes(toolName)?1:fastGeneration()?1:3;
  // Vision inputs use raw base64 without the data URL prefix.
  const rawImages = images.map((url) => parseDataUrl(url).base64);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await observeLlm(()=>ollamaFetch({
      model: toolName==='audit_accuracy' ? process.env.OLLAMA_ACCURACY_MODEL ?? process.env.OLLAMA_AUDIT_MODEL ?? OLLAMA_MODEL : toolName.startsWith("audit_") ? process.env.OLLAMA_AUDIT_MODEL ?? OLLAMA_MODEL : OLLAMA_MODEL,
      stream: false,
      format: inputSchema,
      think: false,
      keep_alive: "10m",
      options: ollamaOptions(structuredOutputLimit(toolName,inputSchema)),
      messages: [
        { role: "system", content: system + "\n" + toolDescription + "\nReturn only JSON matching the provided schema." },
        { role: "user", content: userPrompt, ...(rawImages.length > 0 ? { images: rawImages } : {}) },
      ],
    }));
    const data = (await res.json()) as OllamaStructuredResponse;
    addLlmTokens(data.prompt_eval_count ?? 0,data.eval_count ?? 0);
    if(data.done_reason === "length") {
      throw new LlmProviderError("Ollama structured response was truncated; no content was committed. Reduce the generation batch size or increase the output budget.");
    }
    const parsed = safeJsonParse(data.message?.content ?? "");
    if (parsed === undefined) {
      lastError = new LlmProviderError("Ollama did not return valid structured JSON; no content was committed.");
      continue;
    }

    const violations = findSchemaViolations(parsed, inputSchema);
    if (violations.length > 0) {
      lastError = new LlmProviderError(
        `Ollama's response didn't match the expected shape: ${violations.join(", ")}. Smaller local models sometimes get a field wrong — try again, or a larger model (e.g. qwen2.5:14b) if this keeps happening.`
      );
      continue;
    }

    return parsed as T;
  }

  throw lastError ?? new LlmProviderError("Ollama returned no structured response.");
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

// Checks both presence (required fields actually there) and basic type
// correctness (a field typed "string" in the schema isn't secretly an
// object/array) — a local model can satisfy "present" while still handing
// back something that crashes whatever code trusts its declared type (e.g.
// an object where a plain string was expected, which SQLite can't bind).
