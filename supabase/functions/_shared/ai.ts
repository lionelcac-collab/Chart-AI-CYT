// Claude integration.
// - Claude Haiku 5.5: bulk tasks (news classification, summaries, document extraction).
// - Claude Sonnet 5.5: in-depth analyses, consensus narrative, chat, chart vision.
// Every response is cached in `ai_analyses` (cache_key) and the model + prompt
// version are written to `audit_log` for traceability.
import Anthropic from 'npm:@anthropic-ai/sdk@1.10.0';
import { admin, audit, env } from './runtime.ts';

export const MODELS = {
  bulk: 'claude-haiku-5-5',
  deep: 'claude-sonnet-5-5',
} as const;

let _client: Anthropic | null = null;
export const claude = () => (_client ??= new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') }));

/**
 * Stable system prompt (cached with cache_control). Never put dates or
 * per-request data here, or the prompt cache is invalidated.
 */
export const ANALYST_SYSTEM = `Tu es l'analyste de Chart-BoursafrikIA, une application d'information sur les marchés boursiers africains (BRVM, BVMAC, NGX et autres).
Règles impératives :
1. Tu n'utilises QUE les données fournies dans le message (ou renvoyées par les outils). Tu n'inventes jamais un chiffre, une date, un objectif de cours ou une source. Si une donnée manque, écris « donnée indisponible ».
2. Chaque chiffre cité est accompagné de sa date et de sa source telles que fournies.
3. Tu es un outil d'information et d'analyse, pas un conseiller : aucune formulation impérative (« achetez », « vendez », « il faut »). Tu décris des scénarios, des probabilités, des niveaux et des risques.
4. Tu signales explicitement la faible liquidité, le manque de données et l'incertitude.
5. Tu réponds dans la langue demandée (fr ou en), dans un style clair, accessible aux débutants et précis pour les professionnels.
6. Les indicateurs techniques, plus bas/plus hauts et le modèle de consensus sont calculés par le code : tu les expliques, tu ne les recalcules pas.
7. Pour l'orientation du modèle Chart-BoursafrikIA, emploie « signal haussier », « signal neutre » ou « signal baissier » (jamais « achat » ou « vente », réservés aux avis publiés par des analystes externes).
You are Chart-BoursafrikIA's analyst. The same rules apply in English.`;

type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null };

export async function cached<T>(cacheKey: string, ttlHours: number | null, produce: () => Promise<{ content: T; model: string; promptVersion: string; usage?: Usage; meta: Record<string, unknown> }>): Promise<{ content: T; cached: boolean }> {
  const db = admin();
  const { data: hit } = await db.from('ai_analyses').select('content, created_at').eq('cache_key', cacheKey).maybeSingle();
  if (hit && (ttlHours === null || Date.now() - new Date(hit.created_at).getTime() < ttlHours * 3600_000)) {
    return { content: hit.content as T, cached: true };
  }
  const r = await produce();
  await db.from('ai_analyses').upsert({
    cache_key: cacheKey,
    content: r.content,
    model: r.model,
    prompt_version: r.promptVersion,
    input_tokens: r.usage?.input_tokens,
    output_tokens: r.usage?.output_tokens,
    cache_read_tokens: r.usage?.cache_read_input_tokens ?? null,
    created_at: new Date().toISOString(),
    ...r.meta,
  }, { onConflict: 'cache_key' });
  await audit('system:ai', 'generate', 'ai_analyses', cacheKey, { model: r.model, prompt_version: r.promptVersion, usage: r.usage });
  return { content: r.content, cached: false };
}

/**
 * Structured JSON generation with Sonnet 5.5 (server-side refusal fallback enabled)
 * or Haiku 5.5 (no server-side fallback on Haiku).
 */
export async function generateJson<T>(opts: {
  model: (typeof MODELS)[keyof typeof MODELS];
  schema: Record<string, unknown>;
  content: Anthropic.MessageParam['content'];
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
}): Promise<{ data: T; model: string; usage: Usage }> {
  const common = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 8000,
    system: [{ type: 'text' as const, text: ANALYST_SYSTEM, cache_control: { type: 'ephemeral' as const } }],
    messages: [{ role: 'user' as const, content: opts.content }],
    output_config: { effort: opts.effort ?? 'medium', format: { type: 'json_schema' as const, schema: opts.schema } },
  };
  const res = opts.model === MODELS.deep
    ? await claude().beta.messages.create({ ...common, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } as never)
    : await claude().messages.create(common as never);
  const msg = res as unknown as Anthropic.Message;
  if (msg.stop_reason === 'refusal') throw new Error('AI_REFUSAL');
  if (msg.stop_reason === 'max_tokens') throw new Error('AI_TRUNCATED');
  const text = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  return { data: JSON.parse(text) as T, model: msg.model, usage: msg.usage as Usage };
}

/** JSON schema of a full asset analysis returned to the app. */
export const ASSET_ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'summary', 'technical', 'fundamental', 'risks', 'scenarios', 'keyLevels', 'dataGaps', 'sources', 'conclusion'],
  properties: {
    headline: { type: 'string' },
    conclusion: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    technical: { type: 'string' },
    fundamental: { type: 'string' },
    risks: { type: 'array', items: { type: 'string' } },
    scenarios: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['name', 'description', 'trigger'],
        properties: { name: { type: 'string', enum: ['bear', 'central', 'bull'] }, description: { type: 'string' }, trigger: { type: 'string' } },
      },
    },
    keyLevels: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['label', 'price'], properties: { label: { type: 'string' }, price: { type: 'number' } } },
    },
    dataGaps: { type: 'array', items: { type: 'string' } },
    sources: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['label', 'date'], properties: { label: { type: 'string' }, date: { type: 'string' } } },
    },
  },
} as const;

export const CHART_VISION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['readable', 'instrument', 'timeframe', 'trend', 'patterns', 'levels', 'indicators', 'scenarios', 'caveats'],
  properties: {
    readable: { type: 'boolean' },
    instrument: { type: ['string', 'null'] },
    timeframe: { type: ['string', 'null'] },
    trend: { type: 'string', enum: ['up', 'down', 'sideways', 'unclear'] },
    patterns: { type: 'array', items: { type: 'string' } },
    levels: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['kind', 'price'], properties: { kind: { type: 'string', enum: ['support', 'resistance'] }, price: { type: ['number', 'null'] } } },
    },
    indicators: { type: 'array', items: { type: 'string' } },
    scenarios: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['name', 'description'], properties: { name: { type: 'string', enum: ['bear', 'central', 'bull'] }, description: { type: 'string' } } },
    },
    caveats: { type: 'array', items: { type: 'string' } },
  },
} as const;

export const NEWS_CLASSIFICATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['index', 'relevant', 'markets', 'tickers', 'sentiment', 'materiality', 'category', 'summary_fr', 'summary_en'],
        properties: {
          index: { type: 'integer' },
          relevant: { type: 'boolean' },
          markets: { type: 'array', items: { type: 'string', enum: ['BRVM', 'BVMAC', 'NGX'] } },
          tickers: { type: 'array', items: { type: 'string' } },
          sentiment: { type: 'number' },
          materiality: { type: 'integer', enum: [0, 1, 2, 3] },
          category: { type: 'string', enum: ['results', 'dividend', 'corporate_action', 'regulation', 'macro', 'management', 'market', 'other'] },
          summary_fr: { type: 'string' },
          summary_en: { type: 'string' },
        },
      },
    },
  },
} as const;
