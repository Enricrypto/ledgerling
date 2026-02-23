import type { Capability } from "../capabilities/capabilities.js"
import type { MatchContext } from "../classifier/types.js"

export interface ServiceConfig {
  /** Canonical POST endpoint for this service. */
  url: string
  /** Estimated cost in USD — used for preflight estimates only. */
  estimatedCost: number
  /** Short human-readable description shown in the UX summary. */
  description: string
  /**
   * Describes the expected POST body fields.
   * Keys are field names; values are human-readable descriptions.
   */
  inputSchemaHint: Record<string, string>
  /** Capability bucket this service belongs to. */
  capability: Capability
  /**
   * Scoring signals used by the generic classifier.
   */
  classification: {
    phrases: string[]
    keywords: string[]
  }
  /** Builds the structured POST body sent to the x402 endpoint. */
  buildQuery: (raw: string, ctx: MatchContext) => Record<string, unknown>
}

export class ServiceRegistry {
  private readonly store: Map<string, ServiceConfig>

  constructor(initial?: Record<string, ServiceConfig>) {
    this.store = initial ? new Map(Object.entries(initial)) : new Map()
  }

  register(name: string, config: ServiceConfig): this {
    this.store.set(name, config)
    return this
  }

  unregister(name: string): boolean {
    return this.store.delete(name)
  }

  get(name: string): ServiceConfig | undefined {
    return this.store.get(name)
  }

  has(name: string): boolean {
    return this.store.has(name)
  }

  entries(): IterableIterator<[string, ServiceConfig]> {
    return this.store.entries()
  }

  names(): string[] {
    return Array.from(this.store.keys()).sort()
  }

  get size(): number {
    return this.store.size
  }

  clone(): ServiceRegistry {
    return new ServiceRegistry(Object.fromEntries(this.store))
  }
}

const BASE = {
  ADEXAURA: process.env.ADEXAURA_X402_URL ?? "https://aura.adex.network",
  BLACKSWAN: process.env.BLACKSWAN_X402_URL ?? "https://x402.blackswan.wtf",
  DAYDREAMS: process.env.DAYDREAMS_X402_URL ?? "https://ai.xgate.run",
  DAPPLOOKER: process.env.DAPPLOOKER_X402_URL ?? "https://api.dapplooker.com",
  DTELECOM: process.env.DTELECOM_X402_URL ?? "https://x402stt.dtelecom.org",
  FIRECRAWL: process.env.FIRECRAWL_X402_URL ?? "https://api.firecrawl.dev",
  // GLORIA: process.env.GLORIA_X402_URL ?? "https://api.gloria.news",
  IMFERENCE: process.env.IMFERENCE_X402_URL ?? "https://imference.com",
  MERCHANTGUARD:
    process.env.MERCHANTGUARD_X402_URL ??
    "https://merchantguard.ai/api/v2/sentinela",
  MINIFETCH: process.env.MINIFETCH_X402_URL ?? "https://minifetch.com",
  MOLTBOOK: process.env.MOLTBOOK_X402_URL ?? "https://api.moltalyzer.xyz",
  PINATA: process.env.PINATA_X402_URL ?? "https://api.pinata.cloud",
  SLAMAI: process.env.SLAMAI_X402_URL ?? "https://api.slamai.dev"
  // TEMPORARILY DISABLE UTILITY10 (cert issue)
  // UTILITY10: process.env.UTILITY10_X402_URL ?? "https://api.utility10.com",
}

