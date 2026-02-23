import type { Capability } from "../capabilities/capabilities.js"
import { ServiceRegistry, defaultRegistry, type ServiceConfig } from "../registry/serviceRegistry.js"
import type { MatchContext } from "./types.js"

// ─── Public interfaces ───────────────────────────────────────────────────────

export interface TaskStep {
  capability: Capability
  service: string
  query: Record<string, unknown>
}

export interface ClassificationResult {
  inScope: boolean
  steps: TaskStep[]
  unsupported?: string[]
  fallbackMessage?: string
}

// ─── Fallback message ────────────────────────────────────────────────────────

export const FALLBACK_MESSAGE =
  `Ledgerling currently supports:\n` +
  `• Research & web scraping\n` +
  `• Market & news intelligence\n` +
  `• Crypto & DeFi analytics\n` +
  `• AI inference, image generation & transcription\n` +
  `• Security scanning & compliance\n` +
  `• IPFS storage & paid links\n` +
  `• General utility tasks\n` +
  `Your request doesn't match available paid services yet.`

// ─── Scoring constants ────────────────────────────────────────────────────────
//
// PHRASE_SCORE  — awarded for a multi-word phrase OR a single unambiguous
//                 domain term (e.g. "kyc", "ipfs", "transcribe").
//                 A single phrase is sufficient to exceed MATCH_THRESHOLD.
//
// KEYWORD_SCORE — awarded for a supporting domain-specific single word.
//                 A lone keyword does NOT reach MATCH_THRESHOLD; at least
//                 two keywords (or one phrase) are required.
//
// MATCH_THRESHOLD — minimum score to produce a TaskStep.
//                   Set to 2 so that a single generic keyword (score=1)
//                   never triggers a route on its own.

const PHRASE_SCORE = 3
const KEYWORD_SCORE = 1
const MATCH_THRESHOLD = 2

// ─── Text helpers ─────────────────────────────────────────────────────────────

const URL_REGEX = /https?:\/\/[^\s,'"]+/gi
const EVM_ADDRESS_REGEX = /\b0x[a-fA-F0-9]{40}\b/g
const IPV4_REGEX = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g

/** Canonical set of crypto identifiers we extract from user queries. */
const KNOWN_CRYPTO_SYMBOLS = [
  "btc", "bitcoin", "eth", "ethereum", "sol", "solana",
  "bnb", "usdc", "usdt", "dai", "matic", "polygon",
  "arb", "arbitrum", "op", "optimism", "avax", "avalanche",
  "link", "chainlink", "ada", "cardano", "dot", "polkadot",
  "xrp", "ripple", "ltc", "litecoin", "doge", "shib",
]

function extractUrls(text: string): string[] {
  return text.match(URL_REGEX) ?? []
}

function extractWalletAddresses(text: string): string[] {
  return text.match(EVM_ADDRESS_REGEX) ?? []
}

function extractIpAddresses(text: string): string[] {
  return text.match(IPV4_REGEX) ?? []
}

function extractCryptoSymbols(normalized: string): string[] {
  return KNOWN_CRYPTO_SYMBOLS.filter(sym =>
    new RegExp(`\\b${escapeRegex(sym)}\\b`).test(normalized)
  )
}

/**
 * Normalises a string for keyword matching:
 * lower-case, replace all non-alphanumeric characters with a single space,
 * then collapse runs of whitespace.
 */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim()
}

/** Escape special regex characters in a literal string. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Score a service config against the normalised query.
 * Phrase matches use word-boundary regex for precision.
 */
function scoreConfig(config: ServiceConfig, normalizedInput: string): number {
  let score = 0
  for (const phrase of config.classification.phrases) {
    const re = new RegExp(`\\b${escapeRegex(phrase)}\\b`)
    if (re.test(normalizedInput)) score += PHRASE_SCORE
  }
  for (const keyword of config.classification.keywords) {
    const re = new RegExp(`\\b${escapeRegex(keyword)}\\b`)
    if (re.test(normalizedInput)) score += KEYWORD_SCORE
  }
  return score
}

/**
 * Splits a query into logical clauses on common natural-language conjunctions.
 * Used to identify which sub-parts of a query are unsupported.
 */
