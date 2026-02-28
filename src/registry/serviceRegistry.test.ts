import {
  ServiceRegistry,
  defaultRegistry,
  type ServiceConfig
} from "./serviceRegistry.js"

const SAMPLE: ServiceConfig = {
  url: "https://api.example.com/v1/test",
  estimatedCost: 0.05,
  description: "Test service",
  inputSchemaHint: { query: "Test query field" },
  capability: "Research & Web",
  classification: { phrases: ["test phrase"], keywords: ["test"] },
  buildQuery: (raw, _ctx) => ({ query: raw })
}

const SAMPLE_B: ServiceConfig = {
  url: "https://api.example-b.com/v1/test",
  estimatedCost: 0.03,
  description: "Test service B",
  inputSchemaHint: { query: "Test query field" },
  capability: "Market & News",
  classification: { phrases: ["test phrase b"], keywords: ["testb"] },
  buildQuery: (raw, _ctx) => ({ query: raw })
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe("ServiceRegistry — constructor", () => {
  test("creates an empty registry with no arguments", () => {
    const r = new ServiceRegistry()
    expect(r.size).toBe(0)
  })

  test("pre-populates entries from initial record", () => {
    const r = new ServiceRegistry({ Alpha: SAMPLE, Beta: SAMPLE_B })
    expect(r.size).toBe(2)
    expect(r.has("Alpha")).toBe(true)
    expect(r.has("Beta")).toBe(true)
  })

  test("mutations to the initial record after construction do not affect the registry", () => {
    const initial: Record<string, ServiceConfig> = { Alpha: SAMPLE }
    const r = new ServiceRegistry(initial)
    initial["Beta"] = SAMPLE_B
    expect(r.has("Beta")).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------

describe("ServiceRegistry — register", () => {
  test("adds a new service", () => {
    const r = new ServiceRegistry()
    r.register("MyService", SAMPLE)
    expect(r.has("MyService")).toBe(true)
    expect(r.get("MyService")).toEqual(SAMPLE)
  })

  test("overwrites an existing service with updated config", () => {
    const r = new ServiceRegistry({ Alpha: SAMPLE })
    const updated: ServiceConfig = { ...SAMPLE, estimatedCost: 0.99 }
    r.register("Alpha", updated)
    expect(r.get("Alpha")!.estimatedCost).toBe(0.99)
    expect(r.size).toBe(1) // no duplicate entry
  })

  test("returns this for fluent chaining", () => {
    const r = new ServiceRegistry()
    const result = r.register("A", SAMPLE).register("B", SAMPLE_B)
    expect(result).toBe(r)
    expect(r.size).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// unregister
// ---------------------------------------------------------------------------

describe("ServiceRegistry — unregister", () => {
  test("removes an existing service and returns true", () => {
    const r = new ServiceRegistry({ Alpha: SAMPLE })
    expect(r.unregister("Alpha")).toBe(true)
    expect(r.has("Alpha")).toBe(false)
    expect(r.size).toBe(0)
  })

  test("returns false when service was not registered", () => {
    const r = new ServiceRegistry()
    expect(r.unregister("NonExistent")).toBe(false)
  })

  test("get returns undefined after unregister", () => {
    const r = new ServiceRegistry({ Alpha: SAMPLE })
    r.unregister("Alpha")
    expect(r.get("Alpha")).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

describe("ServiceRegistry — get", () => {
  test("returns the config for a registered service", () => {
    const r = new ServiceRegistry({ Alpha: SAMPLE })
    expect(r.get("Alpha")).toEqual(SAMPLE)
  })

  test("returns undefined for an unregistered service", () => {
    const r = new ServiceRegistry()
    expect(r.get("Unknown")).toBeUndefined()
  })

  test("returned config is the same object reference stored", () => {
    const r = new ServiceRegistry()
    r.register("X", SAMPLE)
    expect(r.get("X")).toBe(SAMPLE)
  })
})

// ---------------------------------------------------------------------------
// has
// ---------------------------------------------------------------------------

describe("ServiceRegistry — has", () => {
  test("returns true for registered service", () => {
    const r = new ServiceRegistry({ Alpha: SAMPLE })
    expect(r.has("Alpha")).toBe(true)
  })

  test("returns false for unregistered service", () => {
    const r = new ServiceRegistry()
    expect(r.has("Alpha")).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// entries
// ---------------------------------------------------------------------------

describe("ServiceRegistry — entries", () => {
  test("iterates over all [name, config] pairs", () => {
    const r = new ServiceRegistry({ Alpha: SAMPLE, Beta: SAMPLE_B })
    const collected = Array.from(r.entries())
    expect(collected).toHaveLength(2)
    const names = collected.map(([n]) => n)
    expect(names).toContain("Alpha")
    expect(names).toContain("Beta")
  })

  test("returns an empty iterator when registry is empty", () => {
    const r = new ServiceRegistry()
    expect(Array.from(r.entries())).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// names
// ---------------------------------------------------------------------------

describe("ServiceRegistry — names", () => {
  test("returns sorted service names", () => {
    const r = new ServiceRegistry({ Zeta: SAMPLE, Alpha: SAMPLE_B, Mu: SAMPLE })
    expect(r.names()).toEqual(["Alpha", "Mu", "Zeta"])
  })

  test("returns empty array for empty registry", () => {
    expect(new ServiceRegistry().names()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// size
// ---------------------------------------------------------------------------

describe("ServiceRegistry — size", () => {
  test("reflects current number of registered services", () => {
    const r = new ServiceRegistry()
    expect(r.size).toBe(0)
    r.register("A", SAMPLE)
    expect(r.size).toBe(1)
    r.register("B", SAMPLE_B)
    expect(r.size).toBe(2)
    r.unregister("A")
    expect(r.size).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// clone
// ---------------------------------------------------------------------------

describe("ServiceRegistry — clone", () => {
  test("clone has same entries as original", () => {
    const r = new ServiceRegistry({ Alpha: SAMPLE, Beta: SAMPLE_B })
    const c = r.clone()
    expect(c.size).toBe(2)
    expect(c.get("Alpha")).toEqual(SAMPLE)
  })

  test("registering on clone does not affect original", () => {
    const r = new ServiceRegistry({ Alpha: SAMPLE })
    const c = r.clone()
    c.register("Beta", SAMPLE_B)
    expect(r.has("Beta")).toBe(false)
    expect(r.size).toBe(1)
  })

  test("unregistering on original does not affect clone", () => {
    const r = new ServiceRegistry({ Alpha: SAMPLE })
    const c = r.clone()
    r.unregister("Alpha")
    expect(c.has("Alpha")).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// defaultRegistry
// ---------------------------------------------------------------------------

describe("defaultRegistry — built-in services", () => {
  test("contains all 24 built-in services", () => {
    expect(defaultRegistry.size).toBe(24)
  })

  test("contains all Research & Web services", () => {
    expect(defaultRegistry.has("Firecrawl")).toBe(true)
    expect(defaultRegistry.has("Minifetch")).toBe(true)
  })

  test("contains all Market & News services", () => {
    expect(defaultRegistry.has("GloriaAI")).toBe(true)
    expect(defaultRegistry.has("BlackSwan")).toBe(true)
    expect(defaultRegistry.has("Moltbook")).toBe(true)
  })

  test("contains all Crypto & DeFi services", () => {
    for (const s of [
      "SLAMai_Signals",
      "SLAMai_WalletIntel",
      "AdExAURA_Portfolio",
      "AdExAURA_DefiPositions",
      "DappLooker"
    ]) {
      expect(defaultRegistry.has(s)).toBe(true)
    }
  })

  test("contains all AI & Media services", () => {
    for (const s of [
      "AiMoNetwork_LLM",
      "AiMoNetwork_Market",
      "Imference",
      "DaydreamsRouter",
      "dTelecomSTT"
    ]) {
      expect(defaultRegistry.has(s)).toBe(true)
    }
  })

  test("contains all Security & Compliance services", () => {
    for (const s of [
      "Cybercentry_URL",
      "Cybercentry_IP",
      "MerchantGuard_Score",
      "MerchantGuard_Scan",
      "MerchantGuard_MysteryShop",
      "TrustaAI"
    ]) {
      expect(defaultRegistry.has(s)).toBe(true)
    }
  })

  test("contains all Storage & Content services", () => {
    for (const s of ["PinataIPFS_Upload", "PinataIPFS_Get"]) {
      expect(defaultRegistry.has(s)).toBe(true)
    }
  })

  test("contains all Utility services", () => {
    expect(defaultRegistry.has("Utility10")).toBe(true)
  })

  test("each built-in service has a valid url, positive estimatedCost, and non-empty description", () => {
    for (const [name, config] of defaultRegistry.entries()) {
      expect(config.url).toMatch(/^https?:\/\//)
      expect(config.estimatedCost).toBeGreaterThan(0)
      expect(config.description.length).toBeGreaterThan(0)
      _ = name // silence unused-var lint
    }
  })
})

// silence the unused `name` variable in the loop above
let _: unknown
