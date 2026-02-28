import type { TaskStep } from "../classifier/classifier.js"
import type { FetchResult } from "../services/fetchWithPayment.js"
import { ServiceRegistry, defaultRegistry } from "../registry/serviceRegistry.js"
import { classifyError, uxMessageForError } from "../utils/errorHandling.js"

// Re-export so callers can import registry + error types from one place
export { ServiceRegistry, defaultRegistry } from "../registry/serviceRegistry.js"
export type { ServiceConfig } from "../registry/serviceRegistry.js"
export { classifyError, uxMessageForError } from "../utils/errorHandling.js"
export type { ErrorKind } from "../utils/errorHandling.js"

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Callable x402-payment-enabled fetch function produced by buildFetchWithPayment(). */
export type FetchFn = (url: string, options?: RequestInit) => Promise<FetchResult>

/** Preflight estimation result — returned before any charges are incurred. */
export interface OrchestratorEstimation {
  steps: TaskStep[]
  estimatedTotalCost: number
  stepCosts: number[]
  /** Human-readable pre-execution summary shown to the user before they approve. */
  uxSummary: string
  /** Any potential risks or warnings the user should know about. */
  warnings: string[]
  /** True if all services appear reachable. */
  healthy: boolean
  /** Names of services that failed the preflight health check. */
  unavailableServices: string[]
}

/** Final execution result — returned after all steps have run (or one has failed). */
export interface OrchestratorResult {
  success: boolean
  results: any[]
  totalCost: number
  failedStep?: TaskStep
  errorMessage?: string
  /** Human-readable post-execution message shown to the user. */
  uxMessage: string
}

/** Options for executeSteps(). */
export interface ExecuteOptions {
  /** Registry to resolve service URLs and costs. Defaults to defaultRegistry. */
  registry?: ServiceRegistry
  /**
   * Per-step timeout in milliseconds.
   * If a step's fetchFn call does not complete within this window, the step
   * fails with a TIMEOUT error and execution halts. Defaults to 30 000 ms.
   * Set to 0 to disable.
   */
  stepTimeoutMs?: number
}

const DEFAULT_ESTIMATED_COST = 0.0100
const DEFAULT_STEP_TIMEOUT_MS = 30_000

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

/**
 * Checks whether a service endpoint is reachable without triggering a payment.
 *
 * x402 semantics: a HEAD request to a 402-gated endpoint returns HTTP 402 with
 * payment details before any charge occurs. That 402 means the service IS alive.
 * A connection error or HTTP 5xx means the service is down.
 *
 * @param registry - Optional registry to look up the service URL. Defaults to defaultRegistry.
 */
