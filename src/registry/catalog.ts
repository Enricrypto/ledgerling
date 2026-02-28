/**
 * catalog.ts
 *
 * Static snapshot of x402.org/ecosystem — Services/Endpoints section only.
 * Used to give the classifier context about services it doesn't have locally registered.
 *
 * Categories mirror the ecosystem page filter tabs.
 */

export type EcosystemCategory =
  | "Client-Side Integrations"
  | "Services/Endpoints"
  | "Infrastructure & Tooling"
  | "Learning & Community Resources"
  | "Facilitators";

export interface EcosystemService {
  name: string;
  description: string;
  category: EcosystemCategory;
  /** Best-guess domain for correlating with Bazaar URLs or env vars */
  domain?: string;
  /** User-friendly category for Telegram bot UI */
  botCategory?: string;
  /** Emoji icon for display */
  icon?: string;
  /** x402 endpoint URL */
  url?: string;
  /** Pre-built example query for "Try" button */
  exampleQuery?: string;
  /** Action-oriented label for button */
  actionLabel?: string;
}

//ALL SERVICES - FILTERED OUT FOR HACKATHON
// export const ECOSYSTEM: EcosystemService[] = [
//   // ── Services/Endpoints ─────────────────────────────────────────────────────
//   {
//     name: "AdEx AURA API",
//     category: "Services/Endpoints",
//     domain: "adex.network",
//     description:
//       "Portfolio data, tokens, DeFi positions, yield strategies, transaction payloads",
//   },
//   {
//     name: "AdPrompt",
//     category: "Services/Endpoints",
//     description:
//       "Pay-per-request advertising & marketing APIs: brand analysis, ad creatives, copy variants",
//   },
//   {
//     name: "AiMo Network",
//     category: "Services/Endpoints",
//     description: "Permissionless pay-per-inference API, agent-native interface",
//   },
//   {
//     name: "AsterPay",
//     category: "Services/Endpoints",
//     description:
//       "Multichain EUR settlement — USDC to EUR via SEPA Instant, MiCA-compliant",
//   },
//   {
//     name: "BlackSwan",
//     category: "Services/Endpoints",
//     domain: "blackswan.wtf",
//     description:
//       "Real-time crypto risk intelligence: news, sentiment, anomaly detection",
//   },
//   {
//     name: "BlockRun.AI",
//     category: "Services/Endpoints",
//     description:
//       "Pay-as-you-go AI gateway — ChatGPT, Claude, DeepSeek, xAI via x402",
//   },
//   {
//     name: "Bitrefill",
//     category: "Services/Endpoints",
//     domain: "bitrefill.com",
//     description: "Gift cards, mobile top-ups, eSIMs using cryptocurrency",
//   },
//   {
//     name: "DappLooker",
//     category: "Services/Endpoints",
//     domain: "dapplooker.com",
//     description: "On-chain and market intelligence APIs — unified data queries",
//   },
//   {
//     name: "DJD Agent Score",
//     category: "Services/Endpoints",
//     description:
//       "Reputation scoring for AI agent wallets on Base, 0–100 on-chain signals",
//   },
//   {
//     name: "dTelecom STT",
//     category: "Services/Endpoints",
//     domain: "dtelecom.org",
//     description:
//       "Production speech-to-text: VAD, noise reduction, 99+ languages",
//   },
//   {
//     name: "Einstein AI",
//     category: "Services/Endpoints",
//     description:
//       "Blockchain intelligence: whale tracking, smart money, DEX analytics, MEV detection",
//   },
//   {
//     name: "Elsa x402",
//     category: "Services/Endpoints",
//     description:
//       "DeFi APIs: portfolio, token prices, swap quotes, wallet analytics, yield suggestions",
//   },
//   {
//     name: "Farnsworth",
//     category: "Services/Endpoints",
//     description:
//       "AI agent infrastructure: recursive memory, encrypted on-chain storage, marketplace",
//   },
//   {
//     name: "Firecrawl",
//     category: "Services/Endpoints",
//     domain: "firecrawl.dev",
//     description: "Web scraping API that turns websites into LLM-ready data",
//   },
//   {
//     name: "Gloria AI",
//     category: "Services/Endpoints",
//     domain: "gloria.news",
//     description: "Real-time, high-signal, customisable news data for AI agents",
//   },
//   {
//     name: "Grove API",
//     category: "Services/Endpoints",
//     description:
//       "Unified /fund and /tip API for sending payments to anyone on the internet",
//   },
//   {
//     name: "invy",
//     category: "Services/Endpoints",
//     description:
//       "Wallet token holdings including values, prices, and NFTs across Ethereum and Solana",
//   },
//   {
//     name: "Kurier",
//     category: "Services/Endpoints",
//     description:
//       "Zero-knowledge proof workflows as a simple pay-as-you-go REST service",
//   },
//   {
//     name: "Laso Finance",
//     category: "Services/Endpoints",
//     description:
//       "Agents get prepaid cards, gift cards, Venmo/PayPal payments via single API call",
//   },
//   {
//     name: "MerchantGuard",
//     category: "Services/Endpoints",
//     domain: "merchantguard.ai",
//     description:
//       "Compliance APIs: merchant risk scoring, 3-layer security scanner, mystery shopper",
//   },
//   {
//     name: "Minifetch",
//     category: "Services/Endpoints",
//     domain: "minifetch.com",
//     description:
//       "Lightweight fetch of rich metadata and clean content summaries from web pages",
//   },
//   {
//     name: "Moltalyzer",
//     category: "Services/Endpoints",
//     domain: "moltalyzer.xyz",
//     description:
//       "AI feeds: community digests, GitHub trending repos, Polymarket insider detection",
//   },
//   {
//     name: "Neynar",
//     category: "Services/Endpoints",
//     domain: "neynar.com",
//     description:
//       "Farcaster social data for agents and humans — casts, profiles, and more",
//   },
//   {
//     name: "Orac",
//     category: "Services/Endpoints",
//     description:
//       "Agent security: prompt injection scanning, code auditing, trust scoring",
//   },
//   {
//     name: "Ordiscan",
//     category: "Services/Endpoints",
//     description:
//       "Bitcoin Ordinals explorer — query or inscribe, pay per request in USDC",
//   },
//   {
//     name: "Otto AI Agent Swarm",
//     category: "Services/Endpoints",
//     description:
//       "Real-time crypto news, token analysis, and market alpha signals",
//   },
//   {
//     name: "ouchanip x402 APIs",
//     category: "Services/Endpoints",
//     description:
//       "10 utility APIs: QR codes, email validation, PDF invoice, image resize, DNS lookup",
//   },
//   {
//     name: "Pinata",
//     category: "Services/Endpoints",
//     domain: "pinata.cloud",
//     description: "Account-free IPFS uploads and retrievals using USDC on Base",
//   },
//   {
//     name: "Postera",
//     category: "Services/Endpoints",
//     description:
//       "Publishing platform for AI agents — publish articles, readers pay per-read",
//   },
//   {
//     name: "Rug Munch Intelligence",
//     category: "Services/Endpoints",
//     description:
//       "Crypto risk intelligence: rug pulls, honeypots, scam detection across 6+ chains",
//   },
//   {
//     name: "SerenAI",
//     category: "Services/Endpoints",
//     description:
//       "Payment gateway for AI agents to pay for database queries and API access",
//   },
//   {
//     name: "SLAMai",
//     category: "Services/Endpoints",
//     domain: "slamai.dev",
//     description: "Smart money intelligence — live signals on Base and Ethereum",
//   },
//   {
//     name: "Snack Money API",
//     category: "Services/Endpoints",
//     description:
//       "Micropayment platform for X, Farcaster, baseapp and verifiable identities",
//   },
//   {
//     name: "SocioLogic",
//     category: "Services/Endpoints",
//     description:
//       "Cryptographically secure, verifiable randomness (RNG) for agents and contracts",
//   },
//   {
//     name: "Spraay x402 Gateway",
//     category: "Services/Endpoints",
//     description:
//       "200+ AI models, batch USDC payments, live Uniswap V3 swap quotes",
//   },
//   {
//     name: "tip.md",
//     category: "Services/Endpoints",
//     description:
//       "Crypto tipping for content creators — USDC tips via MCP powered by x402",
//   },
//   {
//     name: "Trusta.AI",
//     category: "Services/Endpoints",
//     description:
//       "On-chain attestations — pay USDC on Base to publish an attestation",
//   },
//   {
//     name: "twit.sh",
//     category: "Services/Endpoints",
//     domain: "twit.sh",
//     description:
//       "Real-time Twitter/X data for AI agents, no sign-up, pay per request",
//   },
//   {
//     name: "Ubounty",
//     category: "Services/Endpoints",
//     description:
//       "Agents earn USDC by solving GitHub issues — automated bounty + settlement",
//   },
//   {
//     name: "x402engine",
//     category: "Services/Endpoints",
//     description:
//       "28 APIs: image gen, LLM inference, audio transcription, blockchain analytics, IPFS, travel",
//   },
//   {
//     name: "Zyte API",
//     category: "Services/Endpoints",
//     description:
//       "Unified web scraping: unblocking, browser rendering, structured extraction",
//   },

