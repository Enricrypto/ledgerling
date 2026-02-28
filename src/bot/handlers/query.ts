/**
 * Main query handler — the core of the bot.
 *
 * Flow:
 * 1. Validate (prevent concurrent, check balance)
 * 2. Send initial progress message
 * 3. Call runOrchestrator with onStep callback (edits progress message)
 * 4. Deduct cost from balance
 * 5. Store session for receipt
 * 6. Send final result as NEW message (separate from progress)
 */

import type { Context } from "grammy";
import { runOrchestrator } from "../services/orchestrator.js";
import { buildProgressMessage } from "../ui/progress.js";
import { formatResult } from "../ui/formatter.js";
import { getBalance, deduct, formatBalance } from "../services/balance.js";
import { sessions } from "../services/sessions.js";
import { pendingPrompts } from "../services/prompts.js";
import { config } from "../config.js";
import { classifyRequest } from "../../classifier/classifier.js";
import {
  EVALUATING_MESSAGE,
  UNSUPPORTED_REQUEST_MESSAGE,
  OUT_OF_CREDITS_MESSAGE,
  STILL_WORKING_MESSAGE,
  ERROR_MESSAGE,
} from "../ui/messages.js";
import type { StepUpdate, OrchestratorRequest } from "../types.js";

// Track active queries to prevent concurrent runs per user
const activeQueries = new Set<string>();

export async function handleQuery(ctx: Context): Promise<void> {
  const userId = String(ctx.from?.id);
  let query = ctx.message?.text;

  if (!query) return;
  if (query.startsWith("/")) return; // Don't process commands as queries

  // Check for pending prompt and prepend trigger phrase
  const pendingService = pendingPrompts.get(userId);
  if (pendingService) {
    pendingPrompts.delete(userId);

    const triggerPhrases: Record<string, string> = {
      Imference: "generate image ",
      "dTelecom STT": "transcribe ",
      Pinata: "upload to ipfs ",
      Firecrawl: "scrape ",
      Minifetch: "fetch ",
    };

    const prefix = triggerPhrases[pendingService] || "";
    query = prefix + query;
  }

  // Prevent concurrent queries
  if (activeQueries.has(userId)) {
    await ctx.reply(STILL_WORKING_MESSAGE);
    return;
  }

  // Check balance
  const balance = getBalance(userId);
  if (balance < 0.01) {
    await ctx.reply(OUT_OF_CREDITS_MESSAGE);
    return;
  }

  activeQueries.add(userId);

  try {
    // Phase 1: Evaluate request
    await ctx.replyWithChatAction("typing");
    const evalMsg = await ctx.reply(EVALUATING_MESSAGE);
    const chatId = evalMsg.chat.id;
    const evalMsgId = evalMsg.message_id;

    // Classify request
    const classification = classifyRequest(query);

    // Phase 2: Gate - check if supported
    if (!classification.inScope || !classification.steps.length) {
      await ctx.api.editMessageText(
        chatId,
        evalMsgId,
        UNSUPPORTED_REQUEST_MESSAGE,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "Yes", callback_data: `services:yes:${userId}` },
                { text: "No", callback_data: `services:no:${userId}` },
              ],
            ],
          },
        },
      );
      activeQueries.delete(userId);
      return;
    }

    // Phase 3: Proceed with planning
    await ctx.api.editMessageText(chatId, evalMsgId, "Planning...");
    const msgId = evalMsgId;

    // Collect steps for real-time updates
    const steps: StepUpdate[] = [];
    let lastEditTime = 0;
    const EDIT_DEBOUNCE_MS = 400;

    const onStep = async (step: StepUpdate): Promise<void> => {
      steps[step.stepIndex] = step;

      // Debounce edits to avoid Telegram rate limits
      const now = Date.now();
      if (now - lastEditTime < EDIT_DEBOUNCE_MS) return;
      lastEditTime = now;

      try {
        const text = buildProgressMessage(steps);
        await ctx.api.editMessageText(chatId, msgId, text);
      } catch (e) {
        // Silently ignore edit failures (message unchanged, rate limit, etc.)
      }
    };

    // Run orchestrator
    const startTime = Date.now();
    const request: OrchestratorRequest = {
      query,
      userId,
      maxBudget: Math.min(balance, config.MAX_BUDGET_PER_QUERY),
    };
    const result = await runOrchestrator(request, onStep);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // Final progress update (only show "Done" if successful)
    if (result.success) {
      try {
        const finalProgress = buildProgressMessage(steps, true);
        await ctx.api.editMessageText(chatId, msgId, finalProgress);
      } catch (e) {
        // Ignore edit failures
      }
    } else {
      // On failure, delete the progress message to avoid confusion
      try {
        await ctx.api.deleteMessage(chatId, msgId);
      } catch (e) {
        // Ignore deletion failures
      }
    }

    // Deduct cost
    if (result.success) {
      deduct(userId, result.totalCostUsd);
    }

    // Update session
    const session = sessions.get(userId) ?? {
      userId,
      queryCount: 0,
    };
    session.lastQuery = query;
    session.lastResult = result;
    session.lastSteps = steps;
    session.queryCount++;
    sessions.set(userId, session);

    // Send result as NEW message (separate from progress)
    const resultText = formatResult(result, userId, elapsed);

    await ctx.reply(resultText, {
      parse_mode: "MarkdownV2",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📋 View receipt", callback_data: `receipt:${userId}` }],
        ],
      },
    });
  } catch (error: any) {
    console.error("Query handler error:", error);
    await ctx.reply(ERROR_MESSAGE);
  } finally {
    activeQueries.delete(userId);
  }
}
