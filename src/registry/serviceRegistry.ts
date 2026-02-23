import type { Capability } from "../capabilities/capabilities.js"
import type { MatchContext } from "../classifier/types.js"

// ---------------------------------------------------------------------------
// ServiceConfig — canonical shape of a registered x402 service endpoint
// ---------------------------------------------------------------------------

export interface ServiceConfig {
  /** Canonical POST endpoint for this service. */
  url: string
  /** Estimated cost in USD — used for preflight estimates only. Real cost comes from the x402 receipt. */
  estimatedCost: number
  /** Short human-readable description shown in the UX summary. */
  description: string
  /**
   * Describes the expected POST body fields.
   * Keys are field names; values are human-readable descriptions.
   * Used for query validation, documentation, and debugging.
   */
  inputSchemaHint: Record<string, string>
  /** Capability bucket this service belongs to. */
  capability: Capability
  /**
   * Scoring signals used by the generic classifier.
   * phrases  → multi-word or unambiguous single-term triggers (PHRASE_SCORE = 3 each).
   * keywords → supporting single-word signals (KEYWORD_SCORE = 1 each).
   */
  classification: {
    phrases: string[]
    keywords: string[]
  }
  /** Builds the structured POST body sent to the x402 endpoint. */
  buildQuery: (raw: string, ctx: MatchContext) => Record<string, unknown>
}

// ---------------------------------------------------------------------------
// ServiceRegistry — mutable, runtime-configurable service catalog
// ---------------------------------------------------------------------------

export class ServiceRegistry {
  private readonly store: Map<string, ServiceConfig>

  constructor(initial?: Record<string, ServiceConfig>) {
    this.store = initial ? new Map(Object.entries(initial)) : new Map()
  }

  /**
   * Registers a service. If the name already exists the config is replaced.
   * Returns `this` for fluent chaining.
   */
  register(name: string, config: ServiceConfig): this {
    this.store.set(name, config)
    return this
  }

  /**
   * Removes a service. Returns `true` if it was present, `false` otherwise.
   */
  unregister(name: string): boolean {
    return this.store.delete(name)
  }

  /** Returns the config for a service, or `undefined` if not registered. */
  get(name: string): ServiceConfig | undefined {
    return this.store.get(name)
  }

  /** Returns `true` if the service is registered. */
  has(name: string): boolean {
    return this.store.has(name)
  }

  /** Iterates over [name, config] pairs. */
  entries(): IterableIterator<[string, ServiceConfig]> {
    return this.store.entries()
  }

  /** Returns a sorted array of registered service names. */
  names(): string[] {
    return Array.from(this.store.keys()).sort()
  }

  /** Number of registered services. */
  get size(): number {
    return this.store.size
  }

  /**
   * Returns a new `ServiceRegistry` with the same entries.
   * Mutations to the clone do not affect the original, and vice-versa.
   */
  clone(): ServiceRegistry {
    return new ServiceRegistry(Object.fromEntries(this.store))
  }
}

// ---------------------------------------------------------------------------
// Proxy base URLs — set any of these in .env to point a service at a real
// x402 proxy (e.g. foldset.xyz, zauthx402.com, kobaru.ai).
// Falls back to the canonical placeholder host when the variable is unset.
// ---------------------------------------------------------------------------

