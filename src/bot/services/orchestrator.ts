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
import {
  getOrCreateUserSigner,
  getSignerByAddress,
} from "../../services/userSigner.js";
import { pollImferenceResult } from "../../services/imferencePoller.js";
import { classifyError, uxMessageForError } from "../../utils/errorHandling.js";
import { logger } from "../../utils/logger.js";
import type { TaskStep } from "../../classifier/classifier.js";
import type { FetchResult } from "../../services/fetchWithPayment.js";
import type {
  OrchestratorRequest,
  BotOrchestratorResult,
  StepUpdate,
} from "../types.js";

// Bot pays for all x402 requests using a dedicated bot wallet.
// Priority: FIXED_ADDRESS (direct Openfort lookup) > BOT_USER_ID > "alma-bot"

// Build fetch once at module load
let fetchFn: Awaited<ReturnType<typeof buildFetchWithPayment>> | null = null;
let signerAddress: string | null = null;

async function getFetchFn() {
  if (!fetchFn) {
    const fixedAddr = process.env.FIXED_ADDRESS;
    let signer;

    if (fixedAddr) {
      // Use FIXED_ADDRESS directly from Openfort
      logger.info("Using FIXED_ADDRESS wallet", { address: fixedAddr });
      signer = await getSignerByAddress(fixedAddr);
    } else {
      // Fallback to BOT_USER_ID
      const userId = process.env.BOT_USER_ID ?? "alma-bot";
      logger.info("Using BOT_USER_ID wallet", { userId });
      signer = await getOrCreateUserSigner(userId);
    }

    signerAddress = signer.address;
    fetchFn = await buildFetchWithPayment(signer);
    logger.info("Bot wallet initialized", { address: signerAddress });
  }
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

  // Inject bot wallet address into steps that require the payer's address (e.g. Imference)
  const fetch402 = await getFetchFn();
  if (signerAddress) {
    for (const step of steps) {
      if (step.service === "Imference" && !step.query.address) {
        step.query.address = signerAddress;
      }
    }
  }

  // Log Imference payload for debugging
  for (const step of steps) {
    if (step.service === "Imference") {
      logger.info("Imference step query", {
        service: step.service,
        url: defaultRegistry.get("Imference")?.url,
        hasAddress: !!step.query.address,
        address: step.query.address as string | undefined,
        model: step.query.model as string | undefined,
        promptLength: (step.query.prompt as string)?.length ?? 0,
      });
    }
  }

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
  const results: any[] = [];
  const stepUpdates: StepUpdate[] = [];
  let totalCost = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const config = defaultRegistry.get(step.service);
    const url =
      config?.url ?? `https://api.ledgerling.io/${step.service.toLowerCase()}`;

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

    // Log outgoing request
    logger.info(`[x402] Sending request to ${step.service}`, {
      url,
      method: "POST",
      payloadKeys: Object.keys(step.query),
      payload: step.service === "Imference" ? step.query : undefined,
    });

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

    // Log response
    logger.info(`[x402] Response from ${step.service}`, {
      success: result.success,
      hasResult: !!result.result,
      error: result.error,
      resultType: typeof result.result,
      resultKeys:
        result.result && typeof result.result === "object"
          ? Object.keys(result.result)
          : undefined,
      fullResult: step.service === "Imference" ? result.result : undefined,
    });

    if (result.success) {
      // Cost is in USD (from x402 receipt.amount)
      const costUsd = result.cost ?? 0;
      totalCost += costUsd;

      // Imference is async: initial 200 returns { request_id }, image must be polled
      let stepResult = result.result;
      if (step.service === "Imference" && stepResult?.request_id) {
        const imageUrl = await pollImferenceResult(stepResult.request_id);
        stepResult = imageUrl ? { ...stepResult, url: imageUrl } : stepResult; // keep request_id so user can check manually
      }

      results.push(stepResult);
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
      }
    } else {
      update.status = "error";
      update.error = result.error;
    }

    stepUpdates.push({ ...update });
    onStep({ ...update });

    if (update.status === "error") {
      const errorKind = classifyError(update.error);
      return {
        success: false,
        answer: "",
        totalCostUsd: totalCost,
        steps: stepUpdates,
        error: uxMessageForError(errorKind, step.service),
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
