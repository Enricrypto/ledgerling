import { jest } from "@jest/globals";
import {
  runPipeline,
  type PipelineOptions,
  type PipelineResult,
} from "./pipeline.js";
import { type FetchFn } from "../orchestrator/orchestrator.js";
import {
  defaultRegistry,
  ServiceRegistry,
} from "../registry/serviceRegistry.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A fetchFn that always succeeds with a configurable cost. */
function successFetch(cost = 0.01): FetchFn {
  return async () => ({ success: true, result: { data: "ok" }, cost });
}

/** A fetchFn that always fails with the given error. */
function failFetch(error = "Service unavailable"): FetchFn {
  return async () => ({ success: false, error, result: undefined });
}

/** A query that maps to at least one known service (Firecrawl). */
const SUPPORTED_QUERY = "scrape https://example.com";

/** A query that has no matching services. */
const UNSUPPORTED_QUERY = "book me a flight to Paris";

beforeEach(() => {
  // Health checks use global.fetch for HEAD requests
  (global as any).fetch = (jest.fn() as any).mockResolvedValue({ status: 402 });
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Out-of-scope query
// ---------------------------------------------------------------------------

describe("runPipeline — out-of-scope query", () => {
  test("returns abortedReason without estimation or execution", async () => {
    const result = await runPipeline(UNSUPPORTED_QUERY, successFetch());
    expect(result.abortedReason).toBeTruthy();
    expect(result.estimation).toBeUndefined();
    expect(result.execution).toBeUndefined();
  });

  test("classification.inScope is false", async () => {
    const result = await runPipeline(UNSUPPORTED_QUERY, successFetch());
    expect(result.classification.inScope).toBe(false);
  });

  test("query is echoed back in result", async () => {
    const result = await runPipeline(UNSUPPORTED_QUERY, successFetch());
    expect(result.query).toBe(UNSUPPORTED_QUERY);
  });

  test("fetchFn is never called for out-of-scope query", async () => {
    const mockFetch = jest.fn();
    await runPipeline(UNSUPPORTED_QUERY, mockFetch as unknown as FetchFn);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// dryRun
// ---------------------------------------------------------------------------

describe("runPipeline — dryRun", () => {
  test("estimation is present but execution is absent", async () => {
    const result = await runPipeline(SUPPORTED_QUERY, successFetch(), {
      dryRun: true,
    });
    expect(result.estimation).toBeDefined();
    expect(result.execution).toBeUndefined();
    expect(result.dryRun).toBe(true);
  });

  test("fetchFn is never called during dryRun", async () => {
    const mockFetch = jest.fn();
    await runPipeline(SUPPORTED_QUERY, mockFetch as unknown as FetchFn, {
      dryRun: true,
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("estimation has correct step count", async () => {
    const result = await runPipeline(SUPPORTED_QUERY, successFetch(), {
      dryRun: true,
    });
    expect(result.estimation!.steps.length).toBeGreaterThan(0);
    expect(result.estimation!.stepCosts.length).toBe(
      result.estimation!.steps.length,
    );
  });
});

// ---------------------------------------------------------------------------
// Unhealthy service — default behaviour (abort)
// ---------------------------------------------------------------------------

describe("runPipeline — unhealthy service", () => {
  beforeEach(() => {
    // Simulate all services down
    (global as any).fetch = (jest.fn() as any).mockRejectedValue(
      new Error("ECONNREFUSED"),
    );
  });

  test("aborts with abortedReason containing the unavailable service name", async () => {
    const result = await runPipeline(SUPPORTED_QUERY, successFetch());
    expect(result.abortedReason).toBeTruthy();
    expect(result.estimation?.healthy).toBe(false);
    expect(result.execution).toBeUndefined();
  });

  test("abortedReason mentions the unavailable services", async () => {
    const result = await runPipeline(SUPPORTED_QUERY, successFetch());
    for (const svc of result.estimation!.unavailableServices) {
      expect(result.abortedReason).toContain(svc);
    }
  });

  test("continueOnUnhealthy:true proceeds despite unhealthy services", async () => {
    const result = await runPipeline(SUPPORTED_QUERY, successFetch(), {
      continueOnUnhealthy: true,
    });
    expect(result.execution).toBeDefined();
    expect(result.execution!.success).toBe(true);
    expect(result.abortedReason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Successful end-to-end run
// ---------------------------------------------------------------------------

describe("runPipeline — successful execution", () => {
  test("all pipeline fields are populated", async () => {
    const result = await runPipeline(SUPPORTED_QUERY, successFetch(0.02));
    expect(result.classification.inScope).toBe(true);
    expect(result.estimation).toBeDefined();
    expect(result.execution).toBeDefined();
    expect(result.execution!.success).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(result.abortedReason).toBeUndefined();
  });

  test("execution totalCost is accumulated across steps", async () => {
    const result = await runPipeline(SUPPORTED_QUERY, successFetch(0.05));
    const stepCount = result.classification.steps.length;
    expect(result.execution!.totalCost).toBeCloseTo(0.05 * stepCount);
  });

  test("execution.results length equals step count", async () => {
    const result = await runPipeline(SUPPORTED_QUERY, successFetch());
    expect(result.execution!.results.length).toBe(
      result.classification.steps.length,
    );
  });
});

// ---------------------------------------------------------------------------
// First-step failure
// ---------------------------------------------------------------------------

describe("runPipeline — first-step failure", () => {
  test("execution.success is false", async () => {
    const result = await runPipeline(SUPPORTED_QUERY, failFetch("503 gateway"));
    expect(result.execution).toBeDefined();
    expect(result.execution!.success).toBe(false);
  });

  test("execution.failedStep is set", async () => {
    const result = await runPipeline(SUPPORTED_QUERY, failFetch());
    expect(result.execution!.failedStep).toBeDefined();
  });

  test("uxMessage contains 'No charges' when first step fails", async () => {
    const result = await runPipeline(SUPPORTED_QUERY, failFetch());
    expect(result.execution!.uxMessage).toContain("No charges");
  });

  test("totalCost is 0 when first step fails", async () => {
    const result = await runPipeline(SUPPORTED_QUERY, failFetch());
    expect(result.execution!.totalCost).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Per-step timeout
// ---------------------------------------------------------------------------

describe("runPipeline — per-step timeout", () => {
  test("step times out and errorMessage reflects it", async () => {
    const neverResolves: FetchFn = () => new Promise(() => {}) as any;
    const result = await runPipeline(SUPPORTED_QUERY, neverResolves, {
      stepTimeoutMs: 50,
    });
    expect(result.execution).toBeDefined();
    expect(result.execution!.success).toBe(false);
    expect(result.execution!.errorMessage?.toLowerCase()).toMatch(
      /took too long|timeout/,
    );
  }, 3_000);

  test("no prior charges on timeout of first step", async () => {
    const neverResolves: FetchFn = () => new Promise(() => {}) as any;
    const result = await runPipeline(SUPPORTED_QUERY, neverResolves, {
      stepTimeoutMs: 50,
    });
    expect(result.execution!.totalCost).toBe(0);
    expect(result.execution!.uxMessage).toContain("No charges");
  }, 3_000);
});

// ---------------------------------------------------------------------------
// Custom registry
// ---------------------------------------------------------------------------

describe("runPipeline — custom registry", () => {
  test("uses injected registry for URL resolution", async () => {
    const CUSTOM_URL = "https://api.myservice.io/v1/run";
    const registry = new ServiceRegistry({
      Firecrawl: {
        url: CUSTOM_URL,
        estimatedCost: 0.03,
        description: "Custom Firecrawl override",
        inputSchemaHint: { url: "Target URL" },
        capability: "Research & Web",
        classification: {
          phrases: ["scrape", "crawl", "scrape the"],
          keywords: [],
        },
        buildQuery: (raw, ctx) => ({
          url: ctx.urls[0] ?? null,
          mode: "scrape",
          rawQuery: raw,
        }),
      },
    });

    const calledUrls: string[] = [];
    const fetchFn: FetchFn = async (url) => {
      calledUrls.push(url);
      return { success: true, result: {}, cost: 0.03 };
    };

    await runPipeline(SUPPORTED_QUERY, fetchFn, {
      registry,
      continueOnUnhealthy: true,
    });
    expect(calledUrls[0]).toBe(CUSTOM_URL);
  });
});

// ---------------------------------------------------------------------------
// PipelineResult shape invariants
// ---------------------------------------------------------------------------

describe("PipelineResult shape invariants", () => {
  test("query is always echoed", async () => {
    const r1 = await runPipeline(SUPPORTED_QUERY, successFetch());
    const r2 = await runPipeline(UNSUPPORTED_QUERY, successFetch());
    expect(r1.query).toBe(SUPPORTED_QUERY);
    expect(r2.query).toBe(UNSUPPORTED_QUERY);
  });

  test("classification is always present", async () => {
    const r1 = await runPipeline(SUPPORTED_QUERY, successFetch());
    const r2 = await runPipeline(UNSUPPORTED_QUERY, successFetch());
    expect(r1.classification).toBeDefined();
    expect(r2.classification).toBeDefined();
  });

  test("dryRun field matches the option passed", async () => {
    const r1 = await runPipeline(SUPPORTED_QUERY, successFetch(), {
      dryRun: true,
    });
    const r2 = await runPipeline(SUPPORTED_QUERY, successFetch(), {
      dryRun: false,
    });
    expect(r1.dryRun).toBe(true);
    expect(r2.dryRun).toBe(false);
  });
});