const BASE = {
  ADEXAURA:      process.env.ADEXAURA_X402_URL      ?? "https://aura.adex.network",
  AIMONETWORK:   process.env.AIMONETWORK_X402_URL   ?? "https://api.aimo.network",
  BLACKSWAN:     process.env.BLACKSWAN_X402_URL     ?? "https://x402.blackswan.wtf",
  CYBERCENTRY:   process.env.CYBERCENTRY_X402_URL   ?? "https://api.cybercentry.ai",
  DAYDREAMS:     process.env.DAYDREAMS_X402_URL     ?? "https://ai.xgate.run",
  DAPPLOOKER:    process.env.DAPPLOOKER_X402_URL    ?? "https://api.dapplooker.com",
  DTELECOM:      process.env.DTELECOM_X402_URL      ?? "https://x402stt.dtelecom.org",
  FIRECRAWL:     process.env.FIRECRAWL_X402_URL     ?? "https://api.firecrawl.dev",
  GLORIA:        process.env.GLORIA_X402_URL        ?? "https://api.gloria.news",
  IMFERENCE:     process.env.IMFERENCE_X402_URL     ?? "https://imference.com",
  MERCHANTGUARD: process.env.MERCHANTGUARD_X402_URL ?? "https://merchantguard.ai/api/v2/sentinela",
  MINIFETCH:     process.env.MINIFETCH_X402_URL     ?? "https://minifetch.com",
  MOLTBOOK:      process.env.MOLTBOOK_X402_URL      ?? "https://api.moltalyzer.xyz",
  PINATA:        process.env.PINATA_X402_URL        ?? "https://api.pinata.cloud",
  SLAMAI:        process.env.SLAMAI_X402_URL        ?? "https://api.slamai.dev",
  TRUSTA:        process.env.TRUSTA_X402_URL        ?? "https://api.trusta.ai",
  UTILITY10:     process.env.UTILITY10_X402_URL     ?? "https://api.utility10.com",
}

// ---------------------------------------------------------------------------
// Default registry — pre-populated with all authorised Ledgerling services
//
// Naming convention for multi-endpoint services:
//   ServiceName_Operation  (e.g. SLAMai_Signals, SLAMai_WalletIntel)
//
// Path parameters (e.g. /wallet/{address}/intel) are omitted from stored URLs;
// callers pass the dynamic segment in the POST body (address, cid, etc.).
// ---------------------------------------------------------------------------

