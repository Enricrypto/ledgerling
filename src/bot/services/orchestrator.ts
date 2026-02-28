/**
 * Critical adapter: bridges Ledgerling engine to bot's RunOrchestrator interface.
 *
 * The engine's executeSteps() is synchronous-sequential with no callback support.
 * This adapter manually loops through steps, calling fetchFn directly, and emits
 * onStep() callbacks for real-time progress updates in Telegram.
 */

import { classifyRequest } from "../../classifier/classifier.js";
import { defaultRegistry } from "../../registry/serviceRegistry.js";
import { buildFetchWithPayment } from "../../services/fetchWithPayment.js";
import { logger } from "../../utils/logger.js";
import type { TaskStep } from "../../classifier/classifier.js";
import type { FetchResult } from "../../services/fetchWithPayment.js";
import type {
  OrchestratorRequest,
  BotOrchestratorResult,
  StepUpdate,
} from "../types.js";

// Build fetch once at module load
let fetchFn: Awaited<ReturnType<typeof buildFetchWithPayment>> | null = null;

async function getFetchFn() {
  if (!fetchFn) fetchFn = await buildFetchWithPayment();
  return fetchFn;
}

const DEFAULT_STEP_TIMEOUT_MS = 30_000;

export async function runOrchestrator(
  request: OrchestratorRequest,
  onStep: (step: StepUpdate) => void,
): Promise<BotOrchestratorResult> {
  // 1. Classify
  const classification = classifyRequest(request.query);
  if (!classification.inScope || !classification.steps.length) {
    return {
      success: false,
      answer: "",
      totalCostUsd: 0,
      steps: [],
      error: classification.fallbackMessage ?? "Query not supported.",
    };
  }

  const steps = classification.steps;
  const totalSteps = steps.length;

  // 2. Emit "pending" for all steps
  steps.forEach((step, i) => {
    const config = defaultRegistry.get(step.service);
    onStep({
      stepIndex: i,
      totalSteps,
      status: "pending",
      service: step.service,
      action: config?.description ?? step.capability,
      costUsd: 0,
    });
  });

  // 3. Execute each step, emitting "paying" → "done"/"error"
  const fetch402 = await getFetchFn();
  const results: any[] = [];
  const stepUpdates: StepUpdate[] = [];
  let totalCost = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const config = defaultRegistry.get(step.service);
    const url =
      config?.url ?? `https://api.ledgerling.io/${step.service.toLowerCase()}`;

    logger.info(`Bot Step ${i + 1}/${totalSteps}: calling ${step.service}`, {
      url,
    });

    // Emit "paying"
    const update: StepUpdate = {
      stepIndex: i,
      totalSteps,
      status: "paying",
      service: step.service,
      action: config?.description ?? step.capability,
      costUsd: config?.estimatedCost ?? 0,
    };
    onStep(update);

    // Execute with timeout (replicate orchestrator.ts pattern)
    const fetchPromise = fetch402(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(step.query),
    });

    let stepTimerId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise: Promise<FetchResult> = new Promise<FetchResult>(
      (_, reject) => {
        stepTimerId = setTimeout(
          () =>
            reject(
              new Error(`Step timed out after ${DEFAULT_STEP_TIMEOUT_MS}ms`),
            ),
          DEFAULT_STEP_TIMEOUT_MS,
        );
      },
    );

    let result: FetchResult;
    try {
      result = await Promise.race([fetchPromise, timeoutPromise]);
    } catch (err: any) {
      result = { success: false, error: err.message ?? "Unknown error" };
    } finally {
      if (stepTimerId !== undefined) clearTimeout(stepTimerId);
    }

    if (result.success) {
      // Cost is in USD (from x402 receipt.amount)
      const costUsd = result.cost ?? 0;
      totalCost += costUsd;
      results.push(result.result);
      update.status = "done";
      update.costUsd = costUsd;

      // Extract tx hash from receipt (structure discovered at runtime)
      // x402 spec uses receipt.transaction or receipt.transactionHash
      if (result.receipt) {
        update.txHash =
          result.receipt.transactionHash ??
          result.receipt.transaction?.hash ??
          result.receipt.txHash ??
          result.receipt.tx;

        // Log receipt structure for debugging during first runs
        if (!update.txHash) {
          logger.warn("No txHash found in receipt", {
            receipt: result.receipt,
          });
        }
      }
    } else {
      update.status = "error";
      update.error = result.error;
      logger.error(`${step.service} failed`, { error: result.error });
    }

    stepUpdates.push({ ...update });
    onStep({ ...update });

    if (update.status === "error") {
      return {
        success: false,
        answer: "",
        totalCostUsd: totalCost,
        steps: stepUpdates,
        error: `${step.service} failed: ${update.error}`,
      };
    }
  }

  // 4. Compose answer from raw results
  const answer = composeAnswer(steps, results);

  return {
    success: true,
    answer,
    totalCostUsd: totalCost,
    steps: stepUpdates,
  };
}

/**
 * Template-based composition — extracts readable text from each service's
 * JSON response and concatenates into a coherent answer.
 */
function composeAnswer(steps: TaskStep[], results: any[]): string {
  if (!results.length) return "No results returned.";

  const parts = results.map((r, i) => {
    const service = steps[i].service;

    // Most x402 services return { content, data, text, result, ... }
    // Extract the most readable field
    let text: string;
    if (typeof r === "string") {
      text = r;
    } else if (r?.content && typeof r.content === "string") {
      text = r.content;
    } else if (r?.text && typeof r.text === "string") {
      text = r.text;
    } else if (r?.data && typeof r.data === "string") {
      text = r.data;
    } else if (r?.result) {
      text =
        typeof r.result === "string"
          ? r.result
          : JSON.stringify(r.result, null, 2);
    } else {
      text = JSON.stringify(r, null, 2);
    }

    // Add service attribution for multi-step queries
    if (steps.length > 1) {
      return `**${service}:**\n${text}`;
    }
    return text;
  });

  return parts.filter(Boolean).join("\n\n━━━━━━━━━━\n\n");
}
