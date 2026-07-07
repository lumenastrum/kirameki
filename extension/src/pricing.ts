/**
 * Anthropic model pricing, $ per million tokens.
 *
 * Rates audited 2026-07-06 against Anthropic's published pricing.
 * Cache reads bill at 0.1× input; cache writes at 1.25× (5-minute TTL)
 * or 2× (1-hour TTL) — transcripts carry the exact 5m/1h split in
 * usage.cache_creation, so cost math uses the real TTL mix.
 */

export interface ModelRates {
  /** $ per MTok of fresh input */
  input: number
  /** $ per MTok of output */
  output: number
}

/** Sonnet 5 introductory pricing ends 2026-08-31; standard rates apply after. */
const SONNET_5_INTRO_ENDS_MS = Date.UTC(2026, 8, 1) // 2026-09-01T00:00:00Z

/** Base input/output rates by model family. Patterns checked in order. */
const MODEL_RATES: ReadonlyArray<{ pattern: RegExp; rates: ModelRates | ((at: number) => ModelRates) }> = [
  { pattern: /fable|mythos/, rates: { input: 10, output: 50 } },
  { pattern: /opus-4-[01](?!\d)/, rates: { input: 15, output: 75 } }, // Opus 4.0 / 4.1 legacy pricing
  { pattern: /opus/, rates: { input: 5, output: 25 } },               // Opus 4.5+
  {
    pattern: /sonnet-5/,
    rates: (at: number) => at < SONNET_5_INTRO_ENDS_MS
      ? { input: 2, output: 10 }
      : { input: 3, output: 15 },
  },
  { pattern: /sonnet/, rates: { input: 3, output: 15 } },
  { pattern: /haiku/, rates: { input: 1, output: 5 } },
]

/** Fallback when the model id matches nothing (unknown future model): Sonnet-class. */
const DEFAULT_RATES: ModelRates = { input: 3, output: 15 }

export function ratesFor(modelId: string | undefined, atMs: number): ModelRates {
  if (modelId) {
    const id = modelId.toLowerCase()
    for (const { pattern, rates } of MODEL_RATES) {
      if (pattern.test(id)) return typeof rates === 'function' ? rates(atMs) : rates
    }
  }
  return DEFAULT_RATES
}

/** Shape of the usage object on assistant transcript entries. */
export interface TranscriptUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  cache_creation?: {
    ephemeral_5m_input_tokens?: number
    ephemeral_1h_input_tokens?: number
  }
}

/** Cost in USD of one API call, from its usage object. */
export function costOfUsage(usage: TranscriptUsage, modelId: string | undefined, atMs: number): number {
  const r = ratesFor(modelId, atMs)
  const input = usage.input_tokens ?? 0
  const output = usage.output_tokens ?? 0
  const cacheRead = usage.cache_read_input_tokens ?? 0
  // Prefer the explicit TTL split; fall back to treating the total as 5-minute writes
  const w5m = usage.cache_creation?.ephemeral_5m_input_tokens
  const w1h = usage.cache_creation?.ephemeral_1h_input_tokens
  const write5m = w5m ?? (usage.cache_creation_input_tokens ?? 0)
  const write1h = w1h ?? 0
  return (
    input * r.input +
    output * r.output +
    cacheRead * r.input * 0.1 +
    write5m * r.input * 1.25 +
    write1h * r.input * 2
  ) / 1_000_000
}

/** Real context size of the last request: everything sent as input. */
export function contextTokensOfUsage(usage: TranscriptUsage): number {
  return (usage.input_tokens ?? 0)
    + (usage.cache_read_input_tokens ?? 0)
    + (usage.cache_creation_input_tokens ?? 0)
}
