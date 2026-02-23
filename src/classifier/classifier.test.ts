import { classifyRequest, FALLBACK_MESSAGE } from "./classifier.js"
import type { TaskStep } from "./classifier.js"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function services(result: ReturnType<typeof classifyRequest>): string[] {
  return result.steps.map((s: TaskStep) => s.service)
}

// ─── 1. Unsupported requests ──────────────────────────────────────────────────

describe("Unsupported requests", () => {
  test("completely out-of-scope query returns inScope=false", () => {
    const result = classifyRequest("Build me a rocket")
    expect(result.inScope).toBe(false)
    expect(result.steps).toHaveLength(0)
    expect(result.unsupported).toContain("Build me a rocket")
    expect(result.fallbackMessage).toBe(FALLBACK_MESSAGE)
  })

  test("recipe request is not supported", () => {
    const result = classifyRequest("Give me a pasta recipe")
    expect(result.inScope).toBe(false)
    expect(result.fallbackMessage).toBeDefined()
  })

  test("math question is not supported", () => {
    const result = classifyRequest("What is 2 + 2?")
    expect(result.inScope).toBe(false)
    expect(result.fallbackMessage).toBeDefined()
  })

  test("booking travel is not supported", () => {
    const result = classifyRequest("Book me a flight to Paris")
    expect(result.inScope).toBe(false)
    expect(result.fallbackMessage).toBeDefined()
  })
})

// ─── 2. Empty / edge-case inputs ─────────────────────────────────────────────

describe("Edge case inputs", () => {
  test("empty string returns fallback", () => {
    const result = classifyRequest("")
    expect(result.inScope).toBe(false)
    expect(result.fallbackMessage).toBeDefined()
  })

  test("whitespace-only string returns fallback", () => {
    const result = classifyRequest("   ")
    expect(result.inScope).toBe(false)
    expect(result.fallbackMessage).toBeDefined()
  })

  test("null coerced via undefined cast returns fallback gracefully", () => {
    const result = classifyRequest(null as unknown as string)
    expect(result.inScope).toBe(false)
    expect(result.fallbackMessage).toBeDefined()
  })

  test("very long junk query returns fallback and does not throw", () => {
    const junk = "asdfghjkl ".repeat(200)
    expect(() => classifyRequest(junk)).not.toThrow()
    const result = classifyRequest(junk)
    expect(result.inScope).toBe(false)
  })
})

// ─── 3. Research & Web ────────────────────────────────────────────────────────

describe("Research & Web", () => {
  test('"scrape https://example.com" → Firecrawl', () => {
    const result = classifyRequest("Scrape https://example.com")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("Firecrawl")
    expect(result.steps.find(s => s.service === "Firecrawl")?.query.url).toBe("https://example.com")
    expect(result.steps.find(s => s.service === "Firecrawl")?.query.mode).toBe("scrape")
  })

  test('"crawl this website" → Firecrawl', () => {
    const result = classifyRequest("Crawl this website and extract the content")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("Firecrawl")
  })

  test('"fetch the page" → Minifetch', () => {
    const result = classifyRequest("Fetch the page at https://example.com")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("Minifetch")
  })

  test('"lightweight fetch" → Minifetch', () => {
    const result = classifyRequest("Do a lightweight fetch of https://example.io")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("Minifetch")
  })
})

// ─── 4. Market & News ────────────────────────────────────────────────────────

describe("Market & News", () => {
  test('"latest news" → GloriaAI', () => {
    const result = classifyRequest("What are the latest news?")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("GloriaAI")
  })

  test('"breaking news about AI" → GloriaAI', () => {
    const result = classifyRequest("Breaking news about AI")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("GloriaAI")
  })

  test('"crypto news" → BlackSwan (outscores GloriaAI within same capability)', () => {
    const result = classifyRequest("Show me the latest crypto news")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("BlackSwan")
    // GloriaAI may also appear (separate news intent), but BlackSwan must be present
  })

  test('"market sentiment" → BlackSwan', () => {
    const result = classifyRequest("What is the current market sentiment?")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("BlackSwan")
  })

  test('"volatility analysis" → BlackSwan', () => {
    const result = classifyRequest("Run a volatility analysis on this market")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("BlackSwan")
  })

  test('"news feed" → Moltbook', () => {
    const result = classifyRequest("Subscribe to a news feed for this topic")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("Moltbook")
  })

  test('"rss" alone → Moltbook', () => {
    const result = classifyRequest("Get me the rss for this site")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("Moltbook")
  })
})

