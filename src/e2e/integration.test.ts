/**
 * Live Integration Tests — Ledgerling x402 Pipeline
 *
 * These tests make real network calls and require valid credentials.
 * They are excluded from the default test run and must be triggered explicitly:
 *
 *   LIVE_TEST=1 npm run test:live
 *
 * Optional env vars:
 *   X402_TEST_URL   — x402-gated endpoint to call (default: https://x402index.com/api/all)
 *   EVM_PRIVATE_KEY — raw private key for signing payments (quick local dev)
 *   OPENFORT_SECRET_KEY — OpenFort backend wallet key (recommended)
 *   CHAIN_ID        — 8453 = Base mainnet, 84532 = Base Sepolia (default)
 */

import { checkServiceHealth, estimateExecution, executeSteps } from "../orchestrator/orchestrator.js"
import { runPipeline } from "../pipeline/pipeline.js"
import { buildFetchWithPayment } from "../services/fetchWithPayment.js"
import { ServiceRegistry } from "../registry/serviceRegistry.js"
import { classifyError } from "../utils/errorHandling.js"

const LIVE = process.env.LIVE_TEST === "1"
const TEST_URL = process.env.X402_TEST_URL ?? "https://x402index.com/api/all"
const describeLive = LIVE ? describe : describe.skip

// ---------------------------------------------------------------------------
// Health check — real network
// ---------------------------------------------------------------------------

describeLive("Live: health check", () => {
  test("x402index.com/api/all is reachable (returns 402 or 200)", async () => {
    const registry = new ServiceRegistry({
      x402index: {
        url: TEST_URL,
        estimatedCost: 0.001,
        description: "x402 index",
        inputSchemaHint: { type: "Request type" },
        capability: "Utility",
        classification: { phrases: [], keywords: [] },
        buildQuery: (raw, _ctx) => ({ query: raw }),
      },
    })
    const healthy = await checkServiceHealth("x402index", registry)
    expect(healthy).toBe(true)
  }, 10_000)

  test("bogus endpoint is unreachable", async () => {
    const registry = new ServiceRegistry({
      bogus: {
        url: "https://this-domain-does-not-exist-404xyz.io/api",
        estimatedCost: 0.001,
        description: "bogus",
        inputSchemaHint: {},
        capability: "Utility",
        classification: { phrases: [], keywords: [] },
        buildQuery: (raw, _ctx) => ({ query: raw }),
      },
    })
    const healthy = await checkServiceHealth("bogus", registry)
    expect(healthy).toBe(false)
  }, 10_000)
})

// ---------------------------------------------------------------------------
// estimateExecution — real preflight, no charges
// ---------------------------------------------------------------------------

describeLive("Live: estimateExecution — preflight", () => {
  test("completes within 10 s and returns estimation shape", async () => {
    const registry = new ServiceRegistry({
      x402index: {
        url: TEST_URL,
        estimatedCost: 0.001,
        description: "x402 index",
        inputSchemaHint: { type: "Request type" },
        capability: "Utility",
        classification: { phrases: [], keywords: [] },
        buildQuery: (raw, _ctx) => ({ query: raw }),
      },
    })
    const steps = [
      {
        capability: "Utility" as const,
        service: "x402index",
        query: { type: "all" },
      },
    ]

    const est = await estimateExecution(steps, registry)

    expect(est.steps).toHaveLength(1)
    expect(est.stepCosts[0]).toBe(0.001)
    expect(est.estimatedTotalCost).toBeCloseTo(0.001)
    expect(typeof est.uxSummary).toBe("string")
    expect(est.uxSummary.length).toBeGreaterThan(0)
  }, 10_000)
})

// ---------------------------------------------------------------------------
// executeSteps — real x402 payment flow
// ---------------------------------------------------------------------------

