import { CapabilityRegistry, type Capability } from "./capabilities.js"
import { defaultRegistry } from "../registry/serviceRegistry.js"

const CAPABILITIES = Object.keys(CapabilityRegistry) as Capability[]

// ─── Structure ────────────────────────────────────────────────────────────────

describe("CapabilityRegistry — structure", () => {
  test("has exactly 7 capability groups", () => {
    expect(CAPABILITIES).toHaveLength(7)
  })

  test("contains all expected capability names", () => {
    expect(CAPABILITIES).toContain("Research & Web")
    expect(CAPABILITIES).toContain("Market & News")
    expect(CAPABILITIES).toContain("Crypto & DeFi")
    expect(CAPABILITIES).toContain("AI & Media")
    expect(CAPABILITIES).toContain("Security & Compliance")
    expect(CAPABILITIES).toContain("Storage & Content")
    expect(CAPABILITIES).toContain("Utility")
  })

  test("every capability has at least one service", () => {
    for (const cap of CAPABILITIES) {
      expect(CapabilityRegistry[cap].length).toBeGreaterThan(0)
    }
  })

  test("total service count is 27", () => {
    const total = CAPABILITIES.reduce((sum, cap) => sum + CapabilityRegistry[cap].length, 0)
    expect(total).toBe(27)
  })
})

// ─── Per-capability services ──────────────────────────────────────────────────

describe("CapabilityRegistry — per-capability services", () => {
  test("Research & Web has Firecrawl and Minifetch", () => {
    expect(CapabilityRegistry["Research & Web"]).toEqual(
      expect.arrayContaining(["Firecrawl", "Minifetch"])
    )
    expect(CapabilityRegistry["Research & Web"]).toHaveLength(2)
  })

  test("Market & News has GloriaAI, BlackSwan, Moltbook", () => {
    expect(CapabilityRegistry["Market & News"]).toEqual(
      expect.arrayContaining(["GloriaAI", "BlackSwan", "Moltbook"])
    )
    expect(CapabilityRegistry["Market & News"]).toHaveLength(3)
  })

  test("Crypto & DeFi has 6 services: signals, wallet intel, portfolio, DeFi positions, on-chain, holdings", () => {
    expect(CapabilityRegistry["Crypto & DeFi"]).toEqual(
      expect.arrayContaining([
        "SLAMai_Signals",
        "SLAMai_WalletIntel",
        "AdExAURA_Portfolio",
        "AdExAURA_DefiPositions",
        "DappLooker",
        "WalletHoldings",
      ])
    )
    expect(CapabilityRegistry["Crypto & DeFi"]).toHaveLength(6)
  })

  test("AI & Media has 5 services: LLM, market data, image gen, multi-model routing, STT", () => {
    expect(CapabilityRegistry["AI & Media"]).toEqual(
      expect.arrayContaining([
        "AiMoNetwork_LLM",
        "AiMoNetwork_Market",
        "Imference",
        "DaydreamsRouter",
        "dTelecomSTT",
      ])
    )
    expect(CapabilityRegistry["AI & Media"]).toHaveLength(5)
  })

  test("Security & Compliance has 6 services: URL scan, IP scan, fraud score, fraud scan, mystery shop, KYC", () => {
    expect(CapabilityRegistry["Security & Compliance"]).toEqual(
      expect.arrayContaining([
        "Cybercentry_URL",
        "Cybercentry_IP",
        "MerchantGuard_Score",
        "MerchantGuard_Scan",
        "MerchantGuard_MysteryShop",
        "TrustaAI",
      ])
    )
    expect(CapabilityRegistry["Security & Compliance"]).toHaveLength(6)
  })

  test("Storage & Content has 4 services: IPFS upload, IPFS get, paid link create, paid link access", () => {
    expect(CapabilityRegistry["Storage & Content"]).toEqual(
      expect.arrayContaining([
        "PinataIPFS_Upload",
        "PinataIPFS_Get",
        "PaidLinks_Create",
        "PaidLinks_Access",
      ])
    )
    expect(CapabilityRegistry["Storage & Content"]).toHaveLength(4)
  })

  test("Utility has Utility10", () => {
    expect(CapabilityRegistry["Utility"]).toEqual(
      expect.arrayContaining(["Utility10"])
    )
    expect(CapabilityRegistry["Utility"]).toHaveLength(1)
  })
})

// ─── Consistency with ServiceRegistry ─────────────────────────────────────────

describe("CapabilityRegistry — consistency with ServiceRegistry", () => {
  test("every service listed in CapabilityRegistry is registered in defaultRegistry", () => {
    for (const cap of CAPABILITIES) {
      for (const service of CapabilityRegistry[cap]) {
        expect(defaultRegistry.has(service)).toBe(true)
      }
    }
  })

  test("every service in defaultRegistry appears in exactly one capability", () => {
    for (const [name] of defaultRegistry.entries()) {
      const matches = CAPABILITIES.filter(cap =>
        (CapabilityRegistry[cap] as readonly string[]).includes(name)
      )
      expect(matches).toHaveLength(1)
    }
  })

  test("no service appears in more than one capability", () => {
    const seen = new Set<string>()
    for (const cap of CAPABILITIES) {
      for (const service of CapabilityRegistry[cap]) {
        expect(seen.has(service)).toBe(false)
        seen.add(service)
      }
    }
  })

  test("every service has a valid HTTPS URL in the registry", () => {
    for (const cap of CAPABILITIES) {
      for (const service of CapabilityRegistry[cap]) {
        const config = defaultRegistry.get(service)
        expect(config?.url).toBeTruthy()
        expect(config?.url).toMatch(/^https:\/\//)
      }
    }
  })

  test("every service has an inputSchemaHint with at least one field", () => {
    for (const cap of CAPABILITIES) {
      for (const service of CapabilityRegistry[cap]) {
        const config = defaultRegistry.get(service)
        expect(config?.inputSchemaHint).toBeDefined()
        expect(Object.keys(config!.inputSchemaHint).length).toBeGreaterThan(0)
      }
    }
  })
})
