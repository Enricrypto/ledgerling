import { jest } from "@jest/globals"
import {
  estimateExecution,
  executeSteps,
  checkServiceHealth,
  type FetchFn,
} from "./orchestrator.js"
import { defaultRegistry, ServiceRegistry } from "../registry/serviceRegistry.js"
import type { TaskStep } from "../classifier/classifier.js"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStep(service: string, extra: Partial<TaskStep> = {}): TaskStep {
  return {
    capability: "Research & Web",
    service,
    query: { input: "test" },
    ...extra,
  }
}

function makeFetchFn(
  overrides: Record<string, Partial<{ success: boolean; result: any; cost: number; error: string }>> = {},
  defaultCost = 0.01
): FetchFn {
  return async (_url, _opts) => {
    // derive service from URL by matching registry entries
    const matchedService = Array.from(defaultRegistry.entries()).find(([, cfg]) => _url === cfg.url)?.[0]
    const override = matchedService ? overrides[matchedService] : undefined
    if (override) {
      return {
        success: override.success ?? true,
        result: override.result ?? { data: "ok" },
        cost: override.cost ?? defaultCost,
        error: override.error,
      }
    }
    return { success: true, result: { data: "ok" }, cost: defaultCost }
  }
}

// ---------------------------------------------------------------------------
// checkServiceHealth
// ---------------------------------------------------------------------------

