// ---------------------------------------------------------------------------
// Capability taxonomy — mutually exclusive, collectively exhaustive.
//
// Design rules:
//   • Each capability maps to a distinct user-intent domain.
//   • Every service belongs to exactly ONE capability.
//   • Multi-endpoint services are split into named sub-entries
//     (e.g. SLAMai_Signals, SLAMai_WalletIntel) so capability membership
//     remains unambiguous and the ServiceRegistry stays flat.
// ---------------------------------------------------------------------------

export const CapabilityRegistry = {
  // Fetching and extracting content from the open web.
  "Research & Web": [
    "Firecrawl",
    "Minifetch",
  ],

  // News retrieval, market feeds, and structured news aggregation.
  "Market & News": [
    "GloriaAI",
    "BlackSwan",
    "Moltbook",
  ],

  // On-chain analytics, wallet intelligence, DeFi positions, smart-money signals.
  "Crypto & DeFi": [
    "SLAMai_Signals",
    "SLAMai_WalletIntel",
    "AdExAURA_Portfolio",
    "AdExAURA_DefiPositions",
    "DappLooker",
    "WalletHoldings",
  ],

  // LLM inference, image generation, multi-model routing, speech-to-text.
  "AI & Media": [
    "AiMoNetwork_LLM",
    "AiMoNetwork_Market",
    "Imference",
    "DaydreamsRouter",
    "dTelecomSTT",
  ],

  // URL/IP scanning, fraud detection, identity attestation, mystery shopping.
  "Security & Compliance": [
    "Cybercentry_URL",
    "Cybercentry_IP",
    "MerchantGuard_Score",
    "MerchantGuard_Scan",
    "MerchantGuard_MysteryShop",
    "TrustaAI",
  ],

  // Decentralised file storage and monetised link management.
  "Storage & Content": [
    "PinataIPFS_Upload",
    "PinataIPFS_Get",
    "PaidLinks_Create",
    "PaidLinks_Access",
  ],

  // General-purpose automation tasks.
  "Utility": [
    "Utility10",
  ],
} as const

export type Capability = keyof typeof CapabilityRegistry
export type Service = typeof CapabilityRegistry[Capability][number]