export const defaultRegistry = new ServiceRegistry({

  // ── Research & Web ───────────────────────────────────────────────────────

  Firecrawl: {
    url:           `${BASE.FIRECRAWL}/v1/scrape`,
    estimatedCost: 0.0100,
    description:   "Web scraping & crawling",
    inputSchemaHint: {
      url:  "Target URL to scrape or crawl",
      mode: "Operation mode: 'scrape' (single page) or 'crawl' (full site)",
    },
    capability: "Research & Web",
    classification: {
      phrases: [
        "scrape", "crawl",
        "web scrape", "scrape url", "scrape page", "scrape website",
        "extract content from", "crawl site", "crawl url",
        "scrape https", "fetch html", "web crawl", "scrape the",
      ],
      keywords: [],
    },
    buildQuery: (raw, ctx) => ({
      url:      ctx.urls[0] ?? null,
      mode:     "scrape",
      rawQuery: raw,
    }),
  },

  Minifetch: {
    url:           `${BASE.MINIFETCH}/api/v1/x402/extract/url-content`,
    estimatedCost: 0.0020,
    description:   "Lightweight URL fetch",
    inputSchemaHint: {
      url:      "Target URL to fetch",
      rawQuery: "Original user query for context",
    },
    capability: "Research & Web",
    classification: {
      phrases: [
        "lightweight fetch", "quick fetch", "minimal fetch",
        "fetch url", "fetch the url", "fetch the page",
        "download page", "retrieve page", "get the page",
      ],
      keywords: [],
    },
    buildQuery: (raw, ctx) => ({
      url:      ctx.urls[0] ?? null,
      rawQuery: raw,
    }),
  },

  // ── Market & News ─────────────────────────────────────────────────────────

  GloriaAI: {
    url:           `${BASE.GLORIA}/v1/news/query`,
    estimatedCost: 0.0150,
    description:   "General news query",
    inputSchemaHint: {
      topic:   "News topic, keyword, or question",
      filters: "Optional topic or source filters",
    },
    capability: "Market & News",
    classification: {
      phrases: [
        "latest news", "breaking news", "current events",
        "news about", "news on", "recent news", "today's news",
        "news headlines", "top news", "get news", "news from",
        "headlines", "news update", "what's happening",
      ],
      keywords: ["news"],
    },
    buildQuery: (raw, ctx) => ({
      topic:  raw,
      source: ctx.urls[0] ?? null,
    }),
  },

  BlackSwan: {
    url:           `${BASE.BLACKSWAN}/smart-agents/core`,
    estimatedCost: 0.0300,
    description:   "Crypto news, market sentiment & risk signals",
    inputSchemaHint: {
      topic:    "Crypto asset, protocol, or market theme",
      timespan: "Optional time window (e.g. '24h', '7d')",
    },
    capability: "Market & News",
    classification: {
      phrases: [
        "crypto news", "blockchain news", "bitcoin news", "ethereum news",
        "token news", "defi news", "web3 news", "black swan",
        "market risk", "market sentiment", "sentiment analysis",
        "risk score", "anomaly detection", "unusual market activity",
        "market anomaly", "fear and greed", "volatility analysis",
      ],
      keywords: ["sentiment", "anomaly", "volatility", "crypto"],
    },
    buildQuery: (raw, _ctx) => ({
      topic: raw,
    }),
  },

  Moltbook: {
    url:           `${BASE.MOLTBOOK}/api/moltbook/digests/latest`,
    estimatedCost: 0.0050,
    description:   "Structured news feed aggregation",
    inputSchemaHint: {
      topic:    "Feed topic or category",
      feedType: "Feed format: 'rss', 'atom', or 'json'",
    },
    capability: "Market & News",
    classification: {
      phrases: [
        "news feed", "rss feed", "content feed", "news stream",
        "news aggregator", "feed reader", "news feeds",
        "rss", "atom feed",
      ],
      keywords: ["feed", "feeds"],
    },
    buildQuery: (raw, _ctx) => ({
      topic:    raw,
      feedType: "json",
    }),
  },

  // ── Crypto & DeFi ─────────────────────────────────────────────────────────

  SLAMai_Signals: {
    url:           `${BASE.SLAMAI}/token/price`,
    estimatedCost: 0.0200,
    description:   "Smart-money & institutional on-chain signals",
    inputSchemaHint: {
      query:    "Asset, protocol, or signal category",
      timespan: "Optional lookback window (e.g. '1h', '24h')",
    },
    capability: "Crypto & DeFi",
    classification: {
      phrases: [
        "smart money", "smart money signals", "smart money flow",
        "institutional signal", "institutional flow", "whale signal",
        "on chain signal", "onchain signal", "trading signal",
        "flow data", "money flow",
      ],
      keywords: ["signal", "signals"],
    },
    buildQuery: (raw, _ctx) => ({
      query: raw,
    }),
  },

  SLAMai_WalletIntel: {
    // Canonical endpoint: /wallet/{address}/intel — address sent in POST body
    url:           `${BASE.SLAMAI}/api/wallet`,
    estimatedCost: 0.0200,
    description:   "Deep wallet behavioural intelligence",
    inputSchemaHint: {
      address: "EVM wallet address (0x...)",
      query:   "Optional context or analysis focus",
    },
    capability: "Crypto & DeFi",
    classification: {
      phrases: [
        "wallet intel", "wallet intelligence", "analyze wallet",
        "wallet analysis", "wallet behavior", "wallet behaviour",
        "on chain wallet analysis", "wallet activity analysis",
      ],
      keywords: ["wallet", "analyze", "analyse"],
    },
    buildQuery: (raw, ctx) => ({
      address: ctx.walletAddresses[0] ?? null,
      query:   raw,
    }),
  },

  AdExAURA_Portfolio: {
    url:           `${BASE.ADEXAURA}/api/x402/portfolio/balances`,
    estimatedCost: 0.0100,
    description:   "Crypto portfolio overview",
    inputSchemaHint: {
      address: "EVM wallet address (0x...)",
    },
    capability: "Crypto & DeFi",
    classification: {
      phrases: [
        "portfolio", "my portfolio", "wallet portfolio",
        "crypto portfolio", "asset allocation", "holdings overview",
        "show my assets", "asset overview",
      ],
      keywords: [],
    },
    buildQuery: (raw, ctx) => ({
      address: ctx.walletAddresses[0] ?? null,
      query:   raw,
    }),
  },

  AdExAURA_DefiPositions: {
    url:           `${BASE.ADEXAURA}/api/x402/portfolio/strategies`,
    estimatedCost: 0.0100,
    description:   "DeFi protocol positions (lending, liquidity, staking)",
    inputSchemaHint: {
      address:  "EVM wallet address (0x...)",
      protocol: "Optional protocol filter (e.g. 'aave', 'uniswap')",
    },
    capability: "Crypto & DeFi",
    classification: {
      phrases: [
        "defi positions", "defi position", "lending positions",
        "liquidity positions", "borrowing positions", "defi holdings",
        "protocol positions", "defi exposure", "yield positions",
        "staking positions", "open positions defi",
      ],
      keywords: ["positions"],
    },
    buildQuery: (raw, ctx) => ({
      address:  ctx.walletAddresses[0] ?? null,
      protocol: null,
      query:    raw,
    }),
  },

  DappLooker: {
    url:           `${BASE.DAPPLOOKER}/v1/query`,
    estimatedCost: 0.0150,
    description:   "On-chain protocol & dApp data queries",
    inputSchemaHint: {
      query:    "Natural-language on-chain data query",
      protocol: "Optional protocol or contract address",
    },
    capability: "Crypto & DeFi",
    classification: {
      phrases: [
        "on chain data", "onchain data", "blockchain data",
        "protocol data", "dapp data", "smart contract data",
        "blockchain query", "on-chain analytics", "dapp analytics",
        "dapplooker",
      ],
      keywords: ["onchain", "protocol"],
    },
    buildQuery: (raw, _ctx) => ({
      query: raw,
    }),
  },

  // ── AI & Media ────────────────────────────────────────────────────────────

  AiMoNetwork_LLM: {
    url:           `${BASE.AIMONETWORK}/v1/llm/infer`,
    estimatedCost: 0.0300,
    description:   "General LLM inference (summarise, explain, generate text)",
    inputSchemaHint: {
      prompt: "Instruction or question for the language model",
      source: "Optional source URL or text to process",
    },
    capability: "AI & Media",
    classification: {
      phrases: [
        "summarize", "summary", "summarise",
        "explain this", "explain the", "generate text",
        "write a summary", "give me a summary", "brief summary",
        "quick summary", "short summary", "key points", "main points",
        "bullet points", "tl dr", "tldr", "analyze this text",
        "text analysis", "llm query", "ai text",
      ],
      keywords: ["summarize", "summarization", "condense", "digest", "synopsis"],
    },
    buildQuery: (raw, ctx) => ({
      prompt: raw,
      source: ctx.urls[0] ?? null,
    }),
  },

  AiMoNetwork_Market: {
    url:           `${BASE.AIMONETWORK}/v1/market/data`,
    estimatedCost: 0.0200,
    description:   "AI-augmented crypto & financial market data",
    inputSchemaHint: {
      query:   "Market query (e.g. 'ETH price', 'BTC 24h change')",
      symbols: "Optional array of asset tickers",
    },
    capability: "AI & Media",
    classification: {
      phrases: [
        "market data", "market price", "market prices", "ai market data",
        "crypto price", "crypto prices", "bitcoin price", "bitcoin prices",
        "ethereum price", "ethereum prices", "btc price", "eth price",
        "token price", "token prices", "coin price", "price of bitcoin",
        "price of ethereum", "market insights", "ai market",
        "market prediction", "financial data", "asset price data",
      ],
      keywords: ["price", "prices", "market", "latest"],
    },
    buildQuery: (raw, ctx) => ({
      query:   raw,
      symbols: ctx.cryptoSymbols.length > 0 ? ctx.cryptoSymbols : undefined,
    }),
  },

  Imference: {
    url:           `${BASE.IMFERENCE}/ondemand/generate`,
    estimatedCost: 0.0500,
    description:   "AI image generation",
    inputSchemaHint: {
      prompt: "Text description of the image to generate",
      style:  "Optional style hint (e.g. 'photorealistic', 'illustration')",
    },
    capability: "AI & Media",
    classification: {
      phrases: [
        "generate image", "create image", "make image",
        "image of", "picture of", "draw an", "draw a",
        "render image", "ai image", "create art", "generate art",
        "ai-generated image", "image generation",
      ],
      keywords: ["image", "picture", "illustration", "artwork", "render", "paint"],
    },
    buildQuery: (raw, _ctx) => ({
      prompt: raw,
    }),
  },

  DaydreamsRouter: {
    url:           `${BASE.DAYDREAMS}/v1/chat/completions`,
    estimatedCost: 0.0250,
    description:   "Multi-model LLM routing & complex reasoning",
    inputSchemaHint: {
      query:  "Complex or multi-step query to route",
      models: "Optional preferred model list",
    },
    capability: "AI & Media",
    classification: {
      phrases: [
        "complex query", "multi step", "multi-step",
        "chained query", "route this query", "ai agent query",
        "llm routing", "query routing", "daydreams",
        "multi model", "model routing",
      ],
      keywords: ["route", "orchestrate"],
    },
    buildQuery: (raw, _ctx) => ({
      query: raw,
    }),
  },

  dTelecomSTT: {
    url:           `${BASE.DTELECOM}/v1/session`,
    estimatedCost: 0.0250,
    description:   "Speech-to-text transcription",
    inputSchemaHint: {
      audioUrl: "Publicly accessible audio or video URL",
      language: "Optional BCP-47 language code (default: 'en')",
    },
    capability: "AI & Media",
    classification: {
      phrases: [
        "transcribe", "transcription",
        "speech to text", "audio transcription", "voice to text",
        "convert audio", "transcribe audio", "transcribe recording",
        "transcribe video", "audio to text",
        "meeting transcript", "podcast transcript",
      ],
      keywords: [],
    },
    buildQuery: (raw, ctx) => ({
      audioUrl: ctx.urls[0] ?? null,
      query:    raw,
    }),
  },

  // ── Security & Compliance ─────────────────────────────────────────────────

  Cybercentry_URL: {
    url:           `${BASE.CYBERCENTRY}/v1/scan/url`,
    estimatedCost: 0.0300,
    description:   "URL security & vulnerability scan",
    inputSchemaHint: {
      url:      "Target URL to scan",
      scanType: "Optional scan profile: 'quick', 'full', 'malware'",
    },
    capability: "Security & Compliance",
    classification: {
      phrases: [
        "scan url", "url scan", "url security", "scan website",
        "website security", "security scan", "vulnerability scan",
        "malware scan", "security audit", "penetration test", "pentest",
        "scan for vulnerabilities", "check for malware",
        "security check", "threat scan", "cyber threat",
        "security analysis",
      ],
      keywords: ["vulnerability", "malware", "pentest", "exploit", "breach"],
    },
    buildQuery: (raw, ctx) => ({
      url:      ctx.urls[0] ?? null,
      scanType: "url",
      query:    raw,
    }),
  },

  Cybercentry_IP: {
    url:           `${BASE.CYBERCENTRY}/v1/scan/ip`,
    estimatedCost: 0.0300,
    description:   "IP address reputation & threat intelligence",
    inputSchemaHint: {
      ip:  "IPv4 or IPv6 address to scan",
      ctx: "Optional context (e.g. 'inbound request', 'outbound')",
    },
    capability: "Security & Compliance",
    classification: {
      phrases: [
        "scan ip", "ip scan", "ip security", "ip reputation",
        "check ip", "malicious ip", "ip threat",
        "ip blacklist", "is this ip safe", "ip block",
        "ip lookup security", "ip address scan", "ip address threat",
        "scan this ip", "scan the ip", "scan an ip",
        "ip address for threats", "check this ip", "check the ip",
      ],
      keywords: ["ip-reputation", "blocklist"],
    },
    buildQuery: (raw, ctx) => ({
      ip:    ctx.ipAddresses[0] ?? null,
      query: raw,
    }),
  },

  MerchantGuard_Score: {
    url:           `${BASE.MERCHANTGUARD}/screen`,
    estimatedCost: 0.0030,
    description:   "Fraud & chargeback risk score",
    inputSchemaHint: {
      query:      "Transaction or merchant description",
      merchantId: "Optional merchant or account identifier",
      amount:     "Optional transaction amount (USD float)",
    },
    capability: "Security & Compliance",
    classification: {
      phrases: [
        "fraud score", "fraud risk", "risk score", "merchant risk",
        "merchant score", "transaction risk score", "payment risk score",
        "guardscore",
      ],
      keywords: ["fraud", "chargeback", "scam"],
    },
    buildQuery: (raw, _ctx) => ({
      query: raw,
    }),
  },

  MerchantGuard_Scan: {
    url:           `${BASE.MERCHANTGUARD}/batch`,
    estimatedCost: 0.0030,
    description:   "Deep fraud detection scan",
    inputSchemaHint: {
      query:       "Transaction or activity description",
      sessionData: "Optional session / behavioural signals",
    },
    capability: "Security & Compliance",
    classification: {
      phrases: [
        "fraud detection", "detect fraud", "fraud check",
        "fraud analysis", "fraudulent activity", "fraudulent transaction",
        "payment fraud", "transaction fraud", "guardscan", "fraud scan",
      ],
      keywords: [],
    },
    buildQuery: (raw, _ctx) => ({
      query: raw,
    }),
  },

  MerchantGuard_MysteryShop: {
    url:           `${BASE.MERCHANTGUARD}/screen`,
    estimatedCost: 0.0030,
    description:   "Mystery-shopper compliance audit",
    inputSchemaHint: {
      targetUrl: "Merchant or checkout URL to audit",
      scenario:  "Optional audit scenario description",
    },
    capability: "Security & Compliance",
    classification: {
      phrases: [
        "mystery shopper", "mystery shopping", "mystery shop",
        "shop audit", "mystery-shopper",
      ],
      keywords: [],
    },
    buildQuery: (raw, ctx) => ({
      targetUrl: ctx.urls[0] ?? null,
      scenario:  raw,
    }),
  },

  TrustaAI: {
    url:           `${BASE.TRUSTA}/v1/attest`,
    estimatedCost: 0.0250,
    description:   "Identity attestation & KYC verification",
    inputSchemaHint: {
      query:    "Identity or attestation request description",
      userId:   "Optional user or account identifier",
      kycLevel: "Optional KYC level: 'basic', 'standard', 'enhanced'",
    },
    capability: "Security & Compliance",
    classification: {
      phrases: [
        "kyc", "identity verification", "verify identity",
        "know your customer", "kyc check", "id verification",
        "identity check", "trust score", "verify user",
        "identity attestation", "attest identity", "trustaai",
      ],
      keywords: ["identity", "verification", "attest"],
    },
    buildQuery: (raw, _ctx) => ({
      query: raw,
    }),
  },

  // ── Storage & Content ─────────────────────────────────────────────────────

  PinataIPFS_Upload: {
    url:           `${BASE.PINATA}/v1/ipfs/upload`,
    estimatedCost: 0.0100,
    description:   "IPFS file upload & pinning",
    inputSchemaHint: {
      url:      "Source URL of content to upload, OR",
      content:  "Raw content string to pin",
      filename: "Optional file name",
    },
    capability: "Storage & Content",
    classification: {
      phrases: [
        "upload to ipfs", "pin to ipfs", "ipfs upload",
        "store on ipfs", "ipfs pin", "pinata upload",
        "upload file to ipfs", "decentralized storage",
      ],
      keywords: ["pinata", "ipfs", "upload", "pin"],
    },
    buildQuery: (raw, ctx) => ({
      url:     ctx.urls[0] ?? null,
      content: raw,
    }),
  },

  PinataIPFS_Get: {
    url:           `${BASE.PINATA}/v1/ipfs/get`,
    estimatedCost: 0.0050,
    description:   "IPFS content retrieval by CID",
    inputSchemaHint: {
      cid:  "Content Identifier (CIDv0 or CIDv1)",
      hash: "Alias for cid — IPFS hash string",
    },
    capability: "Storage & Content",
    classification: {
      phrases: [
        "get from ipfs", "retrieve from ipfs", "fetch ipfs",
        "ipfs get", "ipfs retrieve", "ipfs hash",
        "download from ipfs", "ipfs hash get",
      ],
      keywords: ["cid", "retrieve"],
    },
    buildQuery: (raw, _ctx) => ({
      cid:  null,
      hash: raw,
    }),
  },

  // ── Utility ───────────────────────────────────────────────────────────────

  Utility10: {
    url:           `${BASE.UTILITY10}/v1/task`,
    estimatedCost: 0.0100,
    description:   "General-purpose utility task execution",
    inputSchemaHint: {
      task:    "Plain-language description of the task",
      context: "Optional additional context or parameters",
    },
    capability: "Utility",
    classification: {
      phrases: [
        "utility task", "utility10", "general task",
        "run utility", "process task", "task automation",
      ],
      keywords: [],
    },
    buildQuery: (raw, _ctx) => ({
      task:    raw,
      context: null,
    }),
  },
})