export async function checkServiceHealth(
  serviceName: string,
  registry: ServiceRegistry = defaultRegistry
): Promise<boolean> {
  const config = registry.get(serviceName)
  if (!config) return true // Unknown service — optimistically assume healthy

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5_000)
  try {
    const response = await fetch(config.url, {
      method: "HEAD",
      signal: controller.signal,
    })
    // 200, 402, 4xx (wrong method etc.) → service is up; 5xx → service is down
    return response.status < 500
  } catch {
    return false // Connection refused / DNS failure / timeout
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// estimateExecution — preflight only, no charges
// ---------------------------------------------------------------------------

/**
 * Runs preflight health checks on all services and produces a human-readable
 * cost estimate. No HTTP payment is issued.
 *
 * @param registry - Optional registry to resolve service configs. Defaults to defaultRegistry.
 */
export async function estimateExecution(
  steps: TaskStep[],
  registry: ServiceRegistry = defaultRegistry
): Promise<OrchestratorEstimation> {
  if (!steps.length) {
    return {
      steps: [],
      estimatedTotalCost: 0,
      stepCosts: [],
      uxSummary: "No steps to execute.",
      warnings: [],
      healthy: true,
      unavailableServices: [],
    }
  }

  // Parallel health checks — fast, and x402's 402 response itself confirms liveness
  const healthResults = await Promise.all(
    steps.map(async (step) => ({
      service: step.service,
      healthy: await checkServiceHealth(step.service, registry),
    }))
  )
  const unavailableServices = healthResults.filter((r) => !r.healthy).map((r) => r.service)

  // Cost estimation using registry values (real cost confirmed by receipt after execution)
  const stepCosts = steps.map(
    (step) => registry.get(step.service)?.estimatedCost ?? DEFAULT_ESTIMATED_COST
  )
  const estimatedTotalCost = stepCosts.reduce((sum, c) => sum + c, 0)

  // Build warnings
  const warnings: string[] = []
  if (unavailableServices.length) {
    warnings.push(
      `The following services appear unreachable: ${unavailableServices.join(", ")}. Execution may fail.`
    )
  }
  if (estimatedTotalCost > 0.10) {
    warnings.push(
      `Estimated cost ($${estimatedTotalCost.toFixed(4)}) exceeds $0.10 — review before proceeding.`
    )
  }
  if (steps.length > 3) {
    warnings.push(
      `${steps.length} steps will execute sequentially. A failure in any step will halt execution.`
    )
  }

  // Human-readable summary
  const stepLines = steps
    .map((step, i) => {
      const config = registry.get(step.service)
      return `  ${i + 1}. ${step.service} — ${config?.description ?? step.capability} (~$${stepCosts[i].toFixed(4)})`
    })
    .join("\n")

  const warningBlock = warnings.length
    ? `\nWarnings:\n${warnings.map((w) => `  ⚠  ${w}`).join("\n")}`
    : ""

  const uxSummary = [
    `Ledgerling will execute ${steps.length} step${steps.length !== 1 ? "s" : ""}:`,
    stepLines,
    ``,
    `Estimated total: ~$${estimatedTotalCost.toFixed(4)} USD`,
    `(Actual cost is confirmed by x402 receipt after each step.)`,
    warningBlock,
  ]
    .filter((l) => l !== undefined)
    .join("\n")

  return {
    steps,
    estimatedTotalCost,
    stepCosts,
    uxSummary,
    warnings,
    healthy: unavailableServices.length === 0,
    unavailableServices,
  }
}

// ---------------------------------------------------------------------------
// executeSteps — atomic sequential execution
// ---------------------------------------------------------------------------

/**
 * Executes steps one-by-one using the x402-payment-enabled fetch function.
 *
 * Atomicity contract:
 *   If any step fails, execution halts immediately and the caller is informed
 *   of which step failed and how much was spent on prior successful steps.
 *   x402 payments are per-request and non-reversible; the UX message makes
 *   this clear so the user is never silently charged for partial work.
 *
 * @param options.registry      - Registry to resolve service URLs. Defaults to defaultRegistry.
 * @param options.stepTimeoutMs - Per-step timeout in ms. Defaults to 30 000. Set 0 to disable.
 */
export async function executeSteps(
  steps: TaskStep[],
  fetchFn: FetchFn,
  options: ExecuteOptions = {}
): Promise<OrchestratorResult> {
  const registry = options.registry ?? defaultRegistry
  const stepTimeoutMs = options.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS

  if (!steps.length) {
    return {
      success: false,
      results: [],
      totalCost: 0,
      errorMessage: "No steps provided.",
      uxMessage: "Nothing to execute — no steps were provided.",
    }
  }

  const results: any[] = []
  let totalCost = 0

  for (const step of steps) {
    const config = registry.get(step.service)
    const url = config?.url ?? `https://api.ledgerling.io/${step.service.toLowerCase()}`
    const stepNum = results.length + 1


    const fetchPromise = fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(step.query),
    })

    // Per-step timeout via Promise.race (timer is always cleared to avoid leaks)
    let stepTimerId: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise: Promise<FetchResult> =
      stepTimeoutMs > 0
        ? new Promise<FetchResult>((_, reject) => {
            stepTimerId = setTimeout(
              () => reject(new Error(`Step timed out after ${stepTimeoutMs}ms`)),
              stepTimeoutMs
            )
          })
        : new Promise(() => {}) // never resolves — effectively disables timeout

    let result: FetchResult
    try {
      result = await Promise.race([fetchPromise, timeoutPromise])
    } catch (err: any) {
      result = { success: false, error: err.message ?? "Unknown error" }
    } finally {
      if (stepTimerId !== undefined) clearTimeout(stepTimerId)
    }

    if (!result.success) {
      const errKind = classifyError(result.error)
      const uxErr = uxMessageForError(errKind, step.service)

      const chargeNotice =
        results.length > 0
          ? `Note: ${results.length} prior step${results.length !== 1 ? "s" : ""} succeeded and already incurred $${totalCost.toFixed(4)} in charges. x402 payments are non-reversible.`
          : "No charges were incurred before this failure."

      return {
        success: false,
        results,
        totalCost,
        failedStep: step,
        errorMessage: uxErr,
        uxMessage: [
          `Step ${stepNum} failed: ${step.service} returned an error.`,
          uxErr,
          chargeNotice,
        ]
          .filter(Boolean)
          .join("\n"),
      }
    }

    const stepCost = result.cost ?? 0
    results.push(result.result)
    totalCost += stepCost

  }

  return {
    success: true,
    results,
    totalCost,
    uxMessage: [
      `All ${steps.length} step${steps.length !== 1 ? "s" : ""} completed successfully.`,
      `Total charged: $${totalCost.toFixed(4)} USD`,
    ].join("\n"),
  }
}