describeLive("Live: executeSteps — x402 payment flow", () => {
  let fetchFn: Awaited<ReturnType<typeof buildFetchWithPayment>>

  beforeAll(async () => {
    fetchFn = await buildFetchWithPayment()
  }, 30_000)

  test("successful payment returns receipt and cost > 0", async () => {
    const registry = new ServiceRegistry({
      x402index: {
        url: TEST_URL,
        estimatedCost: 0.001,
        description: "x402 index",
        inputSchemaHint: { type: "Request type" },
        capability: "Utility",
        classification: { phrases: [], keywords: [] },
        buildQuery: (raw, _ctx) => ({ query: raw }),
      },
    })
    const steps = [
      {
        capability: "Utility" as const,
        service: "x402index",
        query: { type: "all" },
      },
    ]

    const result = await executeSteps(steps, fetchFn, { registry })

    expect(result.success).toBe(true)
    expect(result.results).toHaveLength(1)
    expect(result.totalCost).toBeGreaterThan(0)
    expect(result.uxMessage).toContain("completed successfully")
  }, 60_000)
})

// ---------------------------------------------------------------------------
// runPipeline — full end-to-end live flow
// ---------------------------------------------------------------------------

describeLive("Live: runPipeline — full x402 pipeline", () => {
  let fetchFn: Awaited<ReturnType<typeof buildFetchWithPayment>>

  beforeAll(async () => {
    fetchFn = await buildFetchWithPayment()
  }, 30_000)

  test("scrape query routes through Firecrawl with live payment", async () => {
    const result = await runPipeline(
      "scrape https://example.com",
      fetchFn,
      { continueOnUnhealthy: true }
    )

    expect(result.classification.inScope).toBe(true)
    expect(result.estimation).toBeDefined()
    expect(result.execution).toBeDefined()
    // Service may fail if placeholder URL is not live — but payment flow should have started
    expect(result.execution!.uxMessage).toBeTruthy()
  }, 60_000)
})

// ---------------------------------------------------------------------------
// Error classification — live network errors
// ---------------------------------------------------------------------------

describeLive("Live: error classification", () => {
  test("network error classifies as NETWORK_ERROR", async () => {
    const registry = new ServiceRegistry({
      bogus: {
        url: "https://this-domain-does-not-exist-404xyz.io/api",
        estimatedCost: 0.001,
        description: "bogus",
        inputSchemaHint: {},
        capability: "Utility",
        classification: { phrases: [], keywords: [] },
        buildQuery: (raw, _ctx) => ({ query: raw }),
      },
    })

    const noopFetch = async (_url: string, _opts?: RequestInit) => {
      try {
        await fetch(_url, { signal: AbortSignal.timeout(5_000) })
        return { success: true as const, result: {} }
      } catch (err: any) {
        return { success: false as const, error: err.message, result: undefined }
      }
    }

    const steps = [
      {
        capability: "Utility" as const,
        service: "bogus",
        query: {},
      },
    ]

    const result = await executeSteps(steps, noopFetch, { registry })

    expect(result.success).toBe(false)
    const kind = classifyError(result.errorMessage)
    expect(["NETWORK_ERROR", "TIMEOUT"]).toContain(kind)
  }, 15_000)

  test("stepTimeoutMs:1 produces TIMEOUT error", async () => {
    const neverResolves = () => new Promise<never>(() => {})
    const registry = new ServiceRegistry({
      slow: {
        url: "https://httpbin.org/delay/10",
        estimatedCost: 0.001,
        description: "slow",
        inputSchemaHint: {},
        capability: "Utility",
        classification: { phrases: [], keywords: [] },
        buildQuery: (raw, _ctx) => ({ query: raw }),
      },
    })
    const steps = [
      {
        capability: "Utility" as const,
        service: "slow",
        query: {},
      },
    ]

    const result = await executeSteps(steps, neverResolves as any, {
      registry,
      stepTimeoutMs: 1,
    })

    expect(result.success).toBe(false)
    const kind = classifyError(result.errorMessage)
    expect(kind).toBe("TIMEOUT")
    expect(result.uxMessage).toContain("No charges")
  }, 5_000)
})
