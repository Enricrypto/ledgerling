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
import { config } from "../config.js";
import {
  OUT_OF_CREDITS_MESSAGE,
  STILL_WORKING_MESSAGE,
  ERROR_MESSAGE,
  queryCountMessage,
} from "../ui/messages.js";
import type { StepUpdate, OrchestratorRequest } from "../types.js";

// Track active queries to prevent concurrent runs per user
const activeQueries = new Set<string>();

export async function handleQuery(ctx: Context): Promise<void> {
  const userId = String(ctx.from?.id);
  const query = ctx.message?.text;

  if (!query) return;
  if (query.startsWith("/")) return; // Don't process commands as queries

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
    // Send initial progress message
    await ctx.replyWithChatAction("typing");
    const progressMsg = await ctx.reply("🧠 Planning your research...");
    const chatId = progressMsg.chat.id;
    const msgId = progressMsg.message_id;

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

    // Final progress update (ensure all steps shown as complete)
    try {
      const finalProgress = buildProgressMessage(steps, true);
      await ctx.api.editMessageText(chatId, msgId, finalProgress);
    } catch (e) {
      // Ignore edit failures
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

    // Optional: show query count milestone
    const milestone = queryCountMessage(session.queryCount);
    if (milestone) {
      await ctx.reply(milestone);
    }
  } catch (error: any) {
    console.error("Query handler error:", error);
    await ctx.reply(ERROR_MESSAGE);
  } finally {
    activeQueries.delete(userId);
  }
}