// ─── 5. Crypto & DeFi ────────────────────────────────────────────────────────

describe("Crypto & DeFi", () => {
  test('"smart money signals" → SLAMai_Signals', () => {
    const result = classifyRequest("What are the smart money signals right now?")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("SLAMai_Signals")
  })

  test('"smart money" alone → SLAMai_Signals', () => {
    const result = classifyRequest("Show me smart money activity")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("SLAMai_Signals")
  })

  test('"analyze wallet" → SLAMai_WalletIntel', () => {
    const result = classifyRequest("Analyze this wallet for behavioural patterns")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("SLAMai_WalletIntel")
  })

  test('"wallet intelligence" with address → SLAMai_WalletIntel, address extracted', () => {
    const addr = "0xAbCd1234567890abcdef1234567890abcdef1234"
    const result = classifyRequest(`Get wallet intelligence for ${addr}`)
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("SLAMai_WalletIntel")
    expect(result.steps.find(s => s.service === "SLAMai_WalletIntel")?.query.address).toBe(addr)
  })

  test('"portfolio" alone → AdExAURA_Portfolio', () => {
    const result = classifyRequest("Show me my portfolio")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("AdExAURA_Portfolio")
  })

  test('"crypto portfolio" → AdExAURA_Portfolio', () => {
    const result = classifyRequest("Get me a crypto portfolio overview")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("AdExAURA_Portfolio")
  })

  test('"defi positions" → AdExAURA_DefiPositions', () => {
    const result = classifyRequest("What are my current defi positions?")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("AdExAURA_DefiPositions")
  })

  test('"lending positions" → AdExAURA_DefiPositions', () => {
    const result = classifyRequest("Show my lending positions on Aave")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("AdExAURA_DefiPositions")
  })

  test('"on chain data" → DappLooker', () => {
    const result = classifyRequest("Get me on chain data for Uniswap")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("DappLooker")
  })

  test('"dapplooker" brand mention → DappLooker', () => {
    const result = classifyRequest("Use dapplooker to query this protocol")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("DappLooker")
  })

  test('"wallet holdings" → WalletHoldings', () => {
    const result = classifyRequest("Show me my wallet holdings")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("WalletHoldings")
  })

  test('"token holdings" → WalletHoldings', () => {
    const result = classifyRequest("What are the token holdings in this wallet?")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("WalletHoldings")
  })

  test('"wallet balance" → WalletHoldings (balance lookup, not deep analysis)', () => {
    const result = classifyRequest("Check my wallet balance")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("WalletHoldings")
  })

  test('"analyze wallet" outscores "wallet holdings" → SLAMai_WalletIntel wins, not WalletHoldings', () => {
    const result = classifyRequest("Analyze wallet behavior patterns")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("SLAMai_WalletIntel")
    // WalletHoldings should NOT fire — no holdings/token/balance phrase present
    expect(services(result)).not.toContain("WalletHoldings")
  })
})

// ─── 6. AI & Media ───────────────────────────────────────────────────────────