//   // ── Infrastructure & Tooling ───────────────────────────────────────────────
//   {
//     name: "Agently",
//     category: "Infrastructure & Tooling",
//     description:
//       "Routing and settlement layer for agentic commerce — discover, orchestrate, and pay agents",
//   },
//   {
//     name: "EntRoute",
//     category: "Infrastructure & Tooling",
//     description:
//       "Machine-first API discovery for AI agents with semantic intent resolution and MCP server",
//   },
//   {
//     name: "Foldset",
//     category: "Infrastructure & Tooling",
//     description:
//       "Gate any API, MCP, URL behind x402 micropayments — wallet provisioning, reverse proxy, analytics",
//   },
//   {
//     name: "Kobaru",
//     category: "Infrastructure & Tooling",
//     description:
//       "Transparent proxy that adds an x402 paywall to any existing API without code changes",
//   },
//   {
//     name: "Proxy402",
//     category: "Infrastructure & Tooling",
//     description:
//       "Turn any URL into paid content — set a price, share the link, collect payments instantly",
//   },
//   {
//     name: "tollbooth",
//     category: "Infrastructure & Tooling",
//     description:
//       "Open-source x402 API gateway via YAML config — dynamic pricing, multi-upstream, SSE streaming",
//   },
//   {
//     name: "x402jobs",
//     category: "Infrastructure & Tooling",
//     description:
//       "Visual workflow builder: chain paid resources, set markup, publish as a single paid endpoint",
//   },
//   {
//     name: "x402-watch",
//     category: "Infrastructure & Tooling",
//     description:
//       "Health monitoring for x402 APIs — validates 402 responses and full payment lifecycle",
//   },
//   {
//     name: "zkStash",
//     category: "Infrastructure & Tooling",
//     description:
//       "Shared memory layer for agents — intelligent retrieval with native x402 payment support",
//   },

