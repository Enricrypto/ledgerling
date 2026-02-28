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
import { estimateExecution } from "../../orchestrator/orchestrator.js";
import { findByName } from "../../registry/catalog.js";
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

    // Phase 3: Get cost estimation (no payment yet)
    await ctx.api.editMessageText(chatId, evalMsgId, "📝 Planning...");
    const msgId = evalMsgId;

    const estimation = await estimateExecution(classification.steps);

    // Phase 3b: Show planning preview (what will happen)
    const planningDescriptions: Record<string, string> = {
      Imference: "Generating AI image from description",
      "dTelecom STT": "Transcribing audio to text",
      Firecrawl: "Scraping webpage content",
      Minifetch: "Fetching URL content",
      Pinata: "Uploading to IPFS",
      Daydreams: "Running AI inference",
      BlackSwan: "Analyzing market data",
      SlamAI: "Analyzing smart money flows",
      Moltbook: "Generating digest",
    };

    const planLines: string[] = [];
    for (let i = 0; i < classification.steps.length; i++) {
      const step = classification.steps[i];
      const catalogEntry = findByName(step.service);
      const icon = catalogEntry?.icon ?? "⚡";
      const desc =
        planningDescriptions[step.service] ||
        catalogEntry?.description ||
        step.service;
      const price = estimation.stepCosts[i] ?? 0.01;
      planLines.push(`${icon} ${desc}... $${price.toFixed(2)}`);
    }

    const planningMsg = [
      "📝 Planning your request... ✔️",
      "",
      ...planLines,
    ].join("\n");
    await ctx.api.editMessageText(chatId, msgId, planningMsg);

    // Brief pause to let user see the plan
    await new Promise((r) => setTimeout(r, 1200));

    // Store pending plan in session
    const session = sessions.get(userId) ?? { userId, queryCount: 0 };
    session.pendingPlan = {
      query,
      steps: classification.steps,
      classification,
      estimatedCost: estimation.estimatedTotalCost,
      messageId: msgId,
      chatId,
      timestamp: Date.now(),
    };
    sessions.set(userId, session);

    // Show receipt with confirmation buttons
    const balance = getBalance(userId);
    const cost = estimation.estimatedTotalCost;
    const balanceAfter = Math.max(0, balance - cost);

    // Format items like a real receipt
    const items = classification.steps.map((step: any, i: number) => {
      const catalogEntry = findByName(step.service);
      const icon = catalogEntry?.icon ?? "⚡";
      const price = estimation.stepCosts[i] ?? 0.01;
      return `${icon} ${step.service} — $${price.toFixed(2)}`;
    });

    const receiptLines = [
      "🧾 **Confirm Purchase**",
      "",
      ...items,
      "",
      "━━━━━━━━━━━━━━━━━",
      `**Total: $${cost.toFixed(2)}**`,
    ];

    await ctx.api.editMessageText(chatId, msgId, receiptLines.join("\n"), {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Approve", callback_data: `confirm_payment:${userId}` },
            { text: "❌ Cancel", callback_data: `cancel_payment:${userId}` },
          ],
        ],
      },
    });

    activeQueries.delete(userId); // Allow user to do other things while deciding
  } catch {
    await ctx.reply(ERROR_MESSAGE);
  } finally {
    activeQueries.delete(userId);
  }
}