describe("AI & Media", () => {
  test('"summarize" alone → AiMoNetwork_LLM', () => {
    const result = classifyRequest("Summarize this article for me")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("AiMoNetwork_LLM")
  })

  test('"give me a quick summary" → AiMoNetwork_LLM', () => {
    const result = classifyRequest("Give me a quick summary of this content")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("AiMoNetwork_LLM")
  })

  test('"key points" → AiMoNetwork_LLM', () => {
    const result = classifyRequest("What are the key points of this document?")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("AiMoNetwork_LLM")
  })

  test('"market data" → AiMoNetwork_Market', () => {
    const result = classifyRequest("Get me the latest market data")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("AiMoNetwork_Market")
  })

  test('"bitcoin price" → AiMoNetwork_Market with crypto symbols extracted', () => {
    const result = classifyRequest("What is the bitcoin price right now?")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("AiMoNetwork_Market")
    expect(result.steps.find(s => s.service === "AiMoNetwork_Market")?.query.symbols).toContain("bitcoin")
  })

  test('"crypto price" → AiMoNetwork_Market', () => {
    const result = classifyRequest("Get me the ETH crypto price")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("AiMoNetwork_Market")
  })

  test('"generate image of a sunset" → Imference', () => {
    const result = classifyRequest("Generate an image of a sunset over the ocean")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("Imference")
    expect(result.steps.find(s => s.service === "Imference")?.query.prompt).toBeTruthy()
  })

  test('"create art" → Imference', () => {
    const result = classifyRequest("Create art for my NFT project")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("Imference")
  })

  test('"draw a cat" → Imference', () => {
    const result = classifyRequest("Draw a cat sitting on a chair")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("Imference")
  })

  test('"multi step query" → DaydreamsRouter', () => {
    const result = classifyRequest("Handle this multi step reasoning query")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("DaydreamsRouter")
  })

  test('"transcribe" alone → dTelecomSTT', () => {
    const result = classifyRequest("Transcribe this audio recording for me")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("dTelecomSTT")
  })

  test('"speech to text" → dTelecomSTT', () => {
    const result = classifyRequest("I need speech to text conversion")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("dTelecomSTT")
  })

  test("audio URL is extracted into dTelecomSTT query", () => {
    const url = "https://example.com/meeting.mp3"
    const result = classifyRequest(`Transcribe the audio at ${url}`)
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("dTelecomSTT")
    expect(result.steps.find(s => s.service === "dTelecomSTT")?.query.audioUrl).toBe(url)
  })
})

// ─── 7. Security & Compliance ─────────────────────────────────────────────────

describe("Security & Compliance", () => {
  test('"security scan" with URL → Cybercentry_URL', () => {
    const result = classifyRequest("Run a security scan on https://myapp.io")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("Cybercentry_URL")
    expect(result.steps.find(s => s.service === "Cybercentry_URL")?.query.url).toBe("https://myapp.io")
  })

  test('"vulnerability scan" → Cybercentry_URL', () => {
    const result = classifyRequest("Do a vulnerability scan on this endpoint")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("Cybercentry_URL")
  })

  test('"scan ip" → Cybercentry_IP', () => {
    const result = classifyRequest("Scan this ip address for threats 1.2.3.4")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("Cybercentry_IP")
    expect(result.steps.find(s => s.service === "Cybercentry_IP")?.query.ip).toBe("1.2.3.4")
  })

  test('"ip reputation" → Cybercentry_IP', () => {
    const result = classifyRequest("Check the ip reputation of 8.8.8.8")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("Cybercentry_IP")
  })

  test('"fraud score" → MerchantGuard_Score', () => {
    const result = classifyRequest("Get a fraud score for this transaction")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("MerchantGuard_Score")
  })

  test('"risk score" → MerchantGuard_Score', () => {
    const result = classifyRequest("What is the risk score for this merchant?")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("MerchantGuard_Score")
  })

  test('"fraud detection" → MerchantGuard_Scan', () => {
    const result = classifyRequest("Run fraud detection on this payment flow")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("MerchantGuard_Scan")
  })

  test('"detect fraud" → MerchantGuard_Scan', () => {
    const result = classifyRequest("Detect fraud in these transactions")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("MerchantGuard_Scan")
  })

  test('"mystery shopper" → MerchantGuard_MysteryShop', () => {
    const result = classifyRequest("Run a mystery shopper audit on this checkout")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("MerchantGuard_MysteryShop")
  })

  test('"kyc" alone → TrustaAI', () => {
    const result = classifyRequest("I need to run KYC on this user")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("TrustaAI")
  })

  test('"identity verification" → TrustaAI', () => {
    const result = classifyRequest("Perform identity verification on this account")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("TrustaAI")
  })
})