//   // ── Facilitators ───────────────────────────────────────────────────────────
//   {
//     name: "CDP Facilitator",
//     category: "Facilitators",
//     description:
//       "Best-in-class facilitator — fee-free USDC on Base Mainnet, KYT/OFAC checks",
//   },
//   {
//     name: "x402.org Facilitator",
//     category: "Facilitators",
//     description: "Default testnet facilitator for x402",
//   },
//   {
//     name: "AutoIncentive Facilitator",
//     category: "Facilitators",
//     description:
//       "Free, public facilitator for Base and Solana — full verify + settle flow, no API keys",
//   },
//   {
//     name: "Bitrefill Facilitator",
//     category: "Facilitators",
//     description: "Free facilitator for EVM and Solana",
//   },
//   {
//     name: "OpenFacilitator",
//     category: "Facilitators",
//     description: "Free, open-source facilitator — or self-host for $5/month",
//   },
//   {
//     name: "PayAI Facilitator",
//     category: "Facilitators",
//     description:
//       "Multi-network facilitator: Avalanche, Base, Polygon, Sei, Solana — all tokens, no API keys",
//   },
//   {
//     name: "RelAI Facilitator",
//     category: "Facilitators",
//     description:
//       "Multi-chain facilitator with gas-sponsored USDC payments and zero gas fees for users",
//   },
// ];

