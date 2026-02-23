import { classifyRequest, type ClassificationResult } from "../classifier/classifier.js"
import {
  estimateExecution,
  executeSteps,
  type FetchFn,
  type OrchestratorEstimation,
  type OrchestratorResult,
} from "../orchestrator/orchestrator.js"
import { type ServiceRegistry } from "../registry/serviceRegistry.js"
import { logger } from "../utils/logger.js"

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PipelineOptions {
  /**
   * Per-step payment timeout in milliseconds, passed to executeSteps.
   * Defaults to 30 000 ms. Set to 0 to disable.
   */
  stepTimeoutMs?: number
  /**
   * Service registry to use for URL and cost lookups.
   * Defaults to defaultRegistry.
   */
  registry?: ServiceRegistry
  /**
   * When true, run estimation and health checks but skip execution.
   * Useful for showing the user a cost preview before they approve.
   */
  dryRun?: boolean
  /**
   * When false (default), abort the pipeline if any service fails its
   * preflight health check. Set to true to attempt execution anyway.
   */
  continueOnUnhealthy?: boolean
}

export interface PipelineResult {
  query: string
  classification: ClassificationResult
  /** Populated for in-scope queries. Undefined if classification returned !inScope. */
  estimation?: OrchestratorEstimation
  /** Populated after execution (not present on dryRun or aborted runs). */
  execution?: OrchestratorResult
  /** True when execution was skipped intentionally (dryRun or aborted). */
  dryRun: boolean
  /**
   * Human-readable reason why execution was skipped or aborted.
   * Undefined on successful execution or dryRun with no issues.
   */
  abortedReason?: string
}

// ---------------------------------------------------------------------------
// runPipeline
// ---------------------------------------------------------------------------

/**
 * Full end-to-end Ledgerling pipeline:
 *   classify → preflight estimate → (optional) execute
 *
 * The function is safe to call without any live credentials when `dryRun: true`.
 *
 * @param userQuery - Natural language request from the user.
 * @param fetchFn   - x402-payment-enabled fetch, from buildFetchWithPayment().
 *                    Only called when not dryRun.
 * @param options   - Pipeline tuning options (see PipelineOptions).
 */
export async function runPipeline(
  userQuery: string,
  fetchFn: FetchFn,
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  const {
    stepTimeoutMs,
    registry,
    dryRun = false,
    continueOnUnhealthy = false,
  } = options

  // ── 1. Classify ────────────────────────────────────────────────────────────
  logger.info("Pipeline: classifying query", { query: userQuery })
  const classification = classifyRequest(userQuery)

  if (!classification.inScope || !classification.steps.length) {
    logger.warn("Pipeline: query out of scope", { query: userQuery })
    return {
      query: userQuery,
      classification,
      dryRun,
      abortedReason:
        classification.fallbackMessage ??
        "Your request doesn't match any available Ledgerling services.",
    }
  }

  // ── 2. Estimate ────────────────────────────────────────────────────────────
  logger.info("Pipeline: running preflight estimation", {
    steps: classification.steps.length,
  })
  const estimation = await estimateExecution(classification.steps, registry)

  // ── 3. Abort if unhealthy (unless overridden) ──────────────────────────────
  if (!continueOnUnhealthy && !estimation.healthy) {
    const services = estimation.unavailableServices.join(", ")
    logger.warn("Pipeline: aborting — unhealthy services", {
      unavailable: estimation.unavailableServices,
    })
    return {
      query: userQuery,
      classification,
      estimation,
      dryRun,
      abortedReason: `The following services appear unreachable: ${services}. Execution aborted.`,
    }
  }

  // ── 4. Dry-run exit ────────────────────────────────────────────────────────
  if (dryRun) {
    logger.info("Pipeline: dry-run complete", {
      estimatedCost: estimation.estimatedTotalCost,
    })
    return {
      query: userQuery,
      classification,
      estimation,
      dryRun: true,
    }
  }

  // ── 5. Execute ─────────────────────────────────────────────────────────────
  logger.info("Pipeline: starting execution", {
    steps: classification.steps.length,
    estimatedCost: estimation.estimatedTotalCost,
  })

  const execution = await executeSteps(classification.steps, fetchFn, {
    registry,
    stepTimeoutMs,
  })

  if (execution.success) {
    logger.info("Pipeline: execution complete", { totalCost: execution.totalCost })
  } else {
    logger.error("Pipeline: execution failed", {
      failedStep: execution.failedStep?.service,
      totalCost: execution.totalCost,
    })
  }

  return {
    query: userQuery,
    classification,
    estimation,
    execution,
    dryRun: false,
  }
}