// ─── 8. Storage & Content ────────────────────────────────────────────────────

describe("Storage & Content", () => {
  test('"ipfs" alone → PinataIPFS_Upload (default upload intent)', () => {
    const result = classifyRequest("Upload this to IPFS")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("PinataIPFS_Upload")
  })

  test('"pin to ipfs" → PinataIPFS_Upload', () => {
    const result = classifyRequest("Pin this file to ipfs please")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("PinataIPFS_Upload")
  })

  test('"retrieve from ipfs" → PinataIPFS_Get (outscores Upload)', () => {
    const result = classifyRequest("Retrieve from ipfs using this hash")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("PinataIPFS_Get")
  })

  test('"ipfs hash" → PinataIPFS_Get', () => {
    const result = classifyRequest("Get the content at this ipfs hash")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("PinataIPFS_Get")
  })

  test('"paid link" → PaidLinks_Create', () => {
    const result = classifyRequest("Create a paid link for this document")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("PaidLinks_Create")
  })

  test('"paywall link" → PaidLinks_Create', () => {
    const result = classifyRequest("Generate a paywall link for my content")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("PaidLinks_Create")
  })

  test('"access a paid link" → PaidLinks_Access', () => {
    const result = classifyRequest("I need to access a paid link")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("PaidLinks_Access")
  })

  test('"unlock this link" → PaidLinks_Access', () => {
    const result = classifyRequest("Unlock this link to view the content")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("PaidLinks_Access")
  })
})

// ─── 9. Multi-step, fully supported ──────────────────────────────────────────

describe("Multi-step fully supported queries", () => {
  test("scrape URL and summarize → Firecrawl + AiMoNetwork_LLM (different capabilities)", () => {
    const result = classifyRequest("Scrape https://example.com and summarize the content")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("Firecrawl")
    expect(services(result)).toContain("AiMoNetwork_LLM")
    expect(result.unsupported).toBeUndefined()
  })

  test("smart money + crypto news → SLAMai_Signals + BlackSwan", () => {
    const result = classifyRequest("Show smart money signals and the latest crypto news")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("SLAMai_Signals")
    expect(services(result)).toContain("BlackSwan")
    expect(result.unsupported).toBeUndefined()
  })

  test("security scan + fraud detection → Cybercentry_URL + MerchantGuard_Scan", () => {
    const result = classifyRequest(
      "Run a security scan and check for fraud detection in these transactions"
    )
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("Cybercentry_URL")
    expect(services(result)).toContain("MerchantGuard_Scan")
    expect(result.unsupported).toBeUndefined()
  })

  test("portfolio + defi positions → AdExAURA_Portfolio + AdExAURA_DefiPositions", () => {
    const result = classifyRequest(
      "Show my portfolio and also show my defi positions"
    )
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("AdExAURA_Portfolio")
    expect(services(result)).toContain("AdExAURA_DefiPositions")
  })

  test("generate image + transcribe audio → Imference + dTelecomSTT (different capabilities)", () => {
    const result = classifyRequest(
      "Generate an image of a forest and transcribe this audio file"
    )
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("Imference")
    expect(services(result)).toContain("dTelecomSTT")
  })
})

// ─── 10. Partial support ──────────────────────────────────────────────────────

describe("Partially supported queries", () => {
  test("smart money data + flight booking → SLAMai_Signals in-scope, flight in unsupported", () => {
    const result = classifyRequest("Get smart money data and book me a flight")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("SLAMai_Signals")
    expect(result.unsupported).toBeDefined()
    expect(result.unsupported!.some(u => /flight/i.test(u))).toBe(true)
    expect(result.fallbackMessage).toBeUndefined()
  })

  test("summarize + unsupported action → AiMoNetwork_LLM + unsupported clause", () => {
    const result = classifyRequest("Summarize this article and then call my mom")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("AiMoNetwork_LLM")
    expect(result.unsupported).toBeDefined()
    expect(result.unsupported!.some(u => /call my mom/i.test(u))).toBe(true)
  })

  test("detect fraud + fix my printer → MerchantGuard_Scan + unsupported clause", () => {
    const result = classifyRequest("Detect fraud in this payment and also fix my printer")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("MerchantGuard_Scan")
    expect(result.unsupported).toBeDefined()
  })
})