// ── Lookup helpers ─────────────────────────────────────────────────────────────

export const ECOSYSTEM: EcosystemService[] = [
  // ── Web & Research ─────────────────────────────────────────────────────────
  {
    name: "Firecrawl",
    category: "Services/Endpoints",
    domain: "firecrawl.dev",
    description: "Scrape any webpage and get clean, readable content",
    botCategory: "🔍 Web & Research",
    icon: "🔥",
    url: "https://api.firecrawl.dev",
    exampleQuery: "scrape https://example.com",
    actionLabel: "Scrape webpage",
  },
  {
    name: "Minifetch",
    category: "Services/Endpoints",
    domain: "minifetch.com",
    description: "Fetch a URL and get a clean summary of its content",
    botCategory: "🔍 Web & Research",
    icon: "📦",
    url: "https://minifetch.com",
    exampleQuery: "fetch https://example.com",
    actionLabel: "Fetch URL content",
  },
  {
    name: "Zyte API",
    category: "Services/Endpoints",
    description: "Extract structured data from any website",
    botCategory: "🔍 Web & Research",
    icon: "🕷️",
  },

  // ── AI & Media ─────────────────────────────────────────────────────────────
  {
    name: "Imference",
    category: "Services/Endpoints",
    domain: "imference.com",
    description: "Generate images from a text description",
    botCategory: "🤖 AI & Media",
    icon: "🖼️",
    url: "https://imference.com",
    exampleQuery: "generate image of a sunset over mountains",
    actionLabel: "Generate text-to-image",
  },
  {
    name: "dTelecom STT",
    category: "Services/Endpoints",
    domain: "dtelecom.org",
    description: "Transcribe audio or video to text",
    botCategory: "🤖 AI & Media",
    icon: "🎙️",
    url: "https://x402stt.dtelecom.org",
    exampleQuery: "transcribe https://example.com/sample.mp3",
    actionLabel: "Transcribe audio/video-to-text",
  },
  {
    name: "BlockRun.AI",
    category: "Services/Endpoints",
    description: "Access AI models like ChatGPT and Claude, pay per use",
    botCategory: "🤖 AI & Media",
    icon: "🧠",
  },

  // ── News & Social ──────────────────────────────────────────────────────────
  {
    name: "Gloria AI",
    category: "Services/Endpoints",
    domain: "gloria.news",
    description: "Get real-time news on any topic",
    botCategory: "📰 News & Social",
    icon: "📰",
  },
  {
    name: "twit.sh",
    category: "Services/Endpoints",
    domain: "twit.sh",
    description: "Fetch live Twitter/X posts without an account",
    botCategory: "📰 News & Social",
    icon: "🐦",
  },
  {
    name: "Neynar",
    category: "Services/Endpoints",
    domain: "neynar.com",
    description: "Get posts and profiles from Farcaster",
    botCategory: "📰 News & Social",
    icon: "🟪",
  },

  // ── Storage ────────────────────────────────────────────────────────────────
  {
    name: "Pinata",
    category: "Services/Endpoints",
    domain: "pinata.cloud",
    description: "Store a file permanently on the decentralised web",
    botCategory: "💾 Storage",
    icon: "🍍",
    url: "https://api.pinata.cloud",
    exampleQuery: "upload to ipfs hello world",
    actionLabel: "Upload to IPFS",
  },

  // ── Utility ────────────────────────────────────────────────────────────────
  {
    name: "ouchanip",
    category: "Services/Endpoints",
    description:
      "Utility tools: generate QR codes, validate emails, create PDFs, resize images",
    botCategory: "🛠️ Utility",
    icon: "🧰",
    url: "https://ouchanip.x402proxy.com",
  },
  {
    name: "Bitrefill",
    category: "Services/Endpoints",
    domain: "bitrefill.com",
    description: "Buy gift cards and mobile top-ups instantly",
    botCategory: "🛠️ Utility",
    icon: "🎁",
  },
];