describe("checkServiceHealth", () => {
  beforeEach(() => {
    // Replace global fetch for all health check tests
    ;(global as any).fetch = jest.fn()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test("returns true for known service returning 402 (service alive, payment required)", async () => {
    ;(global.fetch as any).mockResolvedValue({ status: 402 })
    expect(await checkServiceHealth("Firecrawl")).toBe(true)
  })

  test("returns true for 200 response", async () => {
    ;(global.fetch as any).mockResolvedValue({ status: 200 })
    expect(await checkServiceHealth("GloriaAI")).toBe(true)
  })

  test("returns false for 500 response", async () => {
    ;(global.fetch as any).mockResolvedValue({ status: 500 })
    expect(await checkServiceHealth("Firecrawl")).toBe(false)
  })

  test("returns false when fetch throws (connection error)", async () => {
    ;(global.fetch as any).mockRejectedValue(new Error("ECONNREFUSED"))
    expect(await checkServiceHealth("SLAMai_Signals")).toBe(false)
  })

  test("returns true for unknown service (optimistic default)", async () => {
    expect(await checkServiceHealth("NonExistentService")).toBe(true)
  })

  test("uses HEAD method for non-charging preflight", async () => {
    ;(global.fetch as any).mockResolvedValue({ status: 402 })
    await checkServiceHealth("Firecrawl")
    expect((global.fetch as any).mock.calls[0][1]).toMatchObject({ method: "HEAD" })
  })
})

// ---------------------------------------------------------------------------
// estimateExecution — no steps
// ---------------------------------------------------------------------------

describe("estimateExecution — empty steps", () => {
  test("returns zero-cost estimation for empty steps array", async () => {
    const est = await estimateExecution([])
    expect(est.steps).toHaveLength(0)
    expect(est.estimatedTotalCost).toBe(0)
    expect(est.stepCosts).toHaveLength(0)
    expect(est.healthy).toBe(true)
    expect(est.unavailableServices).toHaveLength(0)
    expect(est.uxSummary).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// estimateExecution — cost and structure
// ---------------------------------------------------------------------------

describe("estimateExecution — cost calculation", () => {
  beforeEach(() => {
    // Mock all health checks as healthy
    ;(global as any).fetch = (jest.fn() as any).mockResolvedValue({ status: 402 })
  })

  test("sums stepCosts correctly for single step", async () => {
    const steps = [makeStep("Firecrawl")]
    const est = await estimateExecution(steps)
    expect(est.stepCosts).toHaveLength(1)
    expect(est.stepCosts[0]).toBe(defaultRegistry.get("Firecrawl")!.estimatedCost)
    expect(est.estimatedTotalCost).toBeCloseTo(defaultRegistry.get("Firecrawl")!.estimatedCost)
  })

  test("sums stepCosts correctly for multiple steps", async () => {
    const steps = [makeStep("Firecrawl"), makeStep("GloriaAI"), makeStep("SLAMai_Signals")]
    const est = await estimateExecution(steps)
    const expected =
      defaultRegistry.get("Firecrawl")!.estimatedCost +
      defaultRegistry.get("GloriaAI")!.estimatedCost +
      defaultRegistry.get("SLAMai_Signals")!.estimatedCost
    expect(est.estimatedTotalCost).toBeCloseTo(expected)
    expect(est.stepCosts).toHaveLength(3)
  })

  test("uses default cost for unknown service", async () => {
    const steps = [makeStep("UnknownService")]
    const est = await estimateExecution(steps)
    expect(est.stepCosts[0]).toBe(0.01)
  })
})

// ---------------------------------------------------------------------------
// estimateExecution — health checks
// ---------------------------------------------------------------------------

describe("estimateExecution — health checks", () => {
  test("marks services down when fetch throws", async () => {
    ;(global as any).fetch = (jest.fn() as any).mockRejectedValue(new Error("ECONNREFUSED"))
    const steps = [makeStep("Firecrawl"), makeStep("GloriaAI")]
    const est = await estimateExecution(steps)
    expect(est.healthy).toBe(false)
    expect(est.unavailableServices).toContain("Firecrawl")
    expect(est.unavailableServices).toContain("GloriaAI")
  })

  test("marks services healthy when fetch returns 402", async () => {
    ;(global as any).fetch = (jest.fn() as any).mockResolvedValue({ status: 402 })
    const steps = [makeStep("Firecrawl"), makeStep("GloriaAI")]
    const est = await estimateExecution(steps)
    expect(est.healthy).toBe(true)
    expect(est.unavailableServices).toHaveLength(0)
  })

  test("healthy=false triggers a warning in uxSummary", async () => {
    ;(global as any).fetch = (jest.fn() as any).mockRejectedValue(new Error("down"))
    const est = await estimateExecution([makeStep("Firecrawl")])
    expect(est.warnings.some((w) => w.includes("unreachable"))).toBe(true)
    expect(est.uxSummary).toContain("⚠")
  })
})

// ---------------------------------------------------------------------------
// estimateExecution — warnings
// ---------------------------------------------------------------------------

describe("estimateExecution — warnings", () => {
  beforeEach(() => {
    ;(global as any).fetch = (jest.fn() as any).mockResolvedValue({ status: 402 })
  })

  test("warns when estimated cost exceeds $0.10", async () => {
    // Imference ($0.05) + AiMoNetwork_LLM ($0.03) + Cybercentry_URL ($0.03) = $0.11 > $0.10
    const steps = [makeStep("Imference"), makeStep("AiMoNetwork_LLM"), makeStep("Cybercentry_URL")]
    const est = await estimateExecution(steps)
    expect(est.warnings.some((w) => w.includes("$0.10"))).toBe(true)
  })

  test("no cost warning when total is under $0.10", async () => {
    const steps = [makeStep("Minifetch")] // $0.0050
    const est = await estimateExecution(steps)
    expect(est.warnings.some((w) => w.includes("$0.10"))).toBe(false)
  })

  test("warns when more than 3 steps (sequential halt risk)", async () => {
    const steps = [
      makeStep("Firecrawl"),
      makeStep("GloriaAI"),
      makeStep("SLAMai_Signals"),
      makeStep("Minifetch"),
    ]
    const est = await estimateExecution(steps)
    expect(est.warnings.some((w) => w.includes("sequentially"))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// estimateExecution — UX summary content
// ---------------------------------------------------------------------------

describe("estimateExecution — uxSummary content", () => {
  beforeEach(() => {
    ;(global as any).fetch = (jest.fn() as any).mockResolvedValue({ status: 402 })
  })

  test("uxSummary contains service names", async () => {
    const est = await estimateExecution([makeStep("Firecrawl"), makeStep("GloriaAI")])
    expect(est.uxSummary).toContain("Firecrawl")
    expect(est.uxSummary).toContain("GloriaAI")
  })

  test("uxSummary contains estimated total", async () => {
    const est = await estimateExecution([makeStep("Firecrawl")])
    expect(est.uxSummary).toContain("Estimated total")
    expect(est.uxSummary).toContain("$")
  })

  test("uxSummary mentions step count", async () => {
    const est = await estimateExecution([makeStep("Firecrawl"), makeStep("SLAMai_Signals")])
    expect(est.uxSummary).toContain("2 steps")
  })

  test("uxSummary uses singular when one step", async () => {
    const est = await estimateExecution([makeStep("Firecrawl")])
    expect(est.uxSummary).toContain("1 step")
    expect(est.uxSummary).not.toContain("1 steps")
  })
})

// ---------------------------------------------------------------------------
// executeSteps — guard clauses
// ---------------------------------------------------------------------------

describe("executeSteps — guard clauses", () => {
  test("returns failure for empty steps array", async () => {
    const fetchFn = jest.fn() as unknown as FetchFn
    const result = await executeSteps([], fetchFn)
    expect(result.success).toBe(false)
    expect(result.results).toHaveLength(0)
    expect(result.totalCost).toBe(0)
    expect(result.uxMessage).toBeTruthy()
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// executeSteps — all steps succeed
// ---------------------------------------------------------------------------

describe("executeSteps — all steps succeed", () => {
  test("returns success=true with all results", async () => {
    const steps = [makeStep("Firecrawl"), makeStep("GloriaAI")]
    const fetchFn = makeFetchFn({}, 0.01)
    const result = await executeSteps(steps, fetchFn)

    expect(result.success).toBe(true)
    expect(result.results).toHaveLength(2)
    expect(result.errorMessage).toBeUndefined()
    expect(result.failedStep).toBeUndefined()
  })

  test("accumulates totalCost from all steps", async () => {
    const steps = [makeStep("Firecrawl"), makeStep("GloriaAI")]
    const fetchFn = makeFetchFn({}, 0.05)
    const result = await executeSteps(steps, fetchFn)

    expect(result.totalCost).toBeCloseTo(0.10)
  })

  test("uxMessage mentions step count and total cost", async () => {
    const steps = [makeStep("Firecrawl"), makeStep("GloriaAI")]
    const result = await executeSteps(steps, makeFetchFn({}, 0.01))

    expect(result.uxMessage).toContain("2 steps")
    expect(result.uxMessage).toContain("$")
  })

  test("uxMessage uses singular for one step", async () => {
    const result = await executeSteps([makeStep("Firecrawl")], makeFetchFn({}, 0.01))
    expect(result.uxMessage).toContain("1 step")
    expect(result.uxMessage).not.toContain("1 steps")
  })

  test("passes POST method and JSON body to fetchFn", async () => {
    const calls: Array<[string, RequestInit | undefined]> = []
    const fetchFn: FetchFn = async (url, opts) => {
      calls.push([url, opts])
      return { success: true, result: {}, cost: 0.01 }
    }
    const step = makeStep("Firecrawl", { query: { url: "https://example.com" } })
    await executeSteps([step], fetchFn)

    expect(calls).toHaveLength(1)
    expect(calls[0][1]?.method).toBe("POST")
    expect(calls[0][1]?.headers).toMatchObject({ "Content-Type": "application/json" })
    expect(JSON.parse(calls[0][1]?.body as string)).toMatchObject({ url: "https://example.com" })
  })

  test("uses registry URL for known services", async () => {
    const calledUrls: string[] = []
    const fetchFn: FetchFn = async (url) => {
      calledUrls.push(url)
      return { success: true, result: {}, cost: 0.01 }
    }
    await executeSteps([makeStep("Firecrawl")], fetchFn)
    expect(calledUrls[0]).toBe(defaultRegistry.get("Firecrawl")!.url)
  })

  test("uses fallback URL for unknown services", async () => {
    const calledUrls: string[] = []
    const fetchFn: FetchFn = async (url) => {
      calledUrls.push(url)
      return { success: true, result: {}, cost: 0.01 }
    }
    await executeSteps([makeStep("UnknownService")], fetchFn)
    expect(calledUrls[0]).toContain("unknownservice")
  })
})

// ---------------------------------------------------------------------------
// executeSteps — first step fails
// ---------------------------------------------------------------------------

describe("executeSteps — first step fails", () => {
  test("returns success=false with failedStep set", async () => {
    const steps = [makeStep("Firecrawl"), makeStep("GloriaAI")]
    const fetchFn = makeFetchFn({ Firecrawl: { success: false, error: "timeout" } })
    const result = await executeSteps(steps, fetchFn)

    expect(result.success).toBe(false)
    expect(result.failedStep?.service).toBe("Firecrawl")
    expect(result.errorMessage).toBeTruthy()
  })

  test("totalCost is 0 when first step fails", async () => {
    const fetchFn = makeFetchFn({ Firecrawl: { success: false } })
    const result = await executeSteps([makeStep("Firecrawl")], fetchFn)
    expect(result.totalCost).toBe(0)
  })

  test("results array is empty when first step fails", async () => {
    const fetchFn = makeFetchFn({ Firecrawl: { success: false } })
    const result = await executeSteps([makeStep("Firecrawl"), makeStep("GloriaAI")], fetchFn)
    expect(result.results).toHaveLength(0)
  })

  test("uxMessage mentions no charges on first-step failure", async () => {
    const fetchFn = makeFetchFn({ Firecrawl: { success: false } })
    const result = await executeSteps([makeStep("Firecrawl"), makeStep("GloriaAI")], fetchFn)
    expect(result.uxMessage).toContain("No charges")
  })

  test("second service is never called when first fails", async () => {
    const called: string[] = []
    const fetchFn: FetchFn = async (url) => {
      called.push(url)
      if (url === defaultRegistry.get("Firecrawl")!.url)
        return { success: false, error: "down", result: undefined }
      return { success: true, result: {}, cost: 0.01 }
    }
    await executeSteps([makeStep("Firecrawl"), makeStep("GloriaAI")], fetchFn)
    expect(called).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// executeSteps — middle step fails (atomic semantics)
// ---------------------------------------------------------------------------

describe("executeSteps — middle step fails (atomic semantics)", () => {
  test("returns results from completed steps before the failure", async () => {
    const steps = [makeStep("Firecrawl"), makeStep("GloriaAI"), makeStep("SLAMai_Signals")]
    const fetchFn = makeFetchFn({
      GloriaAI: { success: false, error: "Service unavailable" },
    }, 0.01)
    const result = await executeSteps(steps, fetchFn)

    expect(result.success).toBe(false)
    expect(result.results).toHaveLength(1) // Only Firecrawl succeeded
    expect(result.failedStep?.service).toBe("GloriaAI")
  })

  test("totalCost reflects only successful steps before failure", async () => {
    const steps = [makeStep("Firecrawl"), makeStep("GloriaAI"), makeStep("SLAMai_Signals")]
    const fetchFn = makeFetchFn({
      GloriaAI: { success: false },
    }, 0.05)
    const result = await executeSteps(steps, fetchFn)

    expect(result.totalCost).toBeCloseTo(0.05) // only Firecrawl's cost
  })

  test("uxMessage warns about prior charges when a middle step fails", async () => {
    const steps = [makeStep("Firecrawl"), makeStep("GloriaAI")]
    const fetchFn = makeFetchFn({
      GloriaAI: { success: false, error: "503" },
    }, 0.02)
    const result = await executeSteps(steps, fetchFn)

    expect(result.uxMessage).toContain("non-reversible")
    expect(result.uxMessage).toContain("$")
  })

  test("third step never runs when second fails", async () => {
    const called: string[] = []
    const fetchFn: FetchFn = async (url) => {
      called.push(url)
      if (url === defaultRegistry.get("GloriaAI")!.url)
        return { success: false, error: "down", result: undefined }
      return { success: true, result: {}, cost: 0.01 }
    }
    const steps = [makeStep("Firecrawl"), makeStep("GloriaAI"), makeStep("SLAMai_Signals")]
    await executeSteps(steps, fetchFn)
    expect(called).toHaveLength(2) // Firecrawl + GloriaAI; SLAMai_Signals never called
  })
})

// ---------------------------------------------------------------------------
// executeSteps — errorMessage fallback
// ---------------------------------------------------------------------------

describe("executeSteps — errorMessage fallback", () => {
  test("provides fallback errorMessage when service returns no error string", async () => {
    const fetchFn: FetchFn = async () => ({ success: false, result: undefined })
    const result = await executeSteps([makeStep("Firecrawl")], fetchFn)
    expect(result.errorMessage).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// OrchestratorResult shape invariants
// ---------------------------------------------------------------------------

describe("OrchestratorResult shape invariants", () => {
  test("success result always has results array and totalCost", async () => {
    const result = await executeSteps([makeStep("Firecrawl")], makeFetchFn({}, 0.01))
    expect(Array.isArray(result.results)).toBe(true)
    expect(typeof result.totalCost).toBe("number")
  })

  test("failure result always has results array and totalCost", async () => {
    const fetchFn = makeFetchFn({ Firecrawl: { success: false } })
    const result = await executeSteps([makeStep("Firecrawl")], fetchFn)
    expect(Array.isArray(result.results)).toBe(true)
    expect(typeof result.totalCost).toBe("number")
  })

  test("uxMessage is always a non-empty string", async () => {
    const successResult = await executeSteps([makeStep("Firecrawl")], makeFetchFn({}, 0.01))
    expect(typeof successResult.uxMessage).toBe("string")
    expect(successResult.uxMessage.length).toBeGreaterThan(0)

    const failResult = await executeSteps([], jest.fn() as unknown as FetchFn)
    expect(typeof failResult.uxMessage).toBe("string")
    expect(failResult.uxMessage.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// OrchestratorEstimation shape invariants
// ---------------------------------------------------------------------------

describe("OrchestratorEstimation shape invariants", () => {
  beforeEach(() => {
    ;(global as any).fetch = (jest.fn() as any).mockResolvedValue({ status: 402 })
  })

  test("stepCosts length equals steps length", async () => {
    const steps = [makeStep("Firecrawl"), makeStep("GloriaAI")]
    const est = await estimateExecution(steps)
    expect(est.stepCosts).toHaveLength(steps.length)
  })

  test("uxSummary is always a non-empty string", async () => {
    const est = await estimateExecution([makeStep("Firecrawl")])
    expect(typeof est.uxSummary).toBe("string")
    expect(est.uxSummary.length).toBeGreaterThan(0)
  })

  test("warnings is always an array", async () => {
    const est = await estimateExecution([makeStep("Firecrawl")])
    expect(Array.isArray(est.warnings)).toBe(true)
  })

  test("unavailableServices is always an array", async () => {
    const est = await estimateExecution([makeStep("Firecrawl")])
    expect(Array.isArray(est.unavailableServices)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Custom registry injection
// ---------------------------------------------------------------------------

describe("custom registry injection", () => {
  const CUSTOM_URL = "https://api.custom-service.io/v1/run"

  function makeCustomRegistry() {
    return new ServiceRegistry({
      CustomService: {
        url: CUSTOM_URL,
        estimatedCost: 0.07,
        description: "Custom test service",
        inputSchemaHint: { query: "Test input" },
        capability: "Utility",
        classification: { phrases: [], keywords: [] },
        buildQuery: (raw, _ctx) => ({ query: raw }),
      },
    })
  }

  beforeEach(() => {
    ;(global as any).fetch = (jest.fn() as any).mockResolvedValue({ status: 402 })
  })

  test("estimateExecution uses injected registry for cost lookup", async () => {
    const registry = makeCustomRegistry()
    const steps = [makeStep("CustomService")]
    const est = await estimateExecution(steps, registry)
    expect(est.stepCosts[0]).toBe(0.07)
    expect(est.estimatedTotalCost).toBeCloseTo(0.07)
  })

  test("estimateExecution uxSummary includes custom service description", async () => {
    const registry = makeCustomRegistry()
    const est = await estimateExecution([makeStep("CustomService")], registry)
    expect(est.uxSummary).toContain("Custom test service")
  })

  test("executeSteps calls the custom service URL from injected registry", async () => {
    const registry = makeCustomRegistry()
    const calledUrls: string[] = []
    const fetchFn: FetchFn = async (url) => {
      calledUrls.push(url)
      return { success: true, result: {}, cost: 0.07 }
    }
    await executeSteps([makeStep("CustomService")], fetchFn, { registry })
    expect(calledUrls[0]).toBe(CUSTOM_URL)
  })

  test("injected registry does not affect defaultRegistry", () => {
    const registry = makeCustomRegistry()
    expect(defaultRegistry.has("CustomService")).toBe(false)
    expect(registry.has("CustomService")).toBe(true)
  })

  test("service unknown to injected registry falls back to derived URL", async () => {
    const registry = makeCustomRegistry() // only has CustomService
    const calledUrls: string[] = []
    const fetchFn: FetchFn = async (url) => {
      calledUrls.push(url)
      return { success: true, result: {}, cost: 0.01 }
    }
    await executeSteps([makeStep("UnknownService")], fetchFn, { registry })
    expect(calledUrls[0]).toContain("unknownservice")
  })
})