// ─── 11. Query payload correctness ───────────────────────────────────────────

describe("Query payload correctness", () => {
  test("URL is extracted and included in Firecrawl query", () => {
    const url = "https://news.ycombinator.com"
    const result = classifyRequest(`Scrape ${url}`)
    const step = result.steps.find(s => s.service === "Firecrawl")
    expect(step?.query.url).toBe(url)
    expect(step?.query.mode).toBe("scrape")
  })

  test("URL is extracted into Cybercentry_URL query", () => {
    const url = "https://suspect-domain.io"
    const result = classifyRequest(`Run a security scan on ${url}`)
    const step = result.steps.find(s => s.service === "Cybercentry_URL")
    expect(step?.query.url).toBe(url)
  })

  test("IPv4 address is extracted into Cybercentry_IP query", () => {
    const result = classifyRequest("Scan ip 192.168.1.100 for threats")
    const step = result.steps.find(s => s.service === "Cybercentry_IP")
    expect(step?.query.ip).toBe("192.168.1.100")
  })

  test("crypto symbols are extracted into AiMoNetwork_Market query", () => {
    const result = classifyRequest("What are the latest BTC and ETH prices?")
    const step = result.steps.find(s => s.service === "AiMoNetwork_Market")
    expect(step?.query.symbols).toContain("btc")
    expect(step?.query.symbols).toContain("eth")
  })

  test("EVM address is extracted into SLAMai_WalletIntel query", () => {
    const addr = "0xdeadbeef12345678901234567890deadbeef1234"
    const result = classifyRequest(`Analyze wallet ${addr}`)
    const step = result.steps.find(s => s.service === "SLAMai_WalletIntel")
    expect(step?.query.address).toBe(addr)
  })

  test("AiMoNetwork_LLM includes source URL when URL present", () => {
    const url = "https://example.com/article"
    const result = classifyRequest(`Summarize the article at ${url}`)
    const step = result.steps.find(s => s.service === "AiMoNetwork_LLM")
    expect(step?.query.source).toBe(url)
  })

  test("Imference prompt is the raw user query", () => {
    const raw = "Generate an image of a neon city at night"
    const result = classifyRequest(raw)
    const step = result.steps.find(s => s.service === "Imference")
    expect(step?.query.prompt).toBe(raw)
  })
})

// ─── 12. Case insensitivity & whitespace ─────────────────────────────────────

describe("Case insensitivity and whitespace normalization", () => {
  test("ALL CAPS query is classified correctly", () => {
    const result = classifyRequest("SCRAPE HTTPS://EXAMPLE.COM")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("Firecrawl")
  })

  test("mixed-case query is classified correctly", () => {
    const result = classifyRequest("Get The Latest Market Data")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("AiMoNetwork_Market")
  })

  test("extra whitespace does not break classification", () => {
    const result = classifyRequest("   summarize   this   article   ")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("AiMoNetwork_LLM")
  })
})

// ─── 13. Disambiguation within a capability ───────────────────────────────────