/** Filter to only Services/Endpoints (what your classifier actually routes to) */
export const SERVICES = ECOSYSTEM.filter(
  (e) => e.category === "Services/Endpoints",
);

/** Group all entries by their ecosystem category */
export function byCategory(): Map<EcosystemCategory, EcosystemService[]> {
  const map = new Map<EcosystemCategory, EcosystemService[]>();
  for (const entry of ECOSYSTEM) {
    const bucket = map.get(entry.category) ?? [];
    bucket.push(entry);
    map.set(entry.category, bucket);
  }
  return map;
}

/** Find an entry by matching a URL against known domains */
export function findByUrl(url: string): EcosystemService | undefined {
  try {
    const hostname = new URL(url).hostname.replace(/^(api|www|x402|app)\./, "");
    return ECOSYSTEM.find((e) => e.domain && hostname.endsWith(e.domain));
  } catch {
    return undefined;
  }
}

/** Find by name (case-insensitive, partial match) */
export function findByName(name: string): EcosystemService | undefined {
  const lower = name.toLowerCase();
  return ECOSYSTEM.find((e) => e.name.toLowerCase().includes(lower));
}

/**
 * Returns a short context string suitable for injecting into a classifier prompt
 * or displaying in a UX summary.
 *
 * Example output:
 *   Services/Endpoints (42):
 *     Firecrawl — Web scraping API that turns websites into LLM-ready data
 *     SLAMai — Smart money intelligence — live signals on Base and Ethereum
 *     ...
 */
export function catalogSummary(category?: EcosystemCategory): string {
  const entries = category
    ? ECOSYSTEM.filter((e) => e.category === category)
    : ECOSYSTEM;

  const grouped = new Map<EcosystemCategory, EcosystemService[]>();
  for (const e of entries) {
    const bucket = grouped.get(e.category) ?? [];
    bucket.push(e);
    grouped.set(e.category, bucket);
  }

  const lines: string[] = [];
  for (const [cat, svcs] of grouped) {
    lines.push(`\n${cat} (${svcs.length}):`);
    for (const s of svcs) {
      lines.push(`  ${s.name} — ${s.description}`);
    }
  }
  return lines.join("\n");
}

// ── Bot-friendly categories ────────────────────────────────────────────────────

/**
 * User-friendly category names for Telegram bot UI.
 * Auto-generated from service botCategory fields.
 */
export const BOT_CATEGORIES: Record<string, string[]> = ECOSYSTEM.reduce(
  (acc, svc) => {
    if (svc.botCategory) {
      acc[svc.botCategory] = acc[svc.botCategory] || [];
      acc[svc.botCategory].push(svc.name);
    }
    return acc;
  },
  {} as Record<string, string[]>,
);

/** Get list of bot-friendly category names */
export function getBotCategories(): string[] {
  return Object.keys(BOT_CATEGORIES);
}

/** Get services for a bot category (only those with a URL configured) */
export function getServicesForBotCategory(
  categoryName: string,
): EcosystemService[] {
  const serviceNames = BOT_CATEGORIES[categoryName] ?? [];
  return ECOSYSTEM.filter((e) => serviceNames.includes(e.name) && e.url);
}

/** Escape special chars for MarkdownV2 */
export function escapeMarkdownV2(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

/** Escape URL for MarkdownV2 links */
function escapeUrl(url: string): string {
  return url.replace(/[()]/g, "\\$&");
}

/** Format services list for Telegram display */
export function formatServicesForBot(services: EcosystemService[]): string {
  if (services.length === 0) return "No services in this category\\.";

  return services
    .map((s) => {
      const icon = s.icon || "•";
      const name = escapeMarkdownV2(s.name);
      // Make name a hyperlink if URL exists
      const title = s.url ? `[${name}](${escapeUrl(s.url)})` : `*${name}*`;
      return `${icon} ${title}`;
    })
    .join("\n");
}