export const defaultRegistry = new ServiceRegistry({
  // ── Research & Web ───────────────────────────────────────────────────────

  Firecrawl: {
    url: `${BASE.FIRECRAWL}/scrape`, // ✅ Fixed: /v1/scrape → /scrape
    estimatedCost: 0.01,
    description: "Web scraping & crawling",
    inputSchemaHint: {
      url: "Target URL to scrape or crawl",
      mode: "Operation mode: 'scrape' (single page) or 'crawl' (full site)"
    },
    capability: "Research & Web",
    classification: {
      phrases: [
        "scrape",
        "crawl",
        "web scrape",
        "scrape url",
        "scrape page",
        "scrape website",
        "extract content from",
        "crawl site",
        "crawl url",
        "scrape https",
        "fetch html",
        "web crawl"
      ],
      keywords: []
    },
    buildQuery: (raw, ctx) => ({
      url: ctx.urls[0] ?? "https://example.com",
      mode: "scrape",
      rawQuery: raw
    })
  },

  Minifetch: {
    url: `${BASE.MINIFETCH}/extract`, // ✅ Simplified path
    estimatedCost: 0.002,
    description: "Lightweight URL fetch",
    inputSchemaHint: {
      url: "Target URL to fetch",
      rawQuery: "Original user query"
    },
    capability: "Research & Web",
    classification: {
      phrases: [
        "fetch url",
        "fetch the page",
        "download page",
        "retrieve page"
      ],
      keywords: []
    },
    buildQuery: (raw, ctx) => ({ url: ctx.urls[0] ?? null, rawQuery: raw })
  },

  // ── Market & News ─────────────────────────────────────────────────────────

  BlackSwan: {
    url: `${BASE.BLACKSWAN}/core`, // ✅ Fixed: removed /smart-agents
    estimatedCost: 0.03,
    description: "Crypto news, market sentiment & risk signals",
    inputSchemaHint: {
      topic: "Crypto asset or market theme",
      timespan: "Time window"
    },
    capability: "Market & News",
    classification: {
      phrases: [
        "crypto news",
        "market sentiment",
        "risk score",
        "market anomaly"
      ],
      keywords: ["sentiment", "anomaly", "volatility"]
    },
    buildQuery: (raw) => ({ topic: raw })
  },

  Moltbook: {
    url: `${BASE.MOLTBOOK}/digests/latest`, // ✅ Fixed path
    estimatedCost: 0.005,
    description: "Structured news feed aggregation",
    inputSchemaHint: { topic: "Feed topic", feedType: "Feed format" },
    capability: "Market & News",
    classification: { phrases: ["news feed", "rss feed"], keywords: ["feed"] },
    buildQuery: (raw) => ({ topic: raw, feedType: "json" })
  },

  // ── Crypto & DeFi ─────────────────────────────────────────────────────────

  SLAMai_Signals: {
    url: `${BASE.SLAMAI}/signals`, // ✅ Fixed: /signals not /token/price
    estimatedCost: 0.02,
    description: "Smart-money & institutional on-chain signals",
    inputSchemaHint: {
      query: "Asset or signal category",
      timespan: "Lookback window"
    },
    capability: "Crypto & DeFi",
    classification: {
      phrases: ["smart money", "whale signal", "onchain signal"],
      keywords: ["signal"]
    },
    buildQuery: (raw) => ({ query: raw })
  },

  SLAMai_WalletIntel: {
    url: `${BASE.SLAMAI}/wallet/intel`, // ✅ Fixed path
    estimatedCost: 0.02,
    description: "Deep wallet behavioural intelligence",
    inputSchemaHint: { address: "EVM wallet address", query: "Analysis focus" },
    capability: "Crypto & DeFi",
    classification: {
      phrases: ["wallet intel", "wallet analysis"],
      keywords: ["wallet"]
    },
    buildQuery: (raw, ctx) => ({
      address: ctx.walletAddresses[0] ?? null,
      query: raw
    })
  },

  AdExAURA_Portfolio: {
    url: `${BASE.ADEXAURA}/portfolio`, // ✅ Fixed: removed /api/x402/...
    estimatedCost: 0.01,
    description: "Crypto portfolio overview",
    inputSchemaHint: { address: "EVM wallet address" },
    capability: "Crypto & DeFi",
    classification: {
      phrases: ["portfolio", "crypto portfolio"],
      keywords: []
    },
    buildQuery: (raw, ctx) => ({
      address: ctx.walletAddresses[0] ?? null,
      query: raw
    })
  },

  AdExAURA_DefiPositions: {
    url: `${BASE.ADEXAURA}/positions`, // ✅ Fixed path
    estimatedCost: 0.01,
    description: "DeFi protocol positions",
    inputSchemaHint: {
      address: "EVM wallet address",
      protocol: "Protocol filter"
    },
    capability: "Crypto & DeFi",
    classification: {
      phrases: ["defi positions", "liquidity positions"],
      keywords: ["positions"]
    },
    buildQuery: (raw, ctx) => ({
      address: ctx.walletAddresses[0] ?? null,
      protocol: null,
      query: raw
    })
  },

  DappLooker: {
    url: `${BASE.DAPPLOOKER}/v1/query`, // ✅ Already working
    estimatedCost: 0.015,
    description: "On-chain protocol & dApp data queries",
    inputSchemaHint: {
      query: "Natural-language query",
      protocol: "Contract address"
    },
    capability: "Crypto & DeFi",
    classification: {
      phrases: ["onchain data", "dapp analytics"],
      keywords: ["onchain"]
    },
    buildQuery: (raw) => ({ query: raw })
  },

  // ── AI & Media ────────────────────────────────────────────────────────────

  Imference: {
    url: `${BASE.IMFERENCE}/generate`, // ✅ Fixed: /generate not /ondemand/generate
    estimatedCost: 0.05,
    description: "AI image generation",
    inputSchemaHint: { prompt: "Image description", style: "Style hint" },
    capability: "AI & Media",
    classification: {
      phrases: ["generate image", "ai image"],
      keywords: ["image"]
    },
    buildQuery: (raw) => ({ prompt: raw })
  },

  DaydreamsRouter: {
    url: `${BASE.DAYDREAMS}/chat/completions`, // ✅ Fixed: removed /v1
    estimatedCost: 0.025,
    description: "Multi-model LLM routing",
    inputSchemaHint: { query: "Complex query", models: "Model list" },
    capability: "AI & Media",
    classification: {
      phrases: ["multi step", "llm routing"],
      keywords: ["route"]
    },
    buildQuery: (raw) => ({ query: raw })
  },

  dTelecomSTT: {
    url: `${BASE.DTELECOM}/session`, // ✅ Already correct
    estimatedCost: 0.025,
    description: "Speech-to-text transcription",
    inputSchemaHint: { audioUrl: "Audio URL", language: "Language code" },
    capability: "AI & Media",
    classification: { phrases: ["transcribe", "speech to text"], keywords: [] },
    buildQuery: (raw, ctx) => ({ audioUrl: ctx.urls[0] ?? null, query: raw })
  },

  // ── Security & Compliance ─────────────────────────────────────────────────

  MerchantGuard_Score: {
    url: `${BASE.MERCHANTGUARD}/screen`, // ✅ POST body fixes 405
    estimatedCost: 0.003,
    description: "Fraud & chargeback risk score",
    inputSchemaHint: {
      message: "Transaction description",
      merchantId: "Merchant ID"
    },
    capability: "Security & Compliance",
    classification: {
      phrases: ["fraud score", "risk score"],
      keywords: ["fraud"]
    },
    buildQuery: (raw) => ({ message: raw }) // ✅ POST body for 405 fix
  },

  MerchantGuard_Scan: {
    url: `${BASE.MERCHANTGUARD}/batch`, // ✅ Already correct
    estimatedCost: 0.003,
    description: "Deep fraud detection scan",
    inputSchemaHint: { messages: "Transaction batch" },
    capability: "Security & Compliance",
    classification: { phrases: ["fraud detection"], keywords: [] },
    buildQuery: (raw) => ({ messages: [raw] })
  },

  MerchantGuard_MysteryShop: {
    url: `${BASE.MERCHANTGUARD}/screen`, // ✅ POST body fixes 405
    estimatedCost: 0.003,
    description: "Mystery-shopper compliance audit",
    inputSchemaHint: { targetUrl: "Merchant URL", scenario: "Audit scenario" },
    capability: "Security & Compliance",
    classification: { phrases: ["mystery shopper"], keywords: [] },
    buildQuery: (raw, ctx) => ({
      message: `Audit ${ctx.urls[0] ?? "merchant"}: ${raw}`
    })
  },

  // ── Storage & Content ─────────────────────────────────────────────────────

  PinataIPFS_Upload: {
    url: `${BASE.PINATA}/pinning/pinFileToIPFS`, // ✅ Real Pinata path
    estimatedCost: 0.01,
    description: "IPFS file upload & pinning",
    inputSchemaHint: { file: "File content", name: "Filename" },
    capability: "Storage & Content",
    classification: {
      phrases: ["upload to ipfs", "pinata upload"],
      keywords: ["ipfs"]
    },
    buildQuery: (raw, ctx) => ({
      url: ctx.urls[0] ?? null,
      name: "test.txt",
      content: raw
    })
  },

  PinataIPFS_Get: {
    url: `${BASE.PINATA}/pinning/pinHashToIPFS`, // ✅ Real retrieval path
    estimatedCost: 0.005,
    description: "IPFS content retrieval by CID",
    inputSchemaHint: { hashToPin: "IPFS CID" },
    capability: "Storage & Content",
    classification: { phrases: ["get from ipfs"], keywords: ["cid"] },
    buildQuery: (raw) => ({ hashToPin: raw })
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  // Utility10: {
  //   url: `${BASE.UTILITY10}/task`, // ✅ Simplified path
  //   estimatedCost: 0.01,
  //   description: "General-purpose utility task execution",
  //   inputSchemaHint: { task: "Task description" },
  //   capability: "Utility",
  //   classification: { phrases: ["utility task"], keywords: [] },
  //   buildQuery: (raw) => ({ task: raw })
  // }
})