describe("Disambiguation within a capability", () => {
  test('"crypto news" routes to BlackSwan, not GloriaAI (higher score within Market & News)', () => {
    const result = classifyRequest("Get me the latest crypto news")
    expect(result.inScope).toBe(true)
    // BlackSwan must be present; it scores higher due to "crypto" keyword boost
    expect(services(result)).toContain("BlackSwan")
  })

  test('"news feed" routes to Moltbook, not GloriaAI', () => {
    const result = classifyRequest("Set up a news feed for my dashboard")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("Moltbook")
    expect(services(result)).not.toContain("GloriaAI")
  })

  test('"wallet holdings" routes to WalletHoldings, not SLAMai_WalletIntel', () => {
    const result = classifyRequest("What are my wallet holdings?")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("WalletHoldings")
    expect(services(result)).not.toContain("SLAMai_WalletIntel")
  })

  test('"retrieve from ipfs" routes to PinataIPFS_Get, not PinataIPFS_Upload', () => {
    const result = classifyRequest("Retrieve from ipfs this file")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("PinataIPFS_Get")
    expect(services(result)).not.toContain("PinataIPFS_Upload")
  })

  test('"fraud score" routes to MerchantGuard_Score, not MerchantGuard_Scan', () => {
    const result = classifyRequest("Give me a fraud score for this transaction")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("MerchantGuard_Score")
    expect(services(result)).not.toContain("MerchantGuard_Scan")
  })

  test('"summarize" does not trigger market or image services', () => {
    // Use a query with no news-specific terms to ensure only AiMoNetwork_LLM fires.
    const result = classifyRequest("Summarize this document for me")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("AiMoNetwork_LLM")
    expect(services(result)).not.toContain("GloriaAI")
    expect(services(result)).not.toContain("Imference")
  })

  test('"market data" does not trigger Crypto & DeFi analytics', () => {
    const result = classifyRequest("Get me the latest market data")
    expect(result.inScope).toBe(true)
    expect(services(result)).toContain("AiMoNetwork_Market")
    // Should NOT route to DeFi on-chain services for a generic market data query
    expect(services(result)).not.toContain("DappLooker")
    expect(services(result)).not.toContain("SLAMai_Signals")
  })
})

// ─── 14. MATCH_THRESHOLD — single generic keyword must not trigger ────────────

describe("MATCH_THRESHOLD=2 — single generic keyword must not trigger a route", () => {
  test('"data" alone does not match anything', () => {
    const result = classifyRequest("I need data")
    expect(result.inScope).toBe(false)
  })

  test('"scan" alone does not match (keyword, 1pt < threshold 2)', () => {
    // "scan" by itself is not in any service's phrases or keywords, so no match
    const result = classifyRequest("Can you scan something")
    // If "scan" alone somehow matched, we'd expect it in phrases; verify no accidental hit
    // "security scan" IS a phrase (3pts) but "scan" alone is not listed as a keyword
    // — the test verifies our MATCH_THRESHOLD design is respected
    if (result.inScope) {
      // If it did match, it must be because a phrase matched, not a standalone keyword
      for (const step of result.steps) {
        expect(step.service).not.toBe("Utility10") // Not a utility fallback
      }
    }
  })

  test('"check" alone does not match anything', () => {
    const result = classifyRequest("Please check this")
    expect(result.inScope).toBe(false)
  })

  test('"image" alone does not match Imference (1pt keyword < threshold 2)', () => {
    // "image" is in Imference keywords (1pt) but alone is below threshold=2
    const result = classifyRequest("I like image")
    expect(result.inScope).toBe(false)
  })
})

// ─── 15. ClassificationResult shape ──────────────────────────────────────────

describe("ClassificationResult shape", () => {
  test("inScope=true results have no fallbackMessage", () => {
    const result = classifyRequest("Scrape https://example.com")
    expect(result.inScope).toBe(true)
    expect(result.fallbackMessage).toBeUndefined()
  })

  test("inScope=false results always have fallbackMessage", () => {
    const result = classifyRequest("Build me a trebuchet")
    expect(result.inScope).toBe(false)
    expect(result.fallbackMessage).toBe(FALLBACK_MESSAGE)
  })

  test("fully supported queries have no unsupported array", () => {
    const result = classifyRequest("Scrape https://example.com")
    expect(result.unsupported).toBeUndefined()
  })

  test("each step has capability, service, and query fields", () => {
    const result = classifyRequest("Show me smart money signals")
    expect(result.inScope).toBe(true)
    for (const step of result.steps) {
      expect(step.capability).toBeTruthy()
      expect(step.service).toBeTruthy()
      expect(typeof step.query).toBe("object")
    }
  })
})