function splitIntoClauses(query: string): string[] {
  const parts = query
    .split(/\band\b|\balso\b|\bas well as\b|,|\bplus\b|\bthen\b|\bafter that\b|\badditionally\b/i)
    .map(s => s.trim())
    .filter(s => s.length > 0)
  return parts.length > 0 ? parts : [query]
}

function buildContext(raw: string): MatchContext {
  const normalized = normalize(raw)
  return {
    urls:            extractUrls(raw),
    walletAddresses: extractWalletAddresses(raw),
    ipAddresses:     extractIpAddresses(raw),
    cryptoSymbols:   extractCryptoSymbols(normalized),
    raw,
  }
}

// ─── Main classifier ──────────────────────────────────────────────────────────

/**
 * Classifies a natural-language user request into a structured set of
 * TaskSteps that the Ledgerling orchestrator can execute against x402 services.
 *
 * Algorithm:
 *  1. Normalise and extract entities (URLs, wallet addresses, IPs, crypto symbols).
 *  2. Score every registered service against the full normalised query.
 *  3. Discard services below MATCH_THRESHOLD (score < 2).
 *  4. De-duplicate within each capability:
 *       - Always include the highest-scoring service per capability.
 *       - Also include any secondary service from the same capability that
 *         independently scored ≥ PHRASE_SCORE (distinct explicit intent).
 *  5. Detect unsupported clauses by splitting the query on conjunctions and
 *     checking which sub-clauses produced no match.
 *
 * @param userQuery  Natural-language request from the user.
 * @param registry   Service registry to score against. Defaults to `defaultRegistry`.
 */
export function classifyRequest(
  userQuery: string,
  registry: ServiceRegistry = defaultRegistry,
): ClassificationResult {
  // ── Guard: null / undefined / empty ────────────────────────────────────
  const trimmed = (userQuery ?? "").trim()
  if (!trimmed) {
    return {
      inScope: false,
      steps: [],
      unsupported: [],
      fallbackMessage: FALLBACK_MESSAGE,
    }
  }

  const normalizedFull = normalize(trimmed)
  const ctx = buildContext(trimmed)

  // ── Score all registered services ─────────────────────────────────────
  const scored = Array.from(registry.entries())
    .map(([service, config]) => ({ service, config, score: scoreConfig(config, normalizedFull) }))
    .filter(({ score }) => score >= MATCH_THRESHOLD)

  // ── Fully out-of-scope ─────────────────────────────────────────────────
  if (scored.length === 0) {
    return {
      inScope: false,
      steps: [],
      unsupported: [trimmed],
      fallbackMessage: FALLBACK_MESSAGE,
    }
  }

  // ── De-duplicate by capability ─────────────────────────────────────────
  // Group matched services by capability, then apply selection logic.
  const byCapability = new Map<Capability, Array<{ service: string; config: ServiceConfig; score: number }>>()
  for (const entry of scored) {
    const cap = entry.config.capability
    if (!byCapability.has(cap)) byCapability.set(cap, [])
    byCapability.get(cap)!.push(entry)
  }

  const selected: Array<{ service: string; config: ServiceConfig; score: number }> = []
  for (const entries of byCapability.values()) {
    // Sort descending so entries[0] is always the best match
    entries.sort((a, b) => b.score - a.score)
    selected.push(entries[0])

    // Include additional services from the same capability only when they carry
    // an independent strong signal (score ≥ PHRASE_SCORE), meaning the query
    // explicitly contains a separate intent for that sub-service.
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].score >= PHRASE_SCORE) {
        selected.push(entries[i])
      }
    }
  }

  // ── Build TaskSteps ────────────────────────────────────────────────────
  const steps: TaskStep[] = selected.map(({ service, config }) => ({
    capability: config.capability,
    service,
    query:      config.buildQuery(trimmed, ctx),
  }))

  // ── Detect unsupported clauses ─────────────────────────────────────────
  const clauses = splitIntoClauses(trimmed)
  const unsupported: string[] = []

  for (const clause of clauses) {
    const normalizedClause = normalize(clause)
    const hasMatch = scored.some(
      ({ config }) => scoreConfig(config, normalizedClause) >= MATCH_THRESHOLD
    )
    if (!hasMatch) {
      unsupported.push(clause)
    }
  }

  return {
    inScope: true,
    steps,
    unsupported: unsupported.length > 0 ? unsupported : undefined,
  }
}
